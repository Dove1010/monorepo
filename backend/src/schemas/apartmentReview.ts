import { z } from 'zod'

export const createApartmentReviewSchema = z.object({
  apartmentId: z.string().uuid('Invalid apartment ID'),
  rating: z.number().int().min(1).max(5, 'Rating must be between 1 and 5'),
  content: z.string().min(10, 'Review content must be at least 10 characters long').max(2000, 'Review content is too long'),
  verifiedStay: z.boolean().optional(),
})

export const apartmentReviewFiltersSchema = z.object({
  apartmentId: z.string().uuid('Invalid apartment ID').optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  verifiedStay: z.preprocess((val) => val === 'true', z.boolean()).optional(),
  sortBy: z.enum(['newest', 'oldest', 'rating_desc', 'rating_asc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
})
