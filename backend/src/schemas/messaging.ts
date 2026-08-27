import { z } from 'zod'

export const createConversationSchema = z.object({
  participantIds: z.array(z.string().min(1)).min(1).max(50),
  subjectType: z.string().optional(),
  subjectId: z.string().optional(),
})

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(5000),
  attachment: z.object({
    type: z.enum(['image', 'document']),
    name: z.string().min(1).max(255),
    storageKey: z.string().min(1),
    contentType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
  }).optional(),
})

export const conversationFiltersSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().optional(),
})

export const messageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type CreateConversationRequest = z.infer<typeof createConversationSchema>
export type SendMessageRequest = z.infer<typeof sendMessageSchema>
export type ConversationFiltersRequest = z.infer<typeof conversationFiltersSchema>
export type MessageQueryRequest = z.infer<typeof messageQuerySchema>
