import { describe, it, expect, beforeEach } from "vitest";
import {
  generateLeaseDraft,
  buildLeaseTemplateData,
} from "./leaseDocumentService.js";
import { leaseAgreementStore } from "../models/leaseAgreementStore.js";
import { LeaseStatus } from "../models/leaseAgreement.js";
import { Deal, DealStatus } from "../models/deal.js";

const mockDeal: Deal = {
  dealId: "deal-123",
  tenantId: "tenant-1",
  landlordId: "landlord-1",
  annualRentNgn: 1200000,
  depositNgn: 600000,
  financedAmountNgn: 1800000,
  termMonths: 12,
  createdAt: new Date("2025-01-01"),
  status: DealStatus.ACTIVE,
  repaymentMethod: "self_pay",
};

describe("leaseDocumentService", () => {
  beforeEach(async () => {
    await leaseAgreementStore.clear();
  });

  describe("generateLeaseDraft", () => {
    it("creates a lease agreement in DRAFT status", async () => {
      const templateData = buildLeaseTemplateData(mockDeal, "123 Main St");
      const result = await generateLeaseDraft("deal-123", templateData);

      expect(result.leaseId).toBeDefined();
      expect(result.documentKey).toMatch(/^lease\/deal-123\//);
      expect(result.documentKey).toMatch(/\.pdf$/);

      const lease = await leaseAgreementStore.getById(result.leaseId);
      expect(lease?.status).toBe(LeaseStatus.DRAFT);
      expect(lease?.dealId).toBe("deal-123");
    });

    it("prevents creating a second lease for the same deal", async () => {
      const templateData = buildLeaseTemplateData(mockDeal, "123 Main St");

      await generateLeaseDraft("deal-123", templateData);

      await expect(
        generateLeaseDraft("deal-123", templateData),
      ).rejects.toThrow("A lease agreement already exists for deal deal-123");
    });

    it("allows creating a new lease after voiding the old one", async () => {
      const templateData = buildLeaseTemplateData(mockDeal, "123 Main St");

      const first = await generateLeaseDraft("deal-123", templateData);
      await leaseAgreementStore.void(first.leaseId);

      const second = await generateLeaseDraft("deal-123", templateData);
      expect(second.leaseId).not.toBe(first.leaseId);
      expect(second.leaseId).toBeDefined();
    });

    it("generates unique document keys for each lease", async () => {
      const templateData = buildLeaseTemplateData(mockDeal, "123 Main St");

      await leaseAgreementStore.void(
        (await generateLeaseDraft("deal-123", templateData)).leaseId,
      );
      const first = await generateLeaseDraft("deal-123", templateData);

      await leaseAgreementStore.void(
        (await generateLeaseDraft("deal-456", templateData)).leaseId,
      );
      const second = await generateLeaseDraft("deal-456", templateData);

      expect(first.documentKey).not.toBe(second.documentKey);
    });
  });

  describe("buildLeaseTemplateData", () => {
    it("populates template data with correct deal terms", () => {
      const data = buildLeaseTemplateData(mockDeal, "123 Main St, Lagos");

      expect(data.tenantName).toBe("Tenant tenant-1");
      expect(data.landlordName).toBe("Landlord landlord-1");
      expect(data.propertyAddress).toBe("123 Main St, Lagos");
      expect(data.annualRentNgn).toBe(1200000);
      expect(data.depositAmount).toBe(600000);
      expect(data.termMonths).toBe(12);
      expect(data.leaseDuration).toBe("12 months");
    });

    it("reflects payment type from deal", () => {
      const outright = { ...mockDeal, termMonths: 1 };
      const installment = { ...mockDeal, termMonths: 12 };

      const outrightData = buildLeaseTemplateData(outright, "123 Main St");
      const installmentData = buildLeaseTemplateData(
        installment,
        "123 Main St",
      );

      expect(outrightData.paymentType).toBe("installment");
      expect(installmentData.paymentType).toBe("installment");
    });

    it("includes platform terms in template", () => {
      const data = buildLeaseTemplateData(mockDeal, "123 Main St");
      expect(data.platformTerms).toContain("Shelterflex");
    });

    it("generates deterministic output for same inputs", () => {
      const data1 = buildLeaseTemplateData(mockDeal, "123 Main St");
      const data2 = buildLeaseTemplateData(mockDeal, "123 Main St");

      expect(data1).toEqual(data2);
    });

    it("changes when deal terms change", () => {
      const data1 = buildLeaseTemplateData(mockDeal, "123 Main St");

      const updatedDeal = {
        ...mockDeal,
        annualRentNgn: 2400000,
        depositNgn: 1200000,
      };
      const data2 = buildLeaseTemplateData(updatedDeal, "123 Main St");

      expect(data2.annualRentNgn).toBe(2400000);
      expect(data2.depositAmount).toBe(1200000);
      expect(data1).not.toEqual(data2);
    });
  });
});
