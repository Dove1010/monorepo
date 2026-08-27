/**
 * Mock Background Check Provider
 * Deterministic implementation for testing
 * Returns configurable responses based on tenant ID seed for consistent testing
 */

import {
  BackgroundCheckProvider,
  EmploymentVerificationResult,
  IncomeVerificationResult,
  BankStatementVerificationResult,
} from "./BackgroundCheckProvider.js";

export interface MockBackgroundCheckConfig {
  employmentVerified?: boolean;
  incomeStability?: "stable" | "variable" | "unstable";
  averageMonthlyIncome?: number;
  overdraftCount?: number;
}

export class MockBackgroundCheckProvider implements BackgroundCheckProvider {
  private config: MockBackgroundCheckConfig;

  constructor(config: MockBackgroundCheckConfig = {}) {
    this.config = config;
  }

  /**
   * Update mock configuration for testing scenarios
   */
  setConfig(config: MockBackgroundCheckConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = {};
  }

  async verifyEmployment(
    tenantId: string,
    employerName: string,
    employeeId?: string,
  ): Promise<EmploymentVerificationResult> {
    // Deterministic verification based on tenant ID
    const lastChar = tenantId.charCodeAt(tenantId.length - 1) % 10;
    const verified = this.config.employmentVerified ?? lastChar < 8;

    const employmentTypes: Array<
      "full_time" | "part_time" | "contract" | "self_employed"
    > = ["full_time", "full_time", "full_time", "part_time", "contract", "self_employed"];
    const employmentType = employmentTypes[lastChar % employmentTypes.length];

    const jobTitles = [
      "Software Engineer",
      "Product Manager",
      "Data Analyst",
      "Sales Representative",
      "Accountant",
      "Teacher",
      "Nurse",
      "Driver",
      "Chef",
      "Consultant",
    ];
    const jobTitle = jobTitles[lastChar % jobTitles.length];

    // Generate start date (1-5 years ago)
    const yearsAgo = 1 + (lastChar % 5);
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - yearsAgo);

    const monthlyIncome =
      this.config.averageMonthlyIncome ??
      300000 + (lastChar * 50000); // ₦300k - ₦750k range

    return {
      verified,
      employerName,
      jobTitle,
      startDate: startDate.toISOString(),
      employmentType,
      monthlyIncome: verified ? monthlyIncome : undefined,
      verificationDate: new Date().toISOString(),
    };
  }

  async verifyIncome(
    tenantId: string,
    bankAccountRef: string,
  ): Promise<IncomeVerificationResult> {
    // Deterministic income based on tenant ID
    const lastChar = tenantId.charCodeAt(tenantId.length - 1) % 10;
    const baseIncome =
      this.config.averageMonthlyIncome ?? 300000 + (lastChar * 50000);

    // Income stability based on config or deterministic
    const stabilityMap: Record<number, "stable" | "variable" | "unstable"> = {
      0: "stable",
      1: "stable",
      2: "stable",
      3: "stable",
      4: "variable",
      5: "variable",
      6: "unstable",
      7: "unstable",
      8: "stable",
      9: "stable",
    };
    const incomeStability = this.config.incomeStability ?? stabilityMap[lastChar];

    // Transaction count (3 months)
    const transactionCount3m = 15 + (lastChar * 5); // 15-60 transactions

    // Last salary date (within last 30 days)
    const lastSalaryDate = new Date();
    lastSalaryDate.setDate(lastSalaryDate.getDate() - (lastChar * 3));

    return {
      averageMonthlyIncome: baseIncome,
      incomeStability,
      lastSalaryDate: lastSalaryDate.toISOString(),
      transactionCount3m,
      verificationDate: new Date().toISOString(),
    };
  }

  async verifyBankStatement(
    tenantId: string,
    statementFile: string,
  ): Promise<BankStatementVerificationResult> {
    // Deterministic values based on tenant ID
    const lastChar = tenantId.charCodeAt(tenantId.length - 1) % 10;
    const baseIncome =
      this.config.averageMonthlyIncome ?? 300000 + (lastChar * 50000);

    const averageBalance = baseIncome * 0.8; // 80% of monthly income
    const monthlyInflow = baseIncome * 1.1; // 110% of monthly income (some variance)
    const monthlyOutflow = baseIncome * 0.7; // 70% of monthly income

    const overdraftCount = this.config.overdraftCount ?? (lastChar < 3 ? lastChar + 1 : 0);

    // Statement period (last 6 months)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);

    return {
      averageBalance,
      monthlyInflow,
      monthlyOutflow,
      overdraftCount,
      statementPeriod: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      verificationDate: new Date().toISOString(),
    };
  }
}
