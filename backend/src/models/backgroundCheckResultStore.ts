/**
 * Background Check Result Store
 * In-memory and PostgreSQL implementations for background check result persistence
 */

import { getPool } from "../db.js";
import {
  BackgroundCheckResult,
  CreateBackgroundCheckResultInput,
  BackgroundCheckResultStore,
  BackgroundCheckStatus,
} from "./backgroundCheckResult.js";

/**
 * In-memory implementation for testing
 */
export class InMemoryBackgroundCheckResultStore
  implements BackgroundCheckResultStore
{
  private results: Map<string, BackgroundCheckResult> = new Map();
  private counter = 1;

  async create(
    input: CreateBackgroundCheckResultInput,
  ): Promise<BackgroundCheckResult> {
    const id = `BGCK-${Date.now()}-${this.counter++}`;
    const now = new Date().toISOString();
    const result: BackgroundCheckResult = {
      id,
      ...input,
      overallStatus: input.overallStatus || "pending",
      provider: input.provider || "mock",
      createdAt: now,
      updatedAt: now,
    };

    this.results.set(id, result);
    return result;
  }

  async findById(id: string): Promise<BackgroundCheckResult | null> {
    return this.results.get(id) || null;
  }

  async findByTenantId(tenantId: string): Promise<BackgroundCheckResult[]> {
    return Array.from(this.results.values()).filter(
      (r) => r.tenantId === tenantId,
    );
  }

  async findByApplicationId(
    applicationId: string,
  ): Promise<BackgroundCheckResult[]> {
    return Array.from(this.results.values()).filter(
      (r) => r.applicationId === applicationId,
    );
  }

  async findLatestByTenantId(
    tenantId: string,
  ): Promise<BackgroundCheckResult | null> {
    const tenantResults = await this.findByTenantId(tenantId);
    if (tenantResults.length === 0) return null;
    return tenantResults.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  }

  async update(
    id: string,
    updates: Partial<CreateBackgroundCheckResultInput>,
  ): Promise<BackgroundCheckResult> {
    const existing = this.results.get(id);
    if (!existing) {
      throw new Error(`Background check result ${id} not found`);
    }

    const updated: BackgroundCheckResult = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.results.set(id, updated);
    return updated;
  }

  async list(filters?: {
    tenantId?: string;
    applicationId?: string;
    overallStatus?: BackgroundCheckStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ results: BackgroundCheckResult[]; total: number }> {
    let results = Array.from(this.results.values());

    if (filters?.tenantId) {
      results = results.filter((r) => r.tenantId === filters.tenantId);
    }
    if (filters?.applicationId) {
      results = results.filter((r) => r.applicationId === filters.applicationId);
    }
    if (filters?.overallStatus) {
      results = results.filter((r) => r.overallStatus === filters.overallStatus);
    }

    // Sort by createdAt descending
    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = results.length;
    const offset = filters?.offset || 0;
    const limit = filters?.limit || 50;

    const paginatedResults = results.slice(offset, offset + limit);

    return { results: paginatedResults, total };
  }

  // Test helper
  async clear(): Promise<void> {
    this.results.clear();
    this.counter = 1;
  }
}

/**
 * PostgreSQL implementation
 */
export class PostgresBackgroundCheckResultStore
  implements BackgroundCheckResultStore
{
  async create(
    input: CreateBackgroundCheckResultInput,
  ): Promise<BackgroundCheckResult> {
    const pool = await getPool();
    if (!pool) throw new Error("Database pool not initialized");

    const result = await pool.query(
      `INSERT INTO background_check_results (
        tenant_id, application_id,
        employment_verified, employer_name, job_title, employment_start_date,
        employment_type, employment_monthly_income, employment_verification_date,
        income_average_monthly, income_stability, income_last_salary_date,
        income_transaction_count_3m, income_verification_date,
        bank_average_balance, bank_monthly_inflow, bank_monthly_outflow,
        bank_overdraft_count, bank_statement_start_date, bank_statement_end_date,
        bank_verification_date, overall_status, provider, verification_metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW()
      ) RETURNING *`,
      [
        input.tenantId,
        input.applicationId || null,
        input.employmentVerified || null,
        input.employerName || null,
        input.jobTitle || null,
        input.employmentStartDate || null,
        input.employmentType || null,
        input.employmentMonthlyIncome || null,
        input.employmentVerificationDate || null,
        input.incomeAverageMonthly || null,
        input.incomeStability || null,
        input.incomeLastSalaryDate || null,
        input.incomeTransactionCount3m || null,
        input.incomeVerificationDate || null,
        input.bankAverageBalance || null,
        input.bankMonthlyInflow || null,
        input.bankMonthlyOutflow || null,
        input.bankOverdraftCount || null,
        input.bankStatementStartDate || null,
        input.bankStatementEndDate || null,
        input.bankVerificationDate || null,
        input.overallStatus || "pending",
        input.provider || "mock",
        input.verificationMetadata ? JSON.stringify(input.verificationMetadata) : null,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<BackgroundCheckResult | null> {
    const pool = await getPool();
    if (!pool) throw new Error("Database pool not initialized");

    const result = await pool.query(
      "SELECT * FROM background_check_results WHERE id = $1",
      [id],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByTenantId(tenantId: string): Promise<BackgroundCheckResult[]> {
    const pool = await getPool();
    if (!pool) throw new Error("Database pool not initialized");

    const result = await pool.query(
      "SELECT * FROM background_check_results WHERE tenant_id = $1 ORDER BY created_at DESC",
      [tenantId],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findByApplicationId(
    applicationId: string,
  ): Promise<BackgroundCheckResult[]> {
    const pool = await getPool();
    if (!pool) throw new Error("Database pool not initialized");

    const result = await pool.query(
      "SELECT * FROM background_check_results WHERE application_id = $1 ORDER BY created_at DESC",
      [applicationId],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findLatestByTenantId(
    tenantId: string,
  ): Promise<BackgroundCheckResult | null> {
    const pool = await getPool();
    if (!pool) throw new Error("Database pool not initialized");

    const result = await pool.query(
      "SELECT * FROM background_check_results WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1",
      [tenantId],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async update(
    id: string,
    updates: Partial<CreateBackgroundCheckResultInput>,
  ): Promise<BackgroundCheckResult> {
    const pool = await getPool();
    if (!pool) throw new Error("Database pool not initialized");

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.employmentVerified !== undefined) {
      fields.push(`employment_verified = $${paramIndex++}`);
      values.push(updates.employmentVerified);
    }
    if (updates.employerName !== undefined) {
      fields.push(`employer_name = $${paramIndex++}`);
      values.push(updates.employerName);
    }
    if (updates.jobTitle !== undefined) {
      fields.push(`job_title = $${paramIndex++}`);
      values.push(updates.jobTitle);
    }
    if (updates.employmentStartDate !== undefined) {
      fields.push(`employment_start_date = $${paramIndex++}`);
      values.push(updates.employmentStartDate);
    }
    if (updates.employmentType !== undefined) {
      fields.push(`employment_type = $${paramIndex++}`);
      values.push(updates.employmentType);
    }
    if (updates.employmentMonthlyIncome !== undefined) {
      fields.push(`employment_monthly_income = $${paramIndex++}`);
      values.push(updates.employmentMonthlyIncome);
    }
    if (updates.employmentVerificationDate !== undefined) {
      fields.push(`employment_verification_date = $${paramIndex++}`);
      values.push(updates.employmentVerificationDate);
    }
    if (updates.incomeAverageMonthly !== undefined) {
      fields.push(`income_average_monthly = $${paramIndex++}`);
      values.push(updates.incomeAverageMonthly);
    }
    if (updates.incomeStability !== undefined) {
      fields.push(`income_stability = $${paramIndex++}`);
      values.push(updates.incomeStability);
    }
    if (updates.incomeLastSalaryDate !== undefined) {
      fields.push(`income_last_salary_date = $${paramIndex++}`);
      values.push(updates.incomeLastSalaryDate);
    }
    if (updates.incomeTransactionCount3m !== undefined) {
      fields.push(`income_transaction_count_3m = $${paramIndex++}`);
      values.push(updates.incomeTransactionCount3m);
    }
    if (updates.incomeVerificationDate !== undefined) {
      fields.push(`income_verification_date = $${paramIndex++}`);
      values.push(updates.incomeVerificationDate);
    }
    if (updates.bankAverageBalance !== undefined) {
      fields.push(`bank_average_balance = $${paramIndex++}`);
      values.push(updates.bankAverageBalance);
    }
    if (updates.bankMonthlyInflow !== undefined) {
      fields.push(`bank_monthly_inflow = $${paramIndex++}`);
      values.push(updates.bankMonthlyInflow);
    }
    if (updates.bankMonthlyOutflow !== undefined) {
      fields.push(`bank_monthly_outflow = $${paramIndex++}`);
      values.push(updates.bankMonthlyOutflow);
    }
    if (updates.bankOverdraftCount !== undefined) {
      fields.push(`bank_overdraft_count = $${paramIndex++}`);
      values.push(updates.bankOverdraftCount);
    }
    if (updates.bankStatementStartDate !== undefined) {
      fields.push(`bank_statement_start_date = $${paramIndex++}`);
      values.push(updates.bankStatementStartDate);
    }
    if (updates.bankStatementEndDate !== undefined) {
      fields.push(`bank_statement_end_date = $${paramIndex++}`);
      values.push(updates.bankStatementEndDate);
    }
    if (updates.bankVerificationDate !== undefined) {
      fields.push(`bank_verification_date = $${paramIndex++}`);
      values.push(updates.bankVerificationDate);
    }
    if (updates.overallStatus !== undefined) {
      fields.push(`overall_status = $${paramIndex++}`);
      values.push(updates.overallStatus);
    }
    if (updates.provider !== undefined) {
      fields.push(`provider = $${paramIndex++}`);
      values.push(updates.provider);
    }
    if (updates.verificationMetadata !== undefined) {
      fields.push(`verification_metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.verificationMetadata));
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE background_check_results SET ${fields.join(", ")} WHERE id = $${paramIndex} RETURNING *`;

    const result = await pool.query(query, values);
    return this.mapRow(result.rows[0]);
  }

  async list(filters?: {
    tenantId?: string;
    applicationId?: string;
    overallStatus?: BackgroundCheckStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ results: BackgroundCheckResult[]; total: number }> {
    const pool = await getPool();
    if (!pool) throw new Error("Database pool not initialized");

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    const params: any[] = [limit, offset];
    let query = "SELECT * FROM background_check_results";
    const conditions: string[] = [];

    if (filters?.tenantId) {
      conditions.push("tenant_id = $3");
      params.unshift(filters.tenantId);
    }
    if (filters?.applicationId) {
      conditions.push("application_id = $4");
      params.unshift(filters.applicationId);
    }
    if (filters?.overallStatus) {
      conditions.push("overall_status = $5");
      params.unshift(filters.overallStatus);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY created_at DESC LIMIT $1 OFFSET $2";

    const result = await pool.query(query, params);
    const results = result.rows.map((row) => this.mapRow(row));

    // Get total count
    let countQuery = "SELECT COUNT(*) FROM background_check_results";
    const countParams: any[] = [];
    const countConditions: string[] = [];

    if (filters?.tenantId) {
      countConditions.push("tenant_id = $1");
      countParams.push(filters.tenantId);
    }
    if (filters?.applicationId) {
      countConditions.push("application_id = $2");
      countParams.push(filters.applicationId);
    }
    if (filters?.overallStatus) {
      countConditions.push("overall_status = $3");
      countParams.push(filters.overallStatus);
    }

    if (countConditions.length > 0) {
      countQuery += " WHERE " + countConditions.join(" AND ");
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return { results, total };
  }

  private mapRow(row: any): BackgroundCheckResult {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      applicationId: row.application_id || undefined,
      employmentVerified: row.employment_verified || undefined,
      employerName: row.employer_name || undefined,
      jobTitle: row.job_title || undefined,
      employmentStartDate: row.employment_start_date
        ? row.employment_start_date.toISOString()
        : undefined,
      employmentType: row.employment_type || undefined,
      employmentMonthlyIncome: row.employment_monthly_income
        ? parseFloat(row.employment_monthly_income)
        : undefined,
      employmentVerificationDate: row.employment_verification_date
        ? row.employment_verification_date.toISOString()
        : undefined,
      incomeAverageMonthly: row.income_average_monthly
        ? parseFloat(row.income_average_monthly)
        : undefined,
      incomeStability: row.income_stability || undefined,
      incomeLastSalaryDate: row.income_last_salary_date
        ? row.income_last_salary_date.toISOString()
        : undefined,
      incomeTransactionCount3m: row.income_transaction_count_3m || undefined,
      incomeVerificationDate: row.income_verification_date
        ? row.income_verification_date.toISOString()
        : undefined,
      bankAverageBalance: row.bank_average_balance
        ? parseFloat(row.bank_average_balance)
        : undefined,
      bankMonthlyInflow: row.bank_monthly_inflow
        ? parseFloat(row.bank_monthly_inflow)
        : undefined,
      bankMonthlyOutflow: row.bank_monthly_outflow
        ? parseFloat(row.bank_monthly_outflow)
        : undefined,
      bankOverdraftCount: row.bank_overdraft_count || undefined,
      bankStatementStartDate: row.bank_statement_start_date
        ? row.bank_statement_start_date.toISOString()
        : undefined,
      bankStatementEndDate: row.bank_statement_end_date
        ? row.bank_statement_end_date.toISOString()
        : undefined,
      bankVerificationDate: row.bank_verification_date
        ? row.bank_verification_date.toISOString()
        : undefined,
      overallStatus: row.overall_status,
      provider: row.provider,
      verificationMetadata: row.verification_metadata
        ? (typeof row.verification_metadata === "string"
            ? JSON.parse(row.verification_metadata)
            : row.verification_metadata)
        : undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

// Singleton instance
let backgroundCheckResultStore: BackgroundCheckResultStore =
  new InMemoryBackgroundCheckResultStore();

export function initBackgroundCheckResultStore(
  store: BackgroundCheckResultStore,
): void {
  backgroundCheckResultStore = store;
}

export { backgroundCheckResultStore };
