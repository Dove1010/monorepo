/**
 * Background Check Result Model
 * Stores employment, income, and bank statement verification results for tenant screening
 */

import type {
  EmploymentVerificationResult,
  IncomeVerificationResult,
  BankStatementVerificationResult,
} from "../services/backgroundCheck/BackgroundCheckProvider.js";

export type BackgroundCheckStatus = "pending" | "completed" | "failed";
export type EmploymentType = "full_time" | "part_time" | "contract" | "self_employed";
export type IncomeStability = "stable" | "variable" | "unstable";

export interface BackgroundCheckResult {
  id: string;
  tenantId: string;
  applicationId?: string;

  // Employment verification
  employmentVerified?: boolean;
  employerName?: string;
  jobTitle?: string;
  employmentStartDate?: string;
  employmentType?: EmploymentType;
  employmentMonthlyIncome?: number;
  employmentVerificationDate?: string;

  // Income verification
  incomeAverageMonthly?: number;
  incomeStability?: IncomeStability;
  incomeLastSalaryDate?: string;
  incomeTransactionCount3m?: number;
  incomeVerificationDate?: string;

  // Bank statement verification
  bankAverageBalance?: number;
  bankMonthlyInflow?: number;
  bankMonthlyOutflow?: number;
  bankOverdraftCount?: number;
  bankStatementStartDate?: string;
  bankStatementEndDate?: string;
  bankVerificationDate?: string;

  // Overall status
  overallStatus: BackgroundCheckStatus;
  provider: string;

  // Metadata
  verificationMetadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBackgroundCheckResultInput {
  tenantId: string;
  applicationId?: string;
  employmentVerified?: boolean;
  employerName?: string;
  jobTitle?: string;
  employmentStartDate?: string;
  employmentType?: EmploymentType;
  employmentMonthlyIncome?: number;
  employmentVerificationDate?: string;
  incomeAverageMonthly?: number;
  incomeStability?: IncomeStability;
  incomeLastSalaryDate?: string;
  incomeTransactionCount3m?: number;
  incomeVerificationDate?: string;
  bankAverageBalance?: number;
  bankMonthlyInflow?: number;
  bankMonthlyOutflow?: number;
  bankOverdraftCount?: number;
  bankStatementStartDate?: string;
  bankStatementEndDate?: string;
  bankVerificationDate?: string;
  overallStatus?: BackgroundCheckStatus;
  provider?: string;
  verificationMetadata?: Record<string, any>;
}

export interface BackgroundCheckResultStore {
  create(input: CreateBackgroundCheckResultInput): Promise<BackgroundCheckResult>;
  findById(id: string): Promise<BackgroundCheckResult | null>;
  findByTenantId(tenantId: string): Promise<BackgroundCheckResult[]>;
  findByApplicationId(applicationId: string): Promise<BackgroundCheckResult[]>;
  findLatestByTenantId(tenantId: string): Promise<BackgroundCheckResult | null>;
  update(
    id: string,
    updates: Partial<CreateBackgroundCheckResultInput>,
  ): Promise<BackgroundCheckResult>;
  list(filters?: {
    tenantId?: string;
    applicationId?: string;
    overallStatus?: BackgroundCheckStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ results: BackgroundCheckResult[]; total: number }>;
}
