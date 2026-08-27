import { z } from 'zod'

export const inspectorVerificationStatusSchema = z.enum(['pending', 'verified', 'suspended'])

export const createInspectorProfileSchema = z.object({
  bio: z.string().optional(),
  serviceAreas: z.array(z.string()).min(1, 'At least one service area is required'),
})

export const updateInspectorProfileSchema = z.object({
  bio: z.string().optional(),
  serviceAreas: z.array(z.string()).optional(),
})

export const inspectionStatusSchema = z.enum(['pending', 'in_progress', 'submitted', 'approved', 'rejected'])

export const createPropertyInspectionSchema = z.object({
  listingId: z.string().uuid('Invalid listing ID'),
  inspectorId: z.string().uuid('Invalid inspector ID'),
  scheduledAt: z.coerce.date().optional(),
})

export const updatePropertyInspectionSchema = z.object({
  status: inspectionStatusSchema.optional(),
  inspectorNotes: z.string().optional(),
})

export const checklistCategorySchema = z.enum(['structural', 'plumbing', 'electrical', 'safety', 'exterior'])

export const checklistResultSchema = z.enum(['pass', 'fail', 'na'])

export const createChecklistItemSchema = z.object({
  inspectionId: z.string().uuid('Invalid inspection ID'),
  category: checklistCategorySchema,
  item: z.string().min(1, 'Item description is required'),
  result: checklistResultSchema,
  notes: z.string().optional(),
})

export const updateChecklistItemSchema = z.object({
  result: checklistResultSchema.optional(),
  notes: z.string().optional(),
})

export const createInspectionPhotoSchema = z.object({
  inspectionId: z.string().uuid('Invalid inspection ID'),
  url: z.string().url('Invalid photo URL'),
  caption: z.string().optional(),
})

export const updateInspectionPhotoSchema = z.object({
  caption: z.string().optional(),
})

export const submitReportSchema = z.object({
  inspectionId: z.string().uuid('Invalid inspection ID'),
  checklistItems: z.array(createChecklistItemSchema).min(1, 'At least one checklist item is required'),
  photos: z.array(z.object({
    url: z.string().url('Invalid photo URL'),
    caption: z.string().optional(),
  })).min(1, 'At least one photo is required'),
  inspectorNotes: z.string().min(10, 'Inspector notes must be at least 10 characters'),
})

export const reviewInspectionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional(),
}).refine(
  (data) => data.status !== 'rejected' || (data.rejectionReason && data.rejectionReason.length > 0),
  {
    message: 'Rejection reason is required when rejecting a report',
    path: ['rejectionReason'],
  }
)

export const inspectionSummarySchema = z.object({
  propertyId: z.string().uuid('Invalid property ID'),
})
