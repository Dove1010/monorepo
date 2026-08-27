export enum ParticipantRole {
  MEMBER = 'member',
  ADMIN = 'admin',
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ConversationParticipant {
  userId: string;
  role: ParticipantRole;
  lastReadAt: string | null;
  joinedAt: string;
}

export interface Conversation {
  id: string;
  subjectType: string | null;
  subjectId: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ConversationParticipant[];
}

export interface ConversationWithLastMessage extends Conversation {
  lastMessage: {
    text: string;
    senderId: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachment: MessageAttachment | null;
}

export interface MessageAttachment {
  type: 'image' | 'document';
  name: string;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreateConversationInput {
  participantIds: string[];
  subjectType?: string;
  subjectId?: string;
}

export interface SendMessageInput {
  conversationId: string;
  senderId: string;
  body: string;
  idempotencyKey?: string;
  attachment?: MessageAttachment;
}

export interface ConversationFilter {
  cursor?: string;
  limit?: number;
  search?: string;
}
