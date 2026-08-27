import { describe, expect, it, vi, beforeEach } from "vitest";
import { InspectorBondService, BondStatus } from "./inspectorBondService.js";
import { SorobanAdapter } from "../soroban/adapter.js";
import { AppError } from "../errors/AppError.js";
import { ErrorCode } from "../errors/errorCodes.js";

function createMockAdapter(
  overrides: Partial<SorobanAdapter> = {},
): SorobanAdapter {
  return {
    getBalance: vi.fn(),
    credit: vi.fn(),
    debit: vi.fn(),
    getStakedBalance: vi.fn(),
    getClaimableRewards: vi.fn(),
    recordReceipt: vi.fn(),
    getConfig: vi.fn() as any,
    getReceiptEvents: vi.fn() as any,
    getTimelockEvents: vi.fn() as any,
    executeTimelock: vi.fn() as any,
    cancelTimelock: vi.fn() as any,
    stakeBond: vi.fn(),
    unstakeBond: vi.fn(),
    isBonded: vi.fn(),
    getBond: vi.fn(),
    syncDealStatus: vi.fn() as any,
    ...overrides,
  } as SorobanAdapter;
}

describe("InspectorBondService", () => {
  let service: InspectorBondService;
  let mockAdapter: SorobanAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    service = new InspectorBondService(mockAdapter);
  });

  describe("assertBonded", () => {
    it("allows a bonded inspector with sufficient bond", async () => {
      vi.mocked(mockAdapter.isBonded).mockResolvedValue(true);
      vi.mocked(mockAdapter.getBond).mockResolvedValue({
        isBonded: true,
        amount: 100_000_000n,
      });

      await expect(service.assertBonded("inspector-ok")).resolves.toBeUndefined();
      expect(mockAdapter.isBonded).toHaveBeenCalledWith("inspector-ok");
    });

    it("denies an unbonded inspector", async () => {
      vi.mocked(mockAdapter.isBonded).mockResolvedValue(false);

      await expect(service.assertBonded("inspector-unbonded")).rejects.toMatchObject({
        name: "AppError",
        code: ErrorCode.INSPECTOR_NOT_BONDED,
        status: 403,
      });
    });

    it("denies an inspector with bond below minimum threshold", async () => {
      vi.mocked(mockAdapter.isBonded).mockResolvedValue(true);
      vi.mocked(mockAdapter.getBond).mockResolvedValue({
        isBonded: true,
        amount: 1n,
      });

      await expect(service.assertBonded("inspector-low-bond")).rejects.toMatchObject({
        name: "AppError",
        code: ErrorCode.INSPECTOR_NOT_BONDED,
        status: 403,
      });
    });

    it("fails safe (denies) when Soroban RPC is unavailable", async () => {
      const rpcError = new Error("RPC timeout: request timed out");
      vi.mocked(mockAdapter.isBonded).mockRejectedValue(rpcError);

      await expect(service.assertBonded("inspector-rpc-fail")).rejects.toMatchObject({
        name: "AppError",
        code: ErrorCode.CHAIN_UNAVAILABLE,
        status: 503,
      });
    });

    it("fails safe (denies) on transient RPC errors", async () => {
      const networkError = new Error("econnreset: connection reset");
      vi.mocked(mockAdapter.isBonded).mockRejectedValue(networkError);

      await expect(
        service.assertBonded("inspector-network-fail"),
      ).rejects.toMatchObject({
        name: "AppError",
        code: ErrorCode.CHAIN_UNAVAILABLE,
        status: 503,
      });
    });

    it("denies (INSPECTOR_NOT_BONDED) on non-transient adapter errors", async () => {
      const contractError = new Error("Contract not found");
      vi.mocked(mockAdapter.isBonded).mockRejectedValue(contractError);

      await expect(
        service.assertBonded("inspector-contract-error"),
      ).rejects.toMatchObject({
        name: "AppError",
        code: ErrorCode.INSPECTOR_NOT_BONDED,
        status: 403,
      });
    });

    it("uses cached bond status within TTL", async () => {
      vi.mocked(mockAdapter.isBonded).mockResolvedValue(true);
      vi.mocked(mockAdapter.getBond).mockResolvedValue({
        isBonded: true,
        amount: 100_000_000n,
      });

      await service.assertBonded("inspector-cached");
      await service.assertBonded("inspector-cached");

      expect(mockAdapter.isBonded).toHaveBeenCalledTimes(1);
    });
  });

  describe("getStatus", () => {
    it("returns bond status for a bonded inspector", async () => {
      vi.mocked(mockAdapter.getBond).mockResolvedValue({
        isBonded: true,
        amount: 200_000_000n,
      });

      const status = await service.getStatus("inspector-status-ok");
      expect(status.isBonded).toBe(true);
      expect(status.amount).toBe("200000000");
    });

    it("returns bond status for an unbonded inspector", async () => {
      vi.mocked(mockAdapter.getBond).mockResolvedValue({
        isBonded: false,
        amount: 0n,
      });

      const status = await service.getStatus("inspector-status-unbonded");
      expect(status.isBonded).toBe(false);
      expect(status.amount).toBe("0");
    });

    it("returns cached status when available", async () => {
      vi.mocked(mockAdapter.getBond).mockResolvedValue({
        isBonded: true,
        amount: 100_000_000n,
      });

      await service.getStatus("inspector-cached-status");
      await service.getStatus("inspector-cached-status");

      expect(mockAdapter.getBond).toHaveBeenCalledTimes(1);
    });
  });

  describe("stake", () => {
    it("stakes a bond for the inspector", async () => {
      vi.mocked(mockAdapter.stakeBond).mockResolvedValue(undefined);

      await service.stake("inspector-stake", 500_000_000n);
      expect(mockAdapter.stakeBond).toHaveBeenCalledWith("inspector-stake", 500_000_000n);
    });

    it("rejects zero or negative amounts", async () => {
      await expect(service.stake("inspector-stake", 0n)).rejects.toMatchObject({
        name: "AppError",
        code: ErrorCode.VALIDATION_ERROR,
        status: 400,
      });
      await expect(service.stake("inspector-stake", -1n)).rejects.toMatchObject({
        name: "AppError",
        code: ErrorCode.VALIDATION_ERROR,
        status: 400,
      });
    });
  });

  describe("unstake", () => {
    it("unstakes a bonded inspector", async () => {
      vi.mocked(mockAdapter.isBonded).mockResolvedValue(true);
      vi.mocked(mockAdapter.unstakeBond).mockResolvedValue(undefined);

      await service.unstake("inspector-unstake");
      expect(mockAdapter.unstakeBond).toHaveBeenCalledWith("inspector-unstake");
    });

    it("rejects unstaking when inspector has no bond", async () => {
      vi.mocked(mockAdapter.isBonded).mockResolvedValue(false);
      vi.mocked(mockAdapter.unstakeBond).mockResolvedValue(undefined);

      await expect(service.unstake("inspector-no-bond")).rejects.toMatchObject({
        name: "AppError",
        code: ErrorCode.INSPECTOR_NOT_BONDED,
        status: 400,
      });
      expect(mockAdapter.unstakeBond).not.toHaveBeenCalled();
    });
  });

  describe("getMinBondAmount", () => {
    it("returns the configured minimum bond amount", () => {
      const minBond = service.getMinBondAmount();
      expect(minBond).toBeGreaterThan(0n);
    });
  });

  describe("clearCache", () => {
    it("clears cache for a specific inspector", async () => {
      vi.mocked(mockAdapter.isBonded).mockResolvedValue(true);
      vi.mocked(mockAdapter.getBond).mockResolvedValue({
        isBonded: true,
        amount: 100_000_000n,
      });

      await service.assertBonded("inspector-clear");
      service.clearCache("inspector-clear");
      await service.assertBonded("inspector-clear");

      expect(mockAdapter.isBonded).toHaveBeenCalledTimes(2);
    });

    it("clears entire cache", async () => {
      vi.mocked(mockAdapter.isBonded).mockResolvedValue(true);
      vi.mocked(mockAdapter.getBond).mockResolvedValue({
        isBonded: true,
        amount: 100_000_000n,
      });

      await service.assertBonded("inspector-clear-all");
      service.clearCache();
      await service.assertBonded("inspector-clear-all");

      expect(mockAdapter.isBonded).toHaveBeenCalledTimes(2);
    });
  });
});
