import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { errorHandler } from "../middleware/errorHandler.js";
import { backgroundCheckRouter } from "./backgroundCheck.js";
import {
  initBackgroundCheckResultStore,
  InMemoryBackgroundCheckResultStore,
} from "../models/backgroundCheckResultStore.js";
import { getBackgroundCheckProvider } from "../services/backgroundCheck/BackgroundCheckFactory.js";
import { logger } from "../utils/logger.js";

const authState = vi.hoisted(() => ({
  mode: "authenticated" as "authenticated" | "no-token",
  user: {
    id: "admin-user-1",
    email: "admin@example.com",
    name: "Admin",
    role: "admin" as string,
  },
}));

vi.mock("../middleware/auth.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../middleware/auth.js")>();
  const { AppError } = await import("../errors/AppError.js");
  const { ErrorCode } = await import("../errors/errorCodes.js");
  return {
    ...original,
    authenticateToken: (req: any, _res: any, next: any) => {
      if (authState.mode === "no-token") {
        next(new AppError(ErrorCode.UNAUTHORIZED, 401, "Authentication token required"));
        return;
      }
      req.user = authState.user;
      next();
    },
  };
});

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.requestId = "test-request-id";
    next();
  });
  app.use("/api/admin", backgroundCheckRouter);
  app.use(errorHandler);
  return app;
}

describe("Background Check Routes", () => {
  let store: InMemoryBackgroundCheckResultStore;
  let provider: ReturnType<typeof getBackgroundCheckProvider>;

  beforeEach(() => {
    store = new InMemoryBackgroundCheckResultStore();
    initBackgroundCheckResultStore(store);

    provider = getBackgroundCheckProvider();
    vi.spyOn(provider, "verifyEmployment").mockResolvedValue({
      verified: true,
      employerName: "Acme Corp",
      jobTitle: "Engineer",
      startDate: new Date("2020-01-01").toISOString(),
      employmentType: "full_time",
      monthlyIncome: 500000,
      verificationDate: new Date("2024-01-01").toISOString(),
    });
    vi.spyOn(provider, "verifyIncome").mockResolvedValue({
      averageMonthlyIncome: 500000,
      incomeStability: "stable",
      lastSalaryDate: new Date("2024-01-01").toISOString(),
      transactionCount3m: 30,
      verificationDate: new Date("2024-01-01").toISOString(),
    });
    vi.spyOn(provider, "verifyBankStatement").mockResolvedValue({
      averageBalance: 400000,
      monthlyInflow: 550000,
      monthlyOutflow: 350000,
      overdraftCount: 0,
      statementPeriod: {
        startDate: new Date("2023-08-01").toISOString(),
        endDate: new Date("2024-01-01").toISOString(),
      },
      verificationDate: new Date("2024-01-01").toISOString(),
    });

    authState.mode = "authenticated";
    authState.user = { id: "admin-user-1", email: "admin@example.com", name: "Admin", role: "admin" };

    vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // POST /tenants/:tenantId/background-check
  // ---------------------------------------------------------------------------
  describe("POST /api/admin/tenants/:tenantId/background-check", () => {
    it("runs employment, income and bank checks and returns a completed, eligible result", async () => {
      const res = await request(buildApp())
        .post("/api/admin/tenants/tenant-1/background-check")
        .send({
          employerName: "Acme Corp",
          bankAccountRef: "0123456789",
          statementFile: "statement.pdf",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenantId).toBe("tenant-1");
      expect(res.body.data.overallStatus).toBe("completed");
      expect(res.body.data.eligible).toBe(true);
      expect(res.body.data.adverseReasons).toEqual([]);
      expect(provider.verifyEmployment).toHaveBeenCalledWith("tenant-1", "Acme Corp", undefined);
      expect(provider.verifyIncome).toHaveBeenCalledWith("tenant-1", "0123456789");
      expect(provider.verifyBankStatement).toHaveBeenCalledWith("tenant-1", "statement.pdf");
    });

    it("marks the result ineligible with adverse reasons when employment cannot be verified", async () => {
      vi.mocked(provider.verifyEmployment).mockResolvedValue({
        verified: false,
        employerName: "Acme Corp",
        jobTitle: "Engineer",
        startDate: new Date("2020-01-01").toISOString(),
        employmentType: "full_time",
        verificationDate: new Date("2024-01-01").toISOString(),
      });

      const res = await request(buildApp())
        .post("/api/admin/tenants/tenant-1/background-check")
        .send({ employerName: "Acme Corp", skipIncome: true, skipBankStatement: true });

      expect(res.status).toBe(201);
      expect(res.body.data.eligible).toBe(false);
      expect(res.body.data.adverseReasons).toContain("Employment could not be verified");
    });

    it("respects skip flags and only runs the requested verification types", async () => {
      const res = await request(buildApp())
        .post("/api/admin/tenants/tenant-1/background-check")
        .send({ bankAccountRef: "0123456789", skipIncome: false, skipEmployment: true, skipBankStatement: true });

      expect(res.status).toBe(201);
      expect(provider.verifyEmployment).not.toHaveBeenCalled();
      expect(provider.verifyIncome).toHaveBeenCalledWith("tenant-1", "0123456789");
      expect(provider.verifyBankStatement).not.toHaveBeenCalled();
      expect(res.body.data.incomeVerification).toBeDefined();
      expect(res.body.data.employmentVerification).toBeUndefined();
    });

    it("rejects a request that requests no verification type at all", async () => {
      const res = await request(buildApp())
        .post("/api/admin/tenants/tenant-1/background-check")
        .send({ skipEmployment: true, skipIncome: true, skipBankStatement: true });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 503 when the employment verification provider fails", async () => {
      vi.mocked(provider.verifyEmployment).mockRejectedValue(new Error("provider timeout"));

      const res = await request(buildApp())
        .post("/api/admin/tenants/tenant-1/background-check")
        .send({ employerName: "Acme Corp" });

      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe("EXTERNAL_SERVICE_ERROR");

      const latest = await store.findLatestByTenantId("tenant-1");
      expect(latest?.overallStatus).toBe("failed");
    });

    it("rejects an unauthenticated request", async () => {
      authState.mode = "no-token";

      const res = await request(buildApp())
        .post("/api/admin/tenants/tenant-1/background-check")
        .send({ employerName: "Acme Corp" });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(provider.verifyEmployment).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /tenants/:tenantId/background-check
  // ---------------------------------------------------------------------------
  describe("GET /api/admin/tenants/:tenantId/background-check", () => {
    it("returns the latest background check for a tenant", async () => {
      await request(buildApp())
        .post("/api/admin/tenants/tenant-2/background-check")
        .send({ employerName: "Acme Corp" });

      const res = await request(buildApp()).get("/api/admin/tenants/tenant-2/background-check");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenantId).toBe("tenant-2");
    });

    it("returns 404 when the tenant has no background check on record", async () => {
      const res = await request(buildApp()).get("/api/admin/tenants/no-such-tenant/background-check");

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("rejects an unauthenticated request", async () => {
      authState.mode = "no-token";

      const res = await request(buildApp()).get("/api/admin/tenants/tenant-2/background-check");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ---------------------------------------------------------------------------
  // GET /background-check/:checkId
  // ---------------------------------------------------------------------------
  describe("GET /api/admin/background-check/:checkId", () => {
    it("returns a background check by id", async () => {
      const created = await store.create({
        tenantId: "tenant-3",
        overallStatus: "completed",
        provider: "mock",
      });

      const res = await request(buildApp()).get(`/api/admin/background-check/${created.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(created.id);
    });

    it("returns 404 for an unknown check id", async () => {
      const res = await request(buildApp()).get("/api/admin/background-check/does-not-exist");

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("rejects an unauthenticated request", async () => {
      authState.mode = "no-token";

      const res = await request(buildApp()).get("/api/admin/background-check/does-not-exist");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ---------------------------------------------------------------------------
  // GET /applications/:applicationId/background-checks
  // ---------------------------------------------------------------------------
  describe("GET /api/admin/applications/:applicationId/background-checks", () => {
    it("returns all background checks for an application", async () => {
      await store.create({
        tenantId: "tenant-4",
        applicationId: "app-1",
        overallStatus: "completed",
        provider: "mock",
      });
      await store.create({
        tenantId: "tenant-5",
        applicationId: "app-1",
        overallStatus: "pending",
        provider: "mock",
      });
      await store.create({
        tenantId: "tenant-6",
        applicationId: "app-other",
        overallStatus: "completed",
        provider: "mock",
      });

      const res = await request(buildApp()).get("/api/admin/applications/app-1/background-checks");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.total).toBe(2);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((c: any) => c.applicationId === "app-1")).toBe(true);
    });

    it("returns an empty list when the application has no background checks", async () => {
      const res = await request(buildApp()).get("/api/admin/applications/no-such-app/background-checks");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it("rejects an unauthenticated request", async () => {
      authState.mode = "no-token";

      const res = await request(buildApp()).get("/api/admin/applications/app-1/background-checks");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });
});
