/**
 * Public property search routes
 */

import { Router, Request, Response } from 'express'
import { listingStore } from '../models/listingStore.js'
import { Listing, ListingStatus } from '../models/listing.js'
import { propertySearchSchema } from '../schemas/listing.js'
import { AppError } from '../errors/AppError.js'
import { ErrorCode } from '../errors/errorCodes.js'

const router = Router()

function toPublicListing(listing: Listing) {
  const {
    whistleblowerId: _wb,
    negotiatedLandlordRateNgn: _nr,
    reviewedBy: _rb,
    reviewedAt: _ra,
    rejectionReason: _rr,
    dealId: _di,
    ...pub
  } = listing
  return pub
}

/**
 * GET /api/properties/search
 * Search approved listings with advanced filters
 */
router.get('/search', async (req: Request, res: Response, next) => {
  try {
    const filters = propertySearchSchema.parse(req.query)

    const result = await listingStore.list({
      ...filters,
      status: ListingStatus.APPROVED,
    })

    res.json({
      success: true,
      data: result.listings.map(toPublicListing),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return next(new AppError(ErrorCode.VALIDATION_ERROR, 400, error.message))
    }
    next(error)
  }
})

/**
 * GET /api/properties/:id
 * Get a single approved listing by ID
 */
router.get('/:id', async (req: Request, res: Response, next) => {
  try {
    const listing = await listingStore.getById(req.params.id)

    if (!listing || listing.status !== ListingStatus.APPROVED) {
      throw new AppError(ErrorCode.NOT_FOUND, 404, 'Property not found')
    }

    res.json({
      success: true,
      data: toPublicListing(listing),
    })
  } catch (error) {
    next(error)
  }
})

export function createPropertiesRouter(): Router {
  return router
}
