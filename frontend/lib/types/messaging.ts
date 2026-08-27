export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed"

export type AttachmentType = "image" | "document"

export interface MessageAttachment {
  type: AttachmentType
  name: string
  storageKey: string
  contentType: string
  sizeBytes: number
  url?: string
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  body: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  attachment: MessageAttachment | null
}

export interface ConversationParticipant {
  userId: string
  role: string
  lastReadAt: string | null
  joinedAt: string
}

export interface Conversation {
  id: string
  subjectType: string | null
  subjectId: string | null
  createdAt: string
  updatedAt: string
  participants: ConversationParticipant[]
}

export interface ConversationWithLastMessage extends Conversation {
  lastMessage: {
    text: string
    senderId: string
    createdAt: string
  } | null
  unreadCount: number
}

export interface UploadUrlResponse {
  uploadUrl: string
  storageKey: string
  expiresAt: string
  expiresInSeconds: number
}

export interface AttachmentUploadResult {
  storageKey: string
  contentType: string
  sizeBytes: number
  type: AttachmentType
  name: string
  url: string
}

export interface PaginatedConversations {
  items: ConversationWithLastMessage[]
  nextCursor: string | null
}

export interface PaginatedMessages {
  items: Message[]
  nextCursor: string | null
}
