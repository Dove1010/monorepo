import { getPool } from "../db.js";
import {
  CreatePartnerLandlordApplicationData,
  PartnerLandlordApplication,
  PartnerLandlordApplicationStatus,
} from "./partnerLandlordApplication.js";

export interface PartnerLandlordApplicationStore {
  create(
    data: CreatePartnerLandlordApplicationData,
  ): Promise<PartnerLandlordApplication>;
}

export class InMemoryPartnerLandlordApplicationStore
  implements PartnerLandlordApplicationStore
{
  private applications = new Map<string, PartnerLandlordApplication>();
  private counter = 1;

  async create(
    data: CreatePartnerLandlordApplicationData,
  ): Promise<PartnerLandlordApplication> {
    const applicationId = `PLA-${Date.now()}-${this.counter++}`;
    const now = new Date().toISOString();
    const application: PartnerLandlordApplication = {
      applicationId,
      ...data,
      status: PartnerLandlordApplicationStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };

    this.applications.set(applicationId, application);
    return application;
  }

  async clear(): Promise<void> {
    this.applications.clear();
    this.counter = 1;
  }
}

export class PostgresPartnerLandlordApplicationStore
  implements PartnerLandlordApplicationStore
{
  async create(
    data: CreatePartnerLandlordApplicationData,
  ): Promise<PartnerLandlordApplication> {
    const pool = await getPool();
    if (!pool) throw new Error("Database pool not initialized");

    const result = await pool.query(
      `INSERT INTO partner_landlord_applications (
         full_name,
         phone_number,
         email,
         property_count,
         property_locations,
         status,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING
         id as application_id,
         full_name,
         phone_number,
         email,
         property_count,
         property_locations,
         status,
         created_at,
         updated_at`,
      [
        data.fullName,
        data.phoneNumber,
        data.email,
        data.propertyCount,
        data.propertyLocations,
        PartnerLandlordApplicationStatus.PENDING,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, any>): PartnerLandlordApplication {
    return {
      applicationId: row.application_id,
      fullName: row.full_name,
      phoneNumber: row.phone_number,
      email: row.email,
      propertyCount: row.property_count,
      propertyLocations: row.property_locations,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

let partnerLandlordApplicationStore: PartnerLandlordApplicationStore =
  new InMemoryPartnerLandlordApplicationStore();

export function initPartnerLandlordApplicationStore(
  store: PartnerLandlordApplicationStore,
): void {
  partnerLandlordApplicationStore = store;
}

export { partnerLandlordApplicationStore };
