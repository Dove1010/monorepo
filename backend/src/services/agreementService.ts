/**
 * Agreement Service
 * Handles rental agreement generation, storage, and e-signature workflow
 */

import * as fs from "fs";
import * as path from "path";
import {
  rentalAgreementStore,
  IRentalAgreementStore,
} from "../models/rentalAgreementStore.js";
import { dealStore } from "../models/dealStore.js";
import {
  RentalAgreement,
  RentalAgreementStatus,
} from "../models/rentalAgreement.js";
import { AppError } from "../errors/AppError.js";
import { ErrorCode } from "../errors/errorCodes.js";
import { logger } from "../utils/logger.js";
import { auditLog } from "../utils/auditLogger.js";
import { notificationService } from "./notificationService.js";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

interface PdfGenerator {
  generate(html: string, options?: any): Promise<Buffer>;
}

export class AgreementService {
  private agreementStore: IRentalAgreementStore;
  private pdfGenerator: PdfGenerator | null = null;

  constructor(agreementStore?: IRentalAgreementStore) {
    this.agreementStore = agreementStore || rentalAgreementStore;
    this.initializePdfGenerator();
  }

  private initializePdfGenerator(): void {
    // Wrap PDF library behind interface for swappability
    // For MVP, using a simple placeholder that creates a mock PDF
    this.pdfGenerator = {
      generate: async (html: string, options?: any) => {
        // Mock implementation - returns a simple PDF-like buffer
        // In production, replace with puppeteer or @pdfme/generator
        return Buffer.from(
          `Mock PDF generated at ${new Date().toISOString()}\n${html}`,
        );
      },
    };
  }

  /**
   * Generate rental agreement PDF
   */
  async generateAgreement(dealId: string): Promise<RentalAgreement> {
    const deal = await dealStore.findById(dealId);
    if (!deal) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, `Deal ${dealId} not found`);
    }

    // Build agreement HTML from template
    const html = await this.renderTemplate(deal);

    // Generate PDF
    if (!this.pdfGenerator) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        500,
        "PDF generator not initialized",
      );
    }

    const pdfBuffer = await this.pdfGenerator.generate(html);
    const pdfKey = `rental-agreements/${dealId}/${randomUUID()}.pdf`;

    // Store PDF to object storage (mock implementation)
    // In production, upload to S3/GCS/etc.
    const agreementDir = path.join(process.cwd(), "stored-agreements");
    if (!fs.existsSync(agreementDir)) {
      fs.mkdirSync(agreementDir, { recursive: true });
    }
    fs.writeFileSync(path.join(agreementDir, `${dealId}.pdf`), pdfBuffer);

    // Create agreement record
    const agreement = await this.agreementStore.create({
      dealId,
      pdfKey,
    });

    // Update status to pending signatures
    await this.agreementStore.updateStatus(
      agreement.id,
      RentalAgreementStatus.PENDING_SIGNATURES,
    );

    // Audit log
    auditLog(
      "AGREEMENT_GENERATED",
      { userId: "system", requestId: "unknown", ip: "unknown", actorType: "system" },
      { agreementId: agreement.id, dealId, pdfKey },
    );

    logger.info(`Generated agreement ${agreement.id} for deal ${dealId}`);
    return agreement;
  }

  /**
   * Request signatures from parties
   */
  async requestSignature(
    agreementId: string,
    tenant: any,
    landlord: any,
  ): Promise<void> {
    const agreement = await this.agreementStore.findById(agreementId);
    if (!agreement) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        `Agreement ${agreementId} not found`,
      );
    }

    // Generate signature tokens
    const tenantToken = this.generateSignatureToken(
      agreementId,
      tenant.id,
      "tenant",
    );
    const landlordToken = this.generateSignatureToken(
      agreementId,
      landlord.id,
      "landlord",
    );

    // Send signature request notifications
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    await notificationService.create(tenant.id, {
      category: "agreement_signature_request",
      title: "Signature requested",
      body: `Your signature is requested on the rental agreement for this deal.`,
      data: {
        agreementId,
        signUrl: `${frontendUrl}/agreements/${agreementId}/sign?token=${tenantToken}`,
      },
    });

    await notificationService.create(landlord.id, {
      category: "agreement_signature_request",
      title: "Signature requested",
      body: `Your signature is requested on the rental agreement for this deal.`,
      data: {
        agreementId,
        signUrl: `${frontendUrl}/agreements/${agreementId}/sign?token=${landlordToken}`,
      },
    });

    // Audit log
    auditLog(
      "AGREEMENT_SIGNATURE_REQUESTED",
      { userId: "system", requestId: "unknown", ip: "unknown", actorType: "system" },
      { agreementId, tenantEmail: tenant.email, landlordEmail: landlord.email },
    );
  }

  /**
   * Record signature from party
   */
  async recordSignature(
    agreementId: string,
    token: string,
    signatureData: Record<string, unknown>,
  ): Promise<RentalAgreement> {
    const agreement = await this.agreementStore.findById(agreementId);
    if (!agreement) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        404,
        `Agreement ${agreementId} not found`,
      );
    }

    // Validate token and extract party info
    const { partyId, partyType } = this.validateSignatureToken(
      token,
      agreementId,
    );

    // Check for duplicate signature
    if (partyType === "tenant" && agreement.tenantSignedAt) {
      throw new AppError(
        ErrorCode.CONFLICT,
        409,
        "Tenant has already signed this agreement",
      );
    }
    if (partyType === "landlord" && agreement.landlordSignedAt) {
      throw new AppError(
        ErrorCode.CONFLICT,
        409,
        "Landlord has already signed this agreement",
      );
    }

    // Record signature
    const updated = await this.agreementStore.recordSignature(
      agreementId,
      partyType,
      signatureData,
    );

    if (!updated) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        500,
        "Failed to record signature",
      );
    }

    // Check if both parties have signed
    if (updated.tenantSignedAt && updated.landlordSignedAt) {
      await this.agreementStore.updateStatus(
        agreementId,
        RentalAgreementStatus.FULLY_EXECUTED,
      );

      // Audit log
      auditLog(
        "AGREEMENT_FULLY_EXECUTED",
        { userId: "system", requestId: "unknown", ip: "unknown", actorType: "system" },
        { agreementId, dealId: agreement.dealId },
      );

      logger.info(`Agreement ${agreementId} is now fully executed`);
    } else {
      // Audit log for single signature
      auditLog(
        "AGREEMENT_SIGNED",
        { userId: partyId, requestId: "unknown", ip: "unknown", actorType: "user" },
        { agreementId, partyType },
      );
    }

    return updated;
  }

  private async renderTemplate(deal: any): Promise<string> {
    // Simple HTML template for rental agreement
    // In production, use Handlebars or similar templating
    return `
      <html>
        <head>
          <title>Rental Agreement</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { text-align: center; }
            .section { margin: 20px 0; }
            .field { margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1>Rental Agreement</h1>
          <div class="section">
            <p><strong>Deal ID:</strong> ${deal.dealId}</p>
            <p><strong>Annual Rent (NGN):</strong> ${deal.annualRentNgn}</p>
            <p><strong>Deposit (NGN):</strong> ${deal.depositNgn}</p>
            <p><strong>Term (Months):</strong> ${deal.termMonths}</p>
            <p><strong>Effective Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <div class="section">
            <p>This rental agreement is entered into between the Landlord and Tenant as outlined above.</p>
            <p>Payment Schedule: ${deal.termMonths === 1 ? "Outright" : "Installments"}</p>
          </div>
          <p>Signature pages to follow...</p>
        </body>
      </html>
    `;
  }

  private generateSignatureToken(
    agreementId: string,
    partyId: string,
    partyType: "tenant" | "landlord",
  ): string {
    const expiresIn = "7d";
    return jwt.sign(
      {
        agreementId,
        partyId,
        partyType,
        iat: Math.floor(Date.now() / 1000),
      },
      process.env.JWT_SECRET || "test-secret",
      { expiresIn },
    );
  }

  private validateSignatureToken(
    token: string,
    agreementId: string,
  ): { partyId: string; partyType: "tenant" | "landlord" } {
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "test-secret",
      ) as any;
      if (decoded.agreementId !== agreementId) {
        throw new AppError(
          ErrorCode.UNAUTHORIZED,
          401,
          "Token does not match agreement",
        );
      }
      return {
        partyId: decoded.partyId,
        partyType: decoded.partyType,
      };
    } catch (error) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        401,
        "Invalid or expired signature token",
      );
    }
  }
}

export const agreementService = new AgreementService();
