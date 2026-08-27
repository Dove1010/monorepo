import { apiGet } from "./apiClient";

export type ScoreBand = "Poor" | "Fair" | "Good" | "Excellent";

export type ScoreFactorStatus = "pass" | "fail" | "warn";

export interface ScoreFactor {
  name: string;
  status: ScoreFactorStatus;
  weight: number;
  detail: string;
}

export interface CreditScoreSnapshot {
  score: number;
  band: ScoreBand;
  factors: ScoreFactor[];
  computedAt: string;
  tips: string[];
}

export interface ScoreHistoryPoint {
  month: string;
  score: number;
}

export interface CreditScoreHistoryResponse {
  history: {
    score: number;
    band: ScoreBand;
    computedAt: string;
  }[];
}

export async function getMyCreditScore(): Promise<CreditScoreSnapshot> {
  return apiGet<CreditScoreSnapshot>("/tenant/credit-score/my");
}

export async function getMyCreditScoreHistory(): Promise<CreditScoreHistoryResponse> {
  return apiGet<CreditScoreHistoryResponse>("/tenant/credit-score/my/history");
}
