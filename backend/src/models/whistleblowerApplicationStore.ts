/**
 * Whistleblower Application Store
 * Handles persistence and retrieval of whistleblower signup applications
 */

import { randomUUID } from 'node:crypto'
import {
  WhistleblowerApplication,
  WhistleblowerApplicationStatus,
  CreateWhistleblowerApplicationData,
  WhistleblowerApplicationFilters,
  WhistleblowerApplicationListResult,
} from "./whistleblowerApplication.js";

// In-memory store for development/testing
const inMemoryApplications = new Map<string, WhistleblowerApplication>();

export interface WhistleblowerApplicationStore {
  create(data: CreateWhistleblowerApplicationData): Promise<WhistleblowerApplication>;
  getById(applicationId: string): Promise<WhistleblowerApplication | null>;
  getByEmail(email: string): Promise<WhistleblowerApplication | null>;
  list(filters?: WhistleblowerApplicationFilters): Promise<WhistleblowerApplicationListResult>;
  updateStatus(
    applicationId: string,
    status: WhistleblowerApplicationStatus,
    reviewedBy: string,
    rejectionReason?: string
  ): Promise<WhistleblowerApplication | null>;
  clear(): Promise<void>;
}

export class InMemoryWhistleblowerApplicationStore implements WhistleblowerApplicationStore {
  async create(data: CreateWhistleblowerApplicationData): Promise<WhistleblowerApplication> {
    const now = new Date();
    const application: WhistleblowerApplication = {
      applicationId: randomUUID(),
      ...data,
      status: WhistleblowerApplicationStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      // Initialize with default social verification values
      socialScore: 50, // Neutral score pending review
      greenFlags: [],
      redFlags: [],
    };
    inMemoryApplications.set(application.applicationId, application);
    return application;
  }

  async getById(applicationId: string): Promise<WhistleblowerApplication | null> {
    return inMemoryApplications.get(applicationId) || null;
  }

  async getByEmail(email: string): Promise<WhistleblowerApplication | null> {
    for (const app of inMemoryApplications.values()) {
      if (app.email.toLowerCase() === email.toLowerCase()) {
        return app;
      }
    }
    return null;
  }

  async list(filters?: WhistleblowerApplicationFilters): Promise<WhistleblowerApplicationListResult> {
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 20, 100);
    
    let applications = Array.from(inMemoryApplications.values());
    
    // Apply status filter
    if (filters?.status) {
      applications = applications.filter(app => app.status === filters.status);
    }
    
    // Sort by creation date (newest first)
    applications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const total = applications.length;
    const totalPages = Math.ceil(total / pageSize);
    
    // Apply pagination
    const start = (page - 1) * pageSize;
    const paginatedApplications = applications.slice(start, start + pageSize);
    
    return {
      applications: paginatedApplications,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async updateStatus(
    applicationId: string,
    status: WhistleblowerApplicationStatus,
    reviewedBy: string,
    rejectionReason?: string
  ): Promise<WhistleblowerApplication | null> {
    const application = inMemoryApplications.get(applicationId);
    if (!application) {
      return null;
    }

    // Validate transition
    if (application.status !== WhistleblowerApplicationStatus.PENDING) {
      throw new Error(`Cannot transition from ${application.status} to ${status}`);
    }

    // Rejection requires a reason
    if (status === WhistleblowerApplicationStatus.REJECTED && !rejectionReason) {
      throw new Error("Rejection reason is required");
    }

    const updatedApplication: WhistleblowerApplication = {
      ...application,
      status,
      reviewedBy,
      reviewedAt: new Date(),
      updatedAt: new Date(),
      ...(rejectionReason && { rejectionReason }),
    };

    inMemoryApplications.set(applicationId, updatedApplication);
    return updatedApplication;
  }

  async clear(): Promise<void> {
    inMemoryApplications.clear();
  }
}

// Singleton instance for use across the application
export const whistleblowerApplicationStore = new InMemoryWhistleblowerApplicationStore();
