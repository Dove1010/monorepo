import { describe, it, expect } from "vitest";
import { calcRentToOwn, ANNUAL_INTEREST_RATE, ESTIMATED_RENTAL_YIELD, type RentToOwnInputs } from "../rentToOwnCalc";

function makeInputs(overrides: Partial<RentToOwnInputs> = {}): RentToOwnInputs {
  return {
    propertyPrice: 10_000_000,
    depositPct: 20,
    monthlyBudget: 200_000,
    ownershipYears: 5,
    ...overrides,
  };
}

describe("constants", () => {
  it("annual interest rate is 15%", () => {
    expect(ANNUAL_INTEREST_RATE).toBe(0.15);
  });

  it("estimated rental yield is 8%", () => {
    expect(ESTIMATED_RENTAL_YIELD).toBe(0.08);
  });
});

describe("calcRentToOwn", () => {
  describe("deposit calculation", () => {
    it("computes deposit from percentage", () => {
      const result = calcRentToOwn(makeInputs({ propertyPrice: 10_000_000, depositPct: 20 }));
      expect(result.deposit).toBe(2_000_000);
    });

    it("zero deposit when depositPct is 0", () => {
      const result = calcRentToOwn(makeInputs({ depositPct: 0 }));
      expect(result.deposit).toBe(0);
      expect(result.remaining).toBe(10_000_000);
    });

    it("100% deposit means zero remaining", () => {
      const result = calcRentToOwn(makeInputs({ depositPct: 100 }));
      expect(result.deposit).toBe(10_000_000);
      expect(result.remaining).toBe(0);
    });
  });

  describe("monthly payment", () => {
    it("computes amortising monthly payment", () => {
      const result = calcRentToOwn(makeInputs());
      const monthlyRate = ANNUAL_INTEREST_RATE / 12;
      const totalMonths = 5 * 12;
      const expected =
        (10_000_000 * 0.8) *
        (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) /
        (Math.pow(1 + monthlyRate, totalMonths) - 1);

      expect(result.requiredMonthlyPayment).toBeCloseTo(expected, 0);
    });

    it("canAfford is true when budget >= required payment", () => {
      const result = calcRentToOwn(makeInputs({ monthlyBudget: 1_000_000 }));
      expect(result.canAfford).toBe(true);
    });

    it("canAfford is false when budget < required payment", () => {
      const result = calcRentToOwn(makeInputs({ monthlyBudget: 1 }));
      expect(result.canAfford).toBe(false);
    });
  });

  describe("amortisation schedule", () => {
    it("has correct number of entries", () => {
      const result = calcRentToOwn(makeInputs({ ownershipYears: 5 }));
      expect(result.equitySchedule).toHaveLength(60);
    });

    it("first entry starts from month 1", () => {
      const result = calcRentToOwn(makeInputs());
      expect(result.equitySchedule[0].month).toBe(1);
    });

    it("last entry has balance near zero", () => {
      const result = calcRentToOwn(makeInputs());
      const lastEntry = result.equitySchedule[result.equitySchedule.length - 1];
      expect(lastEntry.balance).toBeCloseTo(0, 0);
    });

    it("equity increases monotonically", () => {
      const result = calcRentToOwn(makeInputs());
      for (let i = 1; i < result.equitySchedule.length; i++) {
        expect(result.equitySchedule[i].equity).toBeGreaterThanOrEqual(
          result.equitySchedule[i - 1].equity,
        );
      }
    });

    it("cumulative paid increases monotonically", () => {
      const result = calcRentToOwn(makeInputs());
      for (let i = 1; i < result.equitySchedule.length; i++) {
        expect(result.equitySchedule[i].cumulativePaid).toBeGreaterThan(
          result.equitySchedule[i - 1].cumulativePaid,
        );
      }
    });

    it("rent equivalent increases linearly", () => {
      const result = calcRentToOwn(makeInputs());
      const month1 = result.equitySchedule[0].rentEquivalent;
      const month12 = result.equitySchedule[11].rentEquivalent;
      expect(month12).toBeCloseTo(month1 * 12, 0);
    });
  });

  describe("totals", () => {
    it("totalCostRTO equals deposit + all monthly payments", () => {
      const result = calcRentToOwn(makeInputs());
      expect(result.totalCostRTO).toBeCloseTo(
        result.deposit + result.requiredMonthlyPayment * result.totalMonths,
        0,
      );
    });

    it("totalInterest equals total payments minus remaining principal", () => {
      const result = calcRentToOwn(makeInputs());
      expect(result.totalInterest).toBeCloseTo(
        result.requiredMonthlyPayment * result.totalMonths - result.remaining,
        0,
      );
    });

    it("totalCostRent equals monthlyRentEquivalent * totalMonths", () => {
      const result = calcRentToOwn(makeInputs());
      expect(result.totalCostRent).toBeCloseTo(
        result.monthlyRentEquivalent * result.totalMonths,
        0,
      );
    });
  });

  describe("ownership date", () => {
    it("is totalMonths in the future from now", () => {
      const now = new Date();
      const expectedDate = new Date(now.getFullYear(), now.getMonth() + 12, 1);
      const result = calcRentToOwn(makeInputs({ ownershipYears: 1 }));

      expect(result.ownershipDate.getFullYear()).toBe(expectedDate.getFullYear());
      expect(result.ownershipDate.getMonth()).toBe(expectedDate.getMonth());
      expect(result.ownershipDate.getDate()).toBe(1);
    });
  });

  describe("boundary cases", () => {
    it("single year term", () => {
      const result = calcRentToOwn(makeInputs({ ownershipYears: 1 }));
      expect(result.equitySchedule).toHaveLength(12);
      expect(result.totalMonths).toBe(12);
    });

    it("very large property price", () => {
      const result = calcRentToOwn(makeInputs({ propertyPrice: 1_000_000_000 }));
      expect(result.deposit).toBe(200_000_000);
      expect(result.remaining).toBe(800_000_000);
      expect(result.requiredMonthlyPayment).toBeGreaterThan(0);
    });
  });
});
