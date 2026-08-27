/**
 * Tenant Rating Card API Client
 */

import { apiGet, apiPost } from "./apiClient";

export interface TenantRating {
  ratingId: string;
  landlordId: string;
  tenantId: string;
  dealId: string;
  paymentScore: number;
  propertyCareScore: number;
  communicationScore: number;
  comment?: string;
  createdAt: string;
}

export interface TenantRatingCard {
  tenantId: string;
  compositeScore: number;
  paymentScore: number;
  propertyCareScore: number;
  communicationScore: number;
  totalRatings: number;
  ratings: TenantRating[];
}

export interface PublicRatingCard {
  tenantId: string;
  compositeScore: number;
  paymentScore: number;
  propertyCareScore: number;
  communicationScore: number;
  totalRatings: number;
  ratings: {
    paymentScore: number;
    propertyCareScore: number;
    communicationScore: number;
    comment?: string;
    createdAt: string;
  }[];
}

export interface ShareTokenResponse {
  token: string;
  tenantId: string;
  expiresAt: string;
  createdAt: string;
}

export async function getRatingCard(
  tenantId: string,
): Promise<{ success: boolean; data: TenantRatingCard }> {
  return apiGet(`/api/tenant-rating-card/${tenantId}`);
}

export async function submitRating(
  tenantId: string,
  data: {
    dealId: string;
    paymentScore: number;
    propertyCareScore: number;
    communicationScore: number;
    comment?: string;
  },
): Promise<{ success: boolean; data: TenantRating }> {
  return apiPost(`/api/tenant-rating-card/rate/${tenantId}`, data);
}

export async function generateShareToken(
  tenantId: string,
): Promise<{ success: boolean; data: ShareTokenResponse }> {
  return apiPost(`/api/tenant-rating-card/${tenantId}/share`, {});
}

export async function getSharedRatingCard(
  token: string,
): Promise<{ success: boolean; data: PublicRatingCard }> {
  return apiGet(`/api/tenant-rating-card/shared/${token}`);
}
