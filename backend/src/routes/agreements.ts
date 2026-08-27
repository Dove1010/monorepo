/**
 * Rental Agreements Routes
 * API endpoints for agreement generation and e-signature workflow
 */

import { Router, Request, Response } from "express";
import { agreementService } from "../services/agreementService.js";
import { rentalAgreementStore } from "../models/rentalAgreementStore.js";
import { AppError } from "../errors/AppError.js";
import { ErrorCode } from "../errors/errorCodes.js";

const router = Router();

/**
 * POST /api/agreements/generate
 * Trigger agreement generation for a deal
 */
router.post("/generate", async (req: Request, res: Response, next) => {
  try {
    const { dealId } = req.body;

    if (!dealId) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 400, "dealId is required");
    }

    const agreement = await agreementService.generateAgreement(dealId);

    res.json({
      success: true,
      agreement,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/agreements/:id
 * Download presigned PDF URL for agreement
 */
router.get("/:id", async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const agreement = await rentalAgreementStore.findById(id);
    if (!agreement) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, "Agreement not found");
    }

    // In production, generate presigned S3 URL
    // For MVP, return direct URL path
    const downloadUrl = `${process.env.API_URL || "http://localhost:3001"}/agreements/${id}/download`;

    res.json({
      success: true,
      agreement,
      downloadUrl,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/agreements/:id/sign
 * Record party signature
 */
router.post("/:id/sign", async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { token, signatureData } = req.body;

    if (!token) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        "Signature token is required",
      );
    }

    if (!signatureData || typeof signatureData !== "object") {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        400,
        "signatureData is required",
      );
    }

    const updated = await agreementService.recordSignature(
      id,
      token,
      signatureData,
    );

    res.json({
      success: true,
      agreement: updated,
      message: `Agreement signed successfully. Status: ${updated.status}`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
