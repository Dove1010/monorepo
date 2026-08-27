import { apiFetch } from "./api";


export interface HealthResponse {
  status: string;
  version: string;
  uptimeSeconds: number;
}

export interface StakingPositionReponse {
  success: boolean;
  position: {
    staked: string;
    claimable: string;
    warming: string;
    cooling: string;
    lockExpiry?: string;
  }
}

export interface MvpStakingPositionResponse {
  success: boolean;
  position: {
    staked: string;
    used: string;
    unused: string;
    claimable: string;
  };
}


export interface TxResponse {
  success: boolean
  outboxId: string
  txId: string
  status: "CONFIRMED" | "QUEUED"
  message: string
}

export function getHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}


export function getStakingPosition(walletAddress?: string | null): Promise<StakingPositionReponse> {
  const headers: Record<string, string> = {};
  if (walletAddress) {
    headers["x-wallet-address"] = walletAddress;
  }
  return apiFetch<StakingPositionReponse>("/api/staking/position", { headers });
}

export function getMvpStakingPosition(walletAddress?: string | null): Promise<MvpStakingPositionResponse> {
  const headers: Record<string, string> = {};
  if (walletAddress) headers["x-wallet-address"] = walletAddress;
  return apiFetch<MvpStakingPositionResponse>("/api/staking/mvp-position", { headers });
}


export function stakeTokens(amountUsdc: string, walletAddress?: string | null): Promise<TxResponse> {
  const headers: Record<string, string> = {};
  if (walletAddress) {
    headers["x-wallet-address"] = walletAddress;
  }
  return apiFetch("/api/staking/stake", {
    method: "POST",
    headers,
    body: JSON.stringify({
      amountUsdc,
      externalRefSource: "web",
      externalRef: crypto.randomUUID()
    })
  })
}

export function unstakeTokens(amountUsdc: string, walletAddress?: string | null): Promise<TxResponse> {
  const headers: Record<string, string> = {};
  if (walletAddress) {
    headers["x-wallet-address"] = walletAddress;
  }
  return apiFetch("/api/staking/unstake", {
    method: "POST",
    headers,
    body: JSON.stringify({
      amountUsdc,
      externalRefSource: "web",
      externalRef: crypto.randomUUID()
    })
  })
}

export function claimRewards(walletAddress?: string | null): Promise<TxResponse> {
  const headers: Record<string, string> = {};
  if (walletAddress) {
    headers["x-wallet-address"] = walletAddress;
  }
  return apiFetch("/api/staking/claim", {
    method: "POST",
    headers,
    body: JSON.stringify({
      externalRefSource: "web",
      externalRef: crypto.randomUUID()
    })
  })
}

export interface StakeFromNgnBalanceResponse extends TxResponse {
  conversionId?: string;
  amountUsdc?: string;
  amountNgn?: number;
}

export interface StakingQuote {
  quoteId: string;
  amountNgn: number;
  estimatedAmountUsdc: string;
  fxRateNgnPerUsdc: number;
  feesNgn: number;
  expiresAt: string;
  disclaimer: string;
}

export interface StakeNgnResponse {
  success: boolean;
  conversionId?: string;
  amountUsdc?: string;
  fxRateNgnPerUsdc?: number;
  outboxId?: string;
  txId?: string;
  status?: string;
  message: string;
}

export function stakeFromNgnBalance(amountNgn: number): Promise<StakeFromNgnBalanceResponse> {
  return apiFetch("/api/staking/stake_from_ngn_balance", {
    method: "POST",
    body: JSON.stringify({
      amountNgn
    })
  })
}

export function getStakingQuote(amountNgn: number, paymentRail: string = "bank_transfer"): Promise<StakingQuote> {
  return apiFetch("/api/staking/quote", {
    method: "POST",
    body: JSON.stringify({
      amountNgn,
      paymentRail
    })
  })
}

export function stakeNgn(amountNgn: number, externalRefSource: string = "web", externalRef?: string): Promise<StakeNgnResponse> {
  return apiFetch("/api/staking/stake-ngn", {
    method: "POST",
    body: JSON.stringify({
      amountNgn,
      externalRefSource,
      externalRef: externalRef || crypto.randomUUID()
    })
  })
}

export interface StakingHistoryItem {
  txId: string;
  txType: "STAKE" | "UNSTAKE" | "STAKE_REWARD_CLAIM";
  amountUsdc: string | number;
  amountNgn?: string | number;
  fxRate?: string | number;
  indexedAt: string;
}

export interface StakingHistoryResponse {
  success: boolean;
  history: StakingHistoryItem[];
}

export function getStakingHistory(walletAddress?: string | null): Promise<StakingHistoryResponse> {
  const headers: Record<string, string> = {};
  if (walletAddress) {
    headers["x-wallet-address"] = walletAddress;
  }
  return apiFetch<StakingHistoryResponse>("/api/staking/history", { headers });
}

/**
 * Delegated staking (stake_delegation contract, #1489).
 *
 * This is a *separate* on-chain ledger from the staking_pool position returned
 * by getStakingPosition — the two are never summed or displayed as one figure.
 */

export interface DelegationRow {
  delegatee: string;
  amountUsdc: string;
  activatedEpoch: number;
}

export interface DelegationPositionResponse {
  success: boolean;
  position: {
    staked: string;
    delegated: string;
    free: string;
    currentEpoch: number;
    delegations: DelegationRow[];
  };
}

export interface DelegateeEarningsResponse {
  success: boolean;
  delegatee: string;
  earnings: {
    claimable: string;
    commissionClaimable: string;
  };
}

export interface DelegationTxResponse {
  success: boolean;
  txHash: string;
  message?: string;
}

function walletHeaders(walletAddress?: string | null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (walletAddress) headers["x-wallet-address"] = walletAddress;
  return headers;
}

export function getDelegationPosition(
  walletAddress?: string | null,
): Promise<DelegationPositionResponse> {
  return apiFetch<DelegationPositionResponse>("/api/staking/delegation/position", {
    headers: walletHeaders(walletAddress),
  });
}

export function getDelegateeEarnings(
  walletAddress?: string | null,
): Promise<DelegateeEarningsResponse> {
  return apiFetch<DelegateeEarningsResponse>("/api/staking/delegation/delegatee-earnings", {
    headers: walletHeaders(walletAddress),
  });
}

export function delegateStake(
  delegatee: string,
  amountUsdc: string,
  walletAddress?: string | null,
): Promise<DelegationTxResponse> {
  return apiFetch("/api/staking/delegation/delegate", {
    method: "POST",
    headers: walletHeaders(walletAddress),
    body: JSON.stringify({ delegatee, amountUsdc }),
  });
}

export function requestUndelegate(
  delegatee: string,
  amountUsdc: string,
  walletAddress?: string | null,
): Promise<DelegationTxResponse> {
  return apiFetch("/api/staking/delegation/undelegate/request", {
    method: "POST",
    headers: walletHeaders(walletAddress),
    body: JSON.stringify({ delegatee, amountUsdc }),
  });
}

export function completeUndelegate(
  delegatee: string,
  walletAddress?: string | null,
): Promise<DelegationTxResponse> {
  return apiFetch("/api/staking/delegation/undelegate/complete", {
    method: "POST",
    headers: walletHeaders(walletAddress),
    body: JSON.stringify({ delegatee }),
  });
}

export function setDelegateeCommission(
  rateBps: number,
  walletAddress?: string | null,
): Promise<DelegationTxResponse & { rateBps: number }> {
  return apiFetch("/api/staking/delegation/commission", {
    method: "POST",
    headers: walletHeaders(walletAddress),
    body: JSON.stringify({ rateBps }),
  });
}

export function claimDelegateeRewards(
  walletAddress?: string | null,
): Promise<DelegationTxResponse> {
  return apiFetch("/api/staking/delegation/claim-rewards", {
    method: "POST",
    headers: walletHeaders(walletAddress),
  });
}

export function claimDelegateeCommission(
  walletAddress?: string | null,
): Promise<DelegationTxResponse> {
  return apiFetch("/api/staking/delegation/claim-commission", {
    method: "POST",
    headers: walletHeaders(walletAddress),
  });
}
