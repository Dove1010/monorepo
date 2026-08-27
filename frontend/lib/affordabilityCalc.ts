export type EmploymentStatus = "employed" | "self-employed" | "contract" | "student"
export type EligibilityBand = "strong" | "moderate" | "low"

export type AffordabilityInput = {
  monthlyNetIncome: number
  monthlyRent: number
  employmentStatus: EmploymentStatus
  depositPercentage: number
  minDepositRequired: number
}

export type AffordabilityResult = {
  incomePass: boolean
  incomeRatio: number
  employmentBand: EligibilityBand
  depositPass: boolean
  overallBand: EligibilityBand
}

const EMPLOYMENT_BANDS: Record<EmploymentStatus, EligibilityBand> = {
  employed: "strong",
  "self-employed": "moderate",
  contract: "moderate",
  student: "low",
}

const RATIO_THRESHOLD = 0.4
const DEPOSIT_MIN_PCT = 0.2

export function calculateAffordability(input: AffordabilityInput): AffordabilityResult {
  const incomeRatio = input.monthlyNetIncome > 0
    ? input.monthlyRent / input.monthlyNetIncome
    : Infinity

  const incomePass = incomeRatio <= RATIO_THRESHOLD
  const employmentBand = EMPLOYMENT_BANDS[input.employmentStatus]

  const effectiveMinDeposit = input.minDepositRequired > 0
    ? input.minDepositRequired
    : DEPOSIT_MIN_PCT * input.monthlyRent * 12

  const depositPass = input.depositPercentage >= effectiveMinDeposit

  const score =
    (incomePass ? 2 : 0) +
    (employmentBand === "strong" ? 2 : employmentBand === "moderate" ? 1 : 0) +
    (depositPass ? 2 : 0)

  const overallBand: EligibilityBand = score >= 5 ? "strong" : score >= 3 ? "moderate" : "low"

  return { incomePass, incomeRatio, employmentBand, depositPass, overallBand }
}

export function getOverallLabel(band: EligibilityBand): string {
  switch (band) {
    case "strong": return "You're likely to qualify — apply now"
    case "moderate": return "You may qualify — complete KYC to improve your chances"
    case "low": return "Consider saving more before applying"
  }
}
