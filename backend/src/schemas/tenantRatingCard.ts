import { z } from 'zod'

/**
 * Schema for submitting a tenant rating
 */
export const createRatingSchema = z.object({
  dealId: z.string().min(1, 'Deal ID is required'),
  paymentScore: z.number().int().min(1).max(5),
  propertyCareScore: z.number().int().min(1).max(5),
  communicationScore: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
})

export type CreateRatingRequest = z.infer<typeof createRatingSchema>

/**
 * Schema for share token query params
 */
export const shareTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})
