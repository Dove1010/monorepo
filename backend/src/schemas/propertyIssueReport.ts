import { z } from 'zod'

type Normalized = {
  propertyId: string
  category: string
  details: string
}

export const createPropertyIssueReportSchema = z
  .object({
    propertyId: z.string().trim().min(1, 'Property ID is required').max(128),

    // Frontend currently uses these names
    reportCategory: z.string().trim().min(1).max(64).optional(),
    reportDetails: z.string().trim().min(1).max(2000).optional(),

    // Allow normalized field names too
    category: z.string().trim().min(1).max(64).optional(),
    details: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    const category = val.category ?? val.reportCategory
    const details = val.details ?? val.reportDetails

    if (!category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Category is required',
        path: ['category'],
      })
    }

    if (!details) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Details are required',
        path: ['details'],
      })
    }
  })
  .transform((val): Normalized => {
    return {
      propertyId: val.propertyId,
      category: (val.category ?? val.reportCategory)!,
      details: (val.details ?? val.reportDetails)!,
    }
  })

export type CreatePropertyIssueReportRequest = z.infer<typeof createPropertyIssueReportSchema>

