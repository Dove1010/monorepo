import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BackgroundCheckService } from "./backgroundCheckService.js";
import {
  initBackgroundCheckResultStore,
  InMemoryBackgroundCheckResultStore,
} from "../models/backgroundCheckResultStore.js";
import { getBackgroundCheckProvider } from "./backgroundCheck/BackgroundCheckFactory.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../errors/AppError.js";

vi.mock("./backgroundCheck/BackgroundCheckFactory.js");

const TENANT_ID = "tenant-1";
const OTHER_TENANT_ID = "tenant-2";
const EMPLOYER_NAME = "Acme Corp";
const BANK_ACCOUNT_REF = "0123456789";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeEmploymentResult(overrides: Partial<any> = {}) {
  return {
    verified: true,
    employerName: EMPLOYER_NAME,
    jobTitle: "Engineer",
    startDate: new Date("2020-01-01").toISOString(),
    employmentType: "full_time",
    monthlyIncome: 500000,
    verificationDate: new Date("2024-01-01").toISOString(),
    ...overrides,
  };
}

describe("BackgroundCheckService", () => {
  let store: InMemoryBackgroundCheckResultStore;
  let provider: {
    verifyEmployment: ReturnType<typeof vi.fn>;
    verifyIncome: ReturnType<typeof vi.fn>;
    verifyBankStatement: ReturnType<typeof vi.fn>;
  };

  function buildService(): BackgroundCheckService {
    return new BackgroundCheckService();
  }

  beforeEach(() => {
    store = new InMemoryBackgroundCheckResultStore();
    initBackgroundCheckResultStore(store);

    provider = {
      verifyEmployment: vi.fn(),
      verifyIncome: vi.fn(),
      verifyBankStatement: vi.fn(),
    };
    vi.mocked(getBackgroundCheckProvider).mockReturnValue(provider as any);

    vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("lifecycle", () => {
    it("moves a check from pending to a persisted, tenant-attributed result", async () => {
      const gate = deferred<ReturnType<typeof makeEmploymentResult>>();
      provider.verifyEmployment.mockReturnValue(gate.promise);

      const service = buildService();
      const runPromise = service.runFullCheck({
        tenantId: TENANT_ID,
        employerName: EMPLOYER_NAME,
      });

      // Allow the initial pending record to be persisted before resolving.
      await new Promise((r) => setTimeout(r, 0));
      const midFlight = await store.findLatestByTenantId(TENANT_ID);
      expect(midFlight?.overallStatus).toBe("pending");
      expect(midFlight?.tenantId).toBe(TENANT_ID);

      gate.resolve(makeEmploymentResult());
      const output = await runPromise;

      expect(output.overallStatus).toBe("completed");
      expect(output.tenantId).toBe(TENANT_ID);

      const persisted = await store.findById(output.id);
      expect(persisted?.overallStatus).toBe("completed");
      expect(persisted?.tenantId).toBe(TENANT_ID);
    });
  });

  describe("adverse-action gating", () => {
    it("allows the application to proceed when verification passes", async () => {
      provider.verifyEmployment.mockResolvedValue(
        makeEmploymentResult({ verified: true }),
      );

      const service = buildService();
      const output = await service.runFullCheck({
        tenantId: TENANT_ID,
        employerName: EMPLOYER_NAME,
      });

      expect(output.eligible).toBe(true);
      expect(output.adverseReasons).toEqual([]);
    });

    it("gates the application with a recorded reason on an adverse employment result", async () => {
      provider.verifyEmployment.mockResolvedValue(
        makeEmploymentResult({ verified: false, monthlyIncome: undefined }),
      );

      const service = buildService();
      const output = await service.runFullCheck({
        tenantId: TENANT_ID,
        employerName: EMPLOYER_NAME,
      });

      expect(output.eligible).toBe(false);
      expect(output.adverseReasons).toContain(
        "Employment could not be verified",
      );

      const persisted = await store.findById(output.id);
      expect(persisted?.verificationMetadata?.adverseReasons).toContain(
        "Employment could not be verified",
      );
    });

    it("gates the application on unstable income", async () => {
      provider.verifyIncome.mockResolvedValue({
        averageMonthlyIncome: 200000,
        incomeStability: "unstable",
        lastSalaryDate: new Date().toISOString(),
        transactionCount3m: 10,
        verificationDate: new Date().toISOString(),
      });

      const service = buildService();
      const output = await service.runFullCheck({
        tenantId: TENANT_ID,
        bankAccountRef: BANK_ACCOUNT_REF,
      });

      expect(output.eligible).toBe(false);
      expect(output.adverseReasons).toContain(
        "Income stability does not meet requirements",
      );
    });
  });

  describe("pending and timeout safety", () => {
    it("never falsely resolves as completed when the provider times out", async () => {
      vi.useFakeTimers();
      provider.verifyEmployment.mockReturnValue(new Promise(() => {})); // hangs

      const service = buildService();
      const runPromise = service.runFullCheck({
        tenantId: TENANT_ID,
        employerName: EMPLOYER_NAME,
      });
      const assertion = expect(runPromise).rejects.toThrow(AppError);

      await vi.advanceTimersByTimeAsync(15_001);
      await assertion;

      const persisted = await store.findLatestByTenantId(TENANT_ID);
      expect(persisted?.overallStatus).toBe("failed");
      expect(persisted?.overallStatus).not.toBe("completed");
    });

    it("marks the result failed (not falsely passing) on a provider error", async () => {
      provider.verifyEmployment.mockRejectedValue(
        new Error("provider unavailable"),
      );

      const service = buildService();

      await expect(
        service.runFullCheck({
          tenantId: TENANT_ID,
          employerName: EMPLOYER_NAME,
        }),
      ).rejects.toThrow(AppError);

      const persisted = await store.findLatestByTenantId(TENANT_ID);
      expect(persisted?.overallStatus).toBe("failed");
    });
  });

  describe("idempotency on re-run", () => {
    it("updates the existing result instead of creating a duplicate", async () => {
      provider.verifyEmployment.mockResolvedValue(
        makeEmploymentResult({ verified: false }),
      );

      const service = buildService();
      const first = await service.runFullCheck({
        tenantId: TENANT_ID,
        employerName: EMPLOYER_NAME,
      });
      expect(first.eligible).toBe(false);

      provider.verifyEmployment.mockResolvedValue(
        makeEmploymentResult({ verified: true }),
      );

      const second = await service.runFullCheck({
        tenantId: TENANT_ID,
        employerName: EMPLOYER_NAME,
        existingCheckId: first.id,
      });

      expect(second.id).toBe(first.id);
      expect(second.eligible).toBe(true);

      const allForTenant = await store.findByTenantId(TENANT_ID);
      expect(allForTenant).toHaveLength(1);
    });

    it("does not update a result owned by a different tenant", async () => {
      provider.verifyEmployment.mockResolvedValue(makeEmploymentResult());

      const service = buildService();
      const ownerCheck = await service.runFullCheck({
        tenantId: TENANT_ID,
        employerName: EMPLOYER_NAME,
      });

      const attempted = await service.runFullCheck({
        tenantId: OTHER_TENANT_ID,
        employerName: EMPLOYER_NAME,
        existingCheckId: ownerCheck.id,
      });

      expect(attempted.id).not.toBe(ownerCheck.id);
      expect(attempted.tenantId).toBe(OTHER_TENANT_ID);

      const allResults = await store.findByTenantId(TENANT_ID);
      expect(allResults).toHaveLength(1);
    });
  });

  describe("PII handling", () => {
    it("never logs raw employer name or bank account reference", async () => {
      provider.verifyEmployment.mockResolvedValue(makeEmploymentResult());
      provider.verifyIncome.mockResolvedValue({
        averageMonthlyIncome: 400000,
        incomeStability: "stable",
        lastSalaryDate: new Date().toISOString(),
        transactionCount3m: 20,
        verificationDate: new Date().toISOString(),
      });

      const service = buildService();
      await service.runFullCheck({
        tenantId: TENANT_ID,
        employerName: EMPLOYER_NAME,
        bankAccountRef: BANK_ACCOUNT_REF,
      });

      const allLogCalls = [
        ...vi.mocked(logger.info).mock.calls,
        ...vi.mocked(logger.warn).mock.calls,
        ...vi.mocked(logger.error).mock.calls,
      ];

      for (const call of allLogCalls) {
        const serialized = JSON.stringify(call);
        expect(serialized).not.toContain(EMPLOYER_NAME);
        expect(serialized).not.toContain(BANK_ACCOUNT_REF);
      }
    });
  });
});
