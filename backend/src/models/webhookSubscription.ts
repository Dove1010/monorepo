import { randomUUID } from 'node:crypto'

export enum WebhookEventType {
  DEAL_ACTIVATED = 'deal.activated',
  DEAL_COMPLETED = 'deal.completed',
  DEAL_DEFAULTED = 'deal.defaulted',
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_OVERDUE = 'payment.overdue',
  PAYOUT_DISBURSED = 'payout.disbursed',
  KYC_APPROVED = 'kyc.approved',
  KYC_REJECTED = 'kyc.rejected'
}

export interface WebhookSubscription {
  id: string
  ownerId: string
  targetUrl: string
  secret: string // SHA-256 hash of plain secret
  events: WebhookEventType[]
  active: boolean
  createdAt: Date
}

export interface WebhookDeliveryLog {
  id: string
  subscriptionId: string
  event: WebhookEventType
  payload: Record<string, unknown>
  status: 'delivered' | 'failed' | 'permanently_failed'
  responseCode?: number
  responseBody?: string
  requestId?: string
  attemptedAt: Date
}

const subscriptions = new Map<string, WebhookSubscription>()
const deliveryLogs = new Map<string, WebhookDeliveryLog[]>()

export const webhookSubscriptionStore = {
  create(data: {
    ownerId: string
    targetUrl: string
    secret: string // Store the hashed secret
    events: WebhookEventType[]
  }): WebhookSubscription {
    const sub: WebhookSubscription = {
      id: randomUUID(),
      ownerId: data.ownerId,
      targetUrl: data.targetUrl,
      secret: data.secret,
      events: data.events,
      active: true,
      createdAt: new Date(),
    }
    subscriptions.set(sub.id, sub)
    return sub
  },

  findById(id: string): WebhookSubscription | undefined {
    return subscriptions.get(id)
  },

  listByOwner(ownerId: string): WebhookSubscription[] {
    return Array.from(subscriptions.values()).filter(s => s.ownerId === ownerId)
  },

  listActiveByEvent(event: WebhookEventType): WebhookSubscription[] {
    return Array.from(subscriptions.values()).filter(s => s.active && s.events.includes(event))
  },

  delete(id: string): boolean {
    return subscriptions.delete(id)
  },

  updateActive(id: string, active: boolean): void {
    const sub = subscriptions.get(id)
    if (sub) {
      sub.active = active
      subscriptions.set(id, sub)
    }
  },

  clear() {
    subscriptions.clear()
    deliveryLogs.clear()
  }
}

export const webhookDeliveryStore = {
  logAttempt(log: Omit<WebhookDeliveryLog, 'id' | 'attemptedAt'>): WebhookDeliveryLog {
    const fullLog: WebhookDeliveryLog = {
      ...log,
      id: randomUUID(),
      attemptedAt: new Date(),
    }
    const list = deliveryLogs.get(log.subscriptionId) || []
    list.push(fullLog)
    deliveryLogs.set(log.subscriptionId, list)
    return fullLog
  },

  getHistoryBySubscription(subscriptionId: string): WebhookDeliveryLog[] {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const list = deliveryLogs.get(subscriptionId) || []
    return list.filter(l => l.attemptedAt.getTime() > thirtyDaysAgo)
  }
}
