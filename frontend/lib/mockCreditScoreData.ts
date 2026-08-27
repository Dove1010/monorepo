export type ScoreBand = "Poor" | "Fair" | "Good" | "Excellent";

export type ScoreFactorStatus = "pass" | "fail";

export interface ScoreFactor {
  name: string;
  status: ScoreFactorStatus;
  weight: number;
}

export interface ScoreHistoryPoint {
  month: string;
  score: number;
}

export interface CreditScoreProfile {
  score: number;
  band: ScoreBand;
  factors: ScoreFactor[];
  history: ScoreHistoryPoint[];
  tips: string[];
}

export function getScoreBand(score: number): ScoreBand {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 45) return "Fair";
  return "Poor";
}

export function buildImprovementTips(factors: ScoreFactor[]): string[] {
  const failing = factors.filter((f) => f.status === "fail");
  const tips: string[] = [];

  for (const factor of failing) {
    const points = Math.max(5, Math.round(factor.weight * 0.6));
    switch (factor.name) {
      case "KYC verification":
        tips.push(
          `Complete your KYC verification to improve your score by ~${points} points.`,
        );
        break;
      case "Employment letter":
        tips.push(
          `Upload your employment letter to improve your score by ~${points} points.`,
        );
        break;
      case "Bank statement consistency":
        tips.push(
          `Provide 3 months of consistent bank statements to gain ~${points} points.`,
        );
        break;
      case "Payment history":
        tips.push(
          `Make on-time rent payments for the next 2 months to gain ~${points} points.`,
        );
        break;
      case "Debt-to-income ratio":
        tips.push(
          `Reduce outstanding debt or increase declared income to improve by ~${points} points.`,
        );
        break;
      default:
        tips.push(
          `Address "${factor.name}" to improve your score by ~${points} points.`,
        );
    }
  }

  if (tips.length === 0) {
    tips.push(
      "Great work — all factors are passing. Keep your documents up to date to maintain your score.",
    );
  }

  return tips;
}

const BASE_FACTORS: ScoreFactor[] = [
  { name: "KYC verification", status: "pass", weight: 20 },
  { name: "Employment letter", status: "fail", weight: 18 },
  { name: "Bank statement consistency", status: "pass", weight: 16 },
  { name: "Payment history", status: "pass", weight: 15 },
  { name: "Debt-to-income ratio", status: "fail", weight: 14 },
  { name: "Residential stability", status: "pass", weight: 10 },
  { name: "Reference check", status: "pass", weight: 7 },
];

export function getMockCreditScoreProfile(): CreditScoreProfile {
  const score = 72;
  const factors = BASE_FACTORS;
  return {
    score,
    band: getScoreBand(score),
    factors,
    history: [
      { month: "Dec 2025", score: 58 },
      { month: "Jan 2026", score: 61 },
      { month: "Feb 2026", score: 64 },
      { month: "Mar 2026", score: 67 },
      { month: "Apr 2026", score: 70 },
      { month: "May 2026", score: 72 },
    ],
    tips: buildImprovementTips(factors),
  };
}