/**
 * Inspector Dashboard API Client
 *
 * Wires the inspector dashboard to GET /jobs, POST /jobs/:id/claim,
 * and POST /jobs/:id/report on the backend.
 */

import { apiGet, apiPost } from "./apiClient";

// ── Backend API response types ──────────────────────────────────────

export type BackendJobStatus =
  | "available"
  | "claimed"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected";

export interface BackendInspectionJob {
  id: string;
  listingId: string;
  inspectorId?: string;
  status: BackendJobStatus;
  offeredFeeNgn: number;
  claimDeadline?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackendInspectionReport {
  id: string;
  jobId: string;
  overallGrade: "A" | "B" | "C" | "D";
  roomChecklist: Record<string, unknown>;
  photoKeys: string[];
  notes: string;
  submittedAt: string;
}

interface BackendListJobsResponse {
  success: true;
  data: BackendInspectionJob[];
}

interface BackendJobResponse {
  success: true;
  data: BackendInspectionJob;
}

interface BackendReportResponse {
  success: true;
  data: {
    job: BackendInspectionJob;
    report: BackendInspectionReport;
  };
}

// ── Frontend-facing types (match existing InspectorJob shape) ───────

export type InspectionType = "new_listing" | "re_inspection";
export type JobStatus = "available" | "claimed" | "in_progress" | "completed";
export type PaymentStatus = "pending" | "paid";

export interface InspectorJob {
  id: string;
  listingId: string;
  propertyTitle: string;
  address: string;
  inspectionType: InspectionType;
  offeredFee: number;
  deadline: string;
  status: JobStatus;
  claimedBy?: string;
  claimedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface InspectorEarning {
  id: string;
  jobId: string;
  propertyTitle: string;
  address: string;
  inspectionType: InspectionType;
  fee: number;
  status: PaymentStatus;
  completedAt: string;
  paidAt?: string;
}

// ── API functions ───────────────────────────────────────────────────

export async function getInspectorJobs(): Promise<InspectorJob[]> {
  const response = await apiGet<BackendListJobsResponse>(
    "/api/v1/inspector/jobs",
  );
  return (response.data ?? []).map(mapBackendJob);
}

export async function claimJob(jobId: string): Promise<InspectorJob> {
  const response = await apiPost<BackendJobResponse>(
    `/api/v1/inspector/jobs/${jobId}/claim`,
    {},
  );
  return mapBackendJob(response.data);
}

export interface SubmitReportPayload {
  overallGrade: "A" | "B" | "C" | "D";
  roomChecklist: Record<string, unknown>;
  photoKeys: string[];
  notes: string;
}

export async function submitReport(
  jobId: string,
  payload: SubmitReportPayload,
): Promise<{ job: InspectorJob; report: BackendInspectionReport }> {
  const response = await apiPost<BackendReportResponse>(
    `/api/v1/inspector/jobs/${jobId}/report`,
    payload,
  );
  return {
    job: mapBackendJob(response.data.job),
    report: response.data.report,
  };
}

// ── Mappers ─────────────────────────────────────────────────────────

function mapBackendJob(b: BackendInspectionJob): InspectorJob {
  const status = mapStatus(b.status);
  return {
    id: b.id,
    listingId: b.listingId,
    propertyTitle: `Listing #${b.listingId.slice(0, 8)}`,
    address: "",
    inspectionType: "new_listing",
    offeredFee: b.offeredFeeNgn,
    deadline: b.claimDeadline || b.createdAt,
    status,
    claimedBy: b.inspectorId,
    claimedAt: undefined,
    completedAt: b.approvedAt || b.submittedAt,
    createdAt: b.createdAt,
  };
}

function mapStatus(s: BackendJobStatus): JobStatus {
  switch (s) {
    case "available":
      return "available";
    case "claimed":
      return "claimed";
    case "in_progress":
      return "in_progress";
    case "submitted":
    case "approved":
    case "rejected":
      return "completed";
  }
}
