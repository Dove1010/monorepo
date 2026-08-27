/**
 * Background Check Provider Interface
 * Abstracts employment, income, and bank statement verification from various providers
 * (e.g., Mono, Okra, payroll APIs)
 */

export interface EmploymentVerificationResult {
  verified: boolean;
  employerName: string;
  jobTitle: string;
  startDate: string;
  employmentType: "full_time" | "part_time" | "contract" | "self_employed";
  monthlyIncome?: number;
  verificationDate: string;
}

export interface IncomeVerificationResult {
  averageMonthlyIncome: number;
  incomeStability: "stable" | "variable" | "unstable";
  lastSalaryDate: string;
  transactionCount3m: number;
  verificationDate: string;
}

export interface BankStatementVerificationResult {
  averageBalance: number;
  monthlyInflow: number;
  monthlyOutflow: number;
  overdraftCount: number;
  statementPeriod: {
    startDate: string;
    endDate: string;
  };
  verificationDate: string;
}

export interface BackgroundCheckProvider {
  /**
   * Verify employment details for a tenant
   * @param tenantId - Unique tenant identifier
   * @param employerName - Name of the employer to verify
   * @param employeeId - Optional employee ID for payroll verification
   * @returns Employment verification result
   */
  verifyEmployment(
    tenantId: string,
    employerName: string,
    employeeId?: string,
  ): Promise<EmploymentVerificationResult>;

  /**
   * Verify income through bank account analysis
   * @param tenantId - Unique tenant identifier
   * @param bankAccountRef - Bank account reference or account number
   * @returns Income verification result
   */
  verifyIncome(
    tenantId: string,
    bankAccountRef: string,
  ): Promise<IncomeVerificationResult>;

  /**
   * Analyze uploaded bank statement
   * @param tenantId - Unique tenant identifier
   * @param statementFile - File path or reference to uploaded statement
   * @returns Bank statement analysis result
   */
  verifyBankStatement(
    tenantId: string,
    statementFile: string,
  ): Promise<BankStatementVerificationResult>;
}
