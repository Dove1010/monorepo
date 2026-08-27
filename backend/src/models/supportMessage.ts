export type SupportMessage = {
  messageId: string
  name: string
  email: string
  phone?: string
  subject: string
  message: string
  createdAt: Date

  // Optional request context (best-effort; used for abuse triage)
  ip?: string
  userAgent?: string
}

export type CreateSupportMessageInput = {
  name: string
  email: string
  phone?: string
  subject: string
  message: string
  ip?: string
  userAgent?: string
}

