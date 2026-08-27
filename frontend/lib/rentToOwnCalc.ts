export const ANNUAL_INTEREST_RATE = 0.15; // 15% p.a. — representative for Nigeria rent-to-own
export const ESTIMATED_RENTAL_YIELD = 0.08; // 8% of property value = annual rent estimate

export interface RentToOwnInputs {
  propertyPrice: number;
  depositPct: number; // 0–100
  monthlyBudget: number;
  ownershipYears: number;
}

export interface MonthlyEquityPoint {
  month: number;
  equity: number;
  balance: number;
  cumulativePaid: number;
  rentEquivalent: number; // cumulative cost if standard renting
}

export interface RentToOwnResult {
  deposit: number;
  remaining: number;
  monthlyRate: number;
  requiredMonthlyPayment: number;
  canAfford: boolean;
  totalMonths: number;
  totalInterest: number;
  totalCostRTO: number;
  totalCostRent: number;
  monthlyRentEquivalent: number;
  equitySchedule: MonthlyEquityPoint[];
  ownershipDate: Date;
}

export function calcRentToOwn(inputs: RentToOwnInputs): RentToOwnResult {
  const { propertyPrice, depositPct, ownershipYears } = inputs;

  const deposit = propertyPrice * (depositPct / 100);
  const remaining = propertyPrice - deposit;
  const totalMonths = ownershipYears * 12;
  const monthlyRate = ANNUAL_INTEREST_RATE / 12;

  // Mortgage-style (amortising) monthly payment on the financed portion
  const factor = Math.pow(1 + monthlyRate, totalMonths);
  const requiredMonthlyPayment =
    remaining * (monthlyRate * factor) / (factor - 1);

  const canAfford = inputs.monthlyBudget >= requiredMonthlyPayment;

  // Use the required payment (not user's budget) for amortisation so the
  // schedule always hits zero at the target horizon.
  const payment = requiredMonthlyPayment;

  const totalInterest = payment * totalMonths - remaining;
  const totalCostRTO = deposit + payment * totalMonths;

  const monthlyRentEquivalent =
    (propertyPrice * ESTIMATED_RENTAL_YIELD) / 12;
  const totalCostRent = monthlyRentEquivalent * totalMonths;

  // Build amortisation schedule
  const equitySchedule: MonthlyEquityPoint[] = [];
  let balance = remaining;
  let cumulativePrincipal = 0;
  let cumulativePaid = deposit;

  const now = new Date();

  for (let m = 1; m <= totalMonths; m++) {
    const interestCharge = balance * monthlyRate;
    const principalCharge = payment - interestCharge;
    balance = Math.max(0, balance - principalCharge);
    cumulativePrincipal += principalCharge;
    cumulativePaid += payment;

    const equity = deposit + cumulativePrincipal;
    const rentEquivalent = monthlyRentEquivalent * m;

    equitySchedule.push({
      month: m,
      equity: Math.min(equity, propertyPrice),
      balance,
      cumulativePaid,
      rentEquivalent,
    });
  }

  const ownershipDate = new Date(
    now.getFullYear(),
    now.getMonth() + totalMonths,
    1,
  );

  return {
    deposit,
    remaining,
    monthlyRate,
    requiredMonthlyPayment,
    canAfford,
    totalMonths,
    totalInterest,
    totalCostRTO,
    totalCostRent,
    monthlyRentEquivalent,
    equitySchedule,
    ownershipDate,
  };
}
