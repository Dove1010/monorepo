import { describe, it, expect } from "vitest";
import { calculateAffordability, getOverallLabel, type AffordabilityInput } from "../affordabilityCalc";

function makeInput(overrides: Partial<AffordabilityInput> = {}): AffordabilityInput {
  return {
    monthlyNetIncome: 500_000,
    monthlyRent: 150_000,
    employmentStatus: "employed",
    depositPercentage: 200_000,
    minDepositRequired: 0,
    ...overrides,
  };
}

describe("calculateAffordability", () => {
  describe("income ratio", () => {
    it("passes when rent is ≤ 40% of income", () => {
      const result = calculateAffordability(makeInput({ monthlyNetIncome: 500_000, monthlyRent: 200_000 }));
      expect(result.incomePass).toBe(true);
      expect(result.incomeRatio).toBeCloseTo(0.4);
    });

    it("fails when rent is > 40% of income", () => {
      const result = calculateAffordability(makeInput({ monthlyNetIncome: 500_000, monthlyRent: 201_000 }));
      expect(result.incomePass).toBe(false);
      expect(result.incomeRatio).toBeCloseTo(0.402);
    });

    it("returns Infinity ratio when income is zero", () => {
      const result = calculateAffordability(makeInput({ monthlyNetIncome: 0, monthlyRent: 100_000 }));
      expect(result.incomeRatio).toBe(Infinity);
      expect(result.incomePass).toBe(false);
    });

    it("rent of zero always passes", () => {
      const result = calculateAffordability(makeInput({ monthlyRent: 0 }));
      expect(result.incomePass).toBe(true);
      expect(result.incomeRatio).toBe(0);
    });
  });

  describe("employment band", () => {
    it("employed → strong", () => {
      expect(calculateAffordability(makeInput({ employmentStatus: "employed" })).employmentBand).toBe("strong");
    });

    it("self-employed → moderate", () => {
      expect(calculateAffordability(makeInput({ employmentStatus: "self-employed" })).employmentBand).toBe("moderate");
    });

    it("contract → moderate", () => {
      expect(calculateAffordability(makeInput({ employmentStatus: "contract" })).employmentBand).toBe("moderate");
    });

    it("student → low", () => {
      expect(calculateAffordability(makeInput({ employmentStatus: "student" })).employmentBand).toBe("low");
    });
  });

  describe("deposit pass", () => {
    it("passes when deposit meets minDepositRequired", () => {
      const result = calculateAffordability(makeInput({
        depositPercentage: 300_000,
        minDepositRequired: 300_000,
      }));
      expect(result.depositPass).toBe(true);
    });

    it("fails when deposit is below minDepositRequired", () => {
      const result = calculateAffordability(makeInput({
        depositPercentage: 200_000,
        minDepositRequired: 300_000,
      }));
      expect(result.depositPass).toBe(false);
    });

    it("uses 20% of annual rent as default minimum when minDepositRequired is 0", () => {
      const result = calculateAffordability(makeInput({
        monthlyRent: 100_000,
        depositPercentage: 239_999,
        minDepositRequired: 0,
      }));
      // effectiveMinDeposit = 0.2 * 100_000 * 12 = 240_000
      expect(result.depositPass).toBe(false);

      const result2 = calculateAffordability(makeInput({
        monthlyRent: 100_000,
        depositPercentage: 240_000,
        minDepositRequired: 0,
      }));
      expect(result2.depositPass).toBe(true);
    });
  });

  describe("overall band", () => {
    it("strong when employed, income passes, deposit passes (score=6)", () => {
      const result = calculateAffordability(makeInput({
        monthlyNetIncome: 500_000,
        monthlyRent: 100_000,
        employmentStatus: "employed",
        depositPercentage: 500_000,
        minDepositRequired: 100_000,
      }));
      expect(result.overallBand).toBe("strong");
    });

    it("strong when self-employed, income passes, deposit passes (score=5)", () => {
      const result = calculateAffordability(makeInput({
        monthlyNetIncome: 500_000,
        monthlyRent: 100_000,
        employmentStatus: "self-employed",
        depositPercentage: 500_000,
        minDepositRequired: 100_000,
      }));
      // incomePass(2) + moderate(1) + depositPass(2) = 5 → strong (>=5)
      expect(result.overallBand).toBe("strong");
    });

    it("moderate when self-employed, income fails, deposit passes (score=3)", () => {
      const result = calculateAffordability(makeInput({
        monthlyNetIncome: 200_000,
        monthlyRent: 100_000,
        employmentStatus: "self-employed",
        depositPercentage: 500_000,
        minDepositRequired: 100_000,
      }));
      // incomeFail(0) + moderate(1) + depositPass(2) = 3 → moderate
      expect(result.overallBand).toBe("moderate");
    });

    it("moderate when employed, income fails, deposit passes (score=4)", () => {
      const result = calculateAffordability(makeInput({
        monthlyNetIncome: 200_000,
        monthlyRent: 100_000,
        employmentStatus: "employed",
        depositPercentage: 500_000,
        minDepositRequired: 100_000,
      }));
      expect(result.overallBand).toBe("moderate");
    });

    it("low when student, income fails, deposit fails (score=0)", () => {
      const result = calculateAffordability(makeInput({
        monthlyNetIncome: 100_000,
        monthlyRent: 100_000,
        employmentStatus: "student",
        depositPercentage: 0,
        minDepositRequired: 1_000_000,
      }));
      expect(result.overallBand).toBe("low");
    });
  });
});

describe("getOverallLabel", () => {
  it("returns correct label for strong", () => {
    expect(getOverallLabel("strong")).toBe("You're likely to qualify — apply now");
  });

  it("returns correct label for moderate", () => {
    expect(getOverallLabel("moderate")).toBe("You may qualify — complete KYC to improve your chances");
  });

  it("returns correct label for low", () => {
    expect(getOverallLabel("low")).toBe("Consider saving more before applying");
  });
});
