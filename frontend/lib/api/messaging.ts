import { apiFetch } from "@/lib/api"
import type {
  ConversationWithLastMessage,
  Conversation,
  Message,
  UploadUrlResponse,
  AttachmentUploadResult,
  PaginatedConversations,
  PaginatedMessages,
} from "@/lib/types/messaging"

export async function fetchConversations(cursor?: string, limit = 50, search?: string): Promise<PaginatedConversations> {
  const params = new URLSearchParams()
  if (cursor) params.set("cursor", cursor)
  params.set("limit", String(limit))
  if (search) params.set("search", search)
  const res = await apiFetch<{ success: boolean; data: ConversationWithLastMessage[]; nextCursor: string | null }>(
    `/messaging/conversations?${params.toString()}`,
  )
  return { items: res.data, nextCursor: res.nextCursor }
}

export async function createConversation(participantIds: string[], subjectType?: string, subjectId?: string): Promise<Conversation> {
  const res = await apiFetch<{ success: boolean; data: Conversation }>("/messaging/conversations", {
    method: "POST",
    body: JSON.stringify({ participantIds, subjectType, subjectId }),
  })
  return res.data
}

export async function fetchMessages(conversationId: string, cursor?: string, limit = 50): Promise<PaginatedMessages> {
  const params = new URLSearchParams()
  if (cursor) params.set("cursor", cursor)
  params.set("limit", String(limit))
  const res = await apiFetch<{ success: boolean; data: Message[]; nextCursor: string | null }>(
    `/messaging/conversations/${conversationId}/messages?${params.toString()}`,
  )
  return { items: res.data, nextCursor: res.nextCursor }
}

export async function sendMessage(
  conversationId: string,
  body: string,
  idempotencyKey?: string,
  attachment?: { type: "image" | "document"; name: string; storageKey: string; contentType: string; sizeBytes: number },
): Promise<Message> {
  const headers: Record<string, string> = {}
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey
  }
  const res = await apiFetch<{ success: boolean; data: Message }>(
    `/messaging/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ body, attachment }),
    },
  )
  return res.data
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/messaging/conversations/${conversationId}/read`, {
    method: "POST",
  })
}

export async function fetchUnreadMessageCount(): Promise<number> {
  const res = await apiFetch<{ success: boolean; data: { unread: number } }>("/messaging/unread-count")
  return res.data.unread
}

export async function requestAttachmentUploadUrl(
  contentType: string,
  fileSizeBytes: number,
  fileName: string,
): Promise<UploadUrlResponse> {
  const res = await apiFetch<{ success: boolean; data: UploadUrlResponse }>(
    "/messaging/attachments/upload-url",
    {
      method: "POST",
      body: JSON.stringify({ contentType, fileSizeBytes, fileName }),
    },
  )
  return res.data
}

export async function uploadAttachmentToPresignedUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)

    if (signal) {
      signal.addEventListener("abort", () => xhr.abort())
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error("Upload failed"))
    xhr.onabort = () => reject(new Error("Upload cancelled"))

    xhr.send(file)
  })
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]
const MAX_SIZE = 10 * 1024 * 1024

export function validateFileForUpload(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `File type ${file.type || "unknown"} is not supported` }
  }
  if (file.size > MAX_SIZE) {
    return { valid: false, error: `File size exceeds 10 MB limit` }
  }
  return { valid: true }
}

export async function uploadAttachment(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<AttachmentUploadResult> {
  const validation = validateFileForUpload(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  const { uploadUrl, storageKey } = await requestAttachmentUploadUrl(
    file.type,
    file.size,
    file.name,
  )

  await uploadAttachmentToPresignedUrl(uploadUrl, file, onProgress, signal)

  const fileType: "image" | "document" = file.type.startsWith("image/") ? "image" : "document"

  return {
    storageKey,
    contentType: file.type,
    sizeBytes: file.size,
    type: fileType,
    name: file.name,
    url: uploadUrl.split("?")[0],
  }
}
