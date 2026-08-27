import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMyCreditScore, getMyCreditScoreHistory } from "../creditScoreApi";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiGet } from "../apiClient";

describe("getMyCreditScore", () => {
  it("fetches credit score from correct endpoint", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      score: 720,
      band: "Good",
      factors: [
        { name: "Payment History", status: "pass", weight: 0.35, detail: "All payments on time" },
      ],
      computedAt: "2025-06-01T00:00:00Z",
      tips: ["Keep utilization below 30%"],
    });

    const result = await getMyCreditScore();

    expect(apiGet).toHaveBeenCalledWith("/tenant/credit-score/my");
    expect(result.score).toBe(720);
    expect(result.band).toBe("Good");
    expect(result.factors).toHaveLength(1);
    expect(result.tips).toContain("Keep utilization below 30%");
  });

  it("handles low credit score", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      score: 350,
      band: "Poor",
      factors: [],
      computedAt: "2025-06-01T00:00:00Z",
      tips: [],
    });

    const result = await getMyCreditScore();
    expect(result.band).toBe("Poor");
  });

  it("handles Excellent band", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      score: 850,
      band: "Excellent",
      factors: [],
      computedAt: "2025-06-01T00:00:00Z",
      tips: [],
    });

    const result = await getMyCreditScore();
    expect(result.band).toBe("Excellent");
  });
});

describe("getMyCreditScoreHistory", () => {
  it("fetches credit score history", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      history: [
        { score: 680, band: "Fair", computedAt: "2025-01-01" },
        { score: 720, band: "Good", computedAt: "2025-02-01" },
      ],
    });

    const result = await getMyCreditScoreHistory();

    expect(apiGet).toHaveBeenCalledWith("/tenant/credit-score/my/history");
    expect(result.history).toHaveLength(2);
    expect(result.history[0].score).toBe(680);
    expect(result.history[1].score).toBe(720);
  });

  it("handles empty history", async () => {
    vi.mocked(apiGet).mockResolvedValue({ history: [] });

    const result = await getMyCreditScoreHistory();
    expect(result.history).toEqual([]);
  });
});

describe("error handling", () => {
  it("propagates errors from getMyCreditScore", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("Unauthorized"));
    await expect(getMyCreditScore()).rejects.toThrow("Unauthorized");
  });

  it("propagates errors from getMyCreditScoreHistory", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("Server Error"));
    await expect(getMyCreditScoreHistory()).rejects.toThrow("Server Error");
  });
});
