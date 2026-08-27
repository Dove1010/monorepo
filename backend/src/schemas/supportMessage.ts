import { z } from 'zod'

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

export const createSupportMessageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  email: z
    .string()
    .trim()
    .email('Email must be a valid email address')
    .max(254, 'Email is too long'),
  phone: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(3, 'Phone is too short').max(32, 'Phone is too long').optional(),
  ),
  subject: z
    .string()
    .trim()
    .min(1, 'Subject is required')
    .max(200, 'Subject is too long'),
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(5000, 'Message is too long'),
})

export type CreateSupportMessageRequest = z.infer<typeof createSupportMessageSchema>

