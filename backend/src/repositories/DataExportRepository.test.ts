import { describe, it, expect } from "vitest";

describe("DataExportRepository", () => {
  async function getRepo() {
    const mod = await import("./DataExportRepository.js");
    return new mod.DataExportRepository();
  }

  it("creates export job", async () => {
    const repo = await getRepo();

    const job = await repo.createJob("user-1");

    expect(job.id).toBeDefined();
    expect(job.userId).toBe("user-1");
    expect(job.status).toBe("pending");
  });

  it("gets job by id", async () => {
    const repo = await getRepo();
    const created = await repo.createJob("user-1");

    const found = await repo.getJob(created.id);

    expect(found?.id).toBe(created.id);
  });

  it("gets job for user", async () => {
    const repo = await getRepo();
    const jobId = (await repo.createJob("user-1")).id;

    const found = await repo.getJobByIdForUser(jobId, "user-1");

    expect(found?.id).toBe(jobId);
  });

  it("prevents cross-user job access", async () => {
    const repo = await getRepo();
    const jobId = (await repo.createJob("user-1")).id;

    const found = await repo.getJobByIdForUser(jobId, "user-2");

    expect(found).toBeNull();
  });

  it("updates job status", async () => {
    const repo = await getRepo();
    const job = await repo.createJob("user-1");

    const updated = await repo.updateJob(job.id, {
      status: "ready",
      downloadUrl: "https://...",
    });

    expect(updated.status).toBe("ready");
  });

  it("returns null for missing job", async () => {
    const repo = await getRepo();

    const found = await repo.getJob("nonexistent");

    expect(found).toBeNull();
  });
});
