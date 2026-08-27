/**
 * Quote / Calculator routes - returns pricing for both tiers
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  computeInstallmentSchedule,
  computeOutrightBreakdown,
  INTEREST_TIERS,
} from '../services/pricingService.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'

const router = Router()

const quoteSchema = z.object({
  annualRentNgn: z.coerce.number().positive().int(),
  depositPercent: z.coerce.number().min(0.2).max(1).default(0.2),
})

/**
 * GET /api/quote
 * Returns pricing for outright and all installment tiers
 */
router.get('/', async (req: Request, res: Response, next) => {
  try {
    const { annualRentNgn, depositPercent } = quoteSchema.parse(req.query)

    const outright = computeOutrightBreakdown(annualRentNgn, depositPercent)

    const installmentTiers: Record<string, unknown> = {}
    for (const [term, rate] of Object.entries(INTEREST_TIERS)) {
      installmentTiers[`installment${term}`] = {
        ...computeInstallmentSchedule(annualRentNgn, depositPercent, parseInt(term, 10)),
        termMonths: parseInt(term, 10),
        interestRate: rate,
      }
    }

    res.json({
      success: true,
      data: {
        annualRentNgn,
        depositPercent,
        outright: {
          ...outright,
          paymentType: 'outright' as const,
        },
        ...installmentTiers,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 400, error.message))
    }
    next(error)
  }
})

export function createQuoteRouter(): Router {
  return router
}
