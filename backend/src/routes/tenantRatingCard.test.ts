import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { sessionStore, userStore } from '../models/authStore.js'
import { expectErrorShape } from '../test-helpers.js'

describe('Tenant Rating Card API', () => {
  let app: any
  let landlordToken: string
  let tenantToken: string
  let adminToken: string
  let landlordId: string
  let tenantId: string
  let adminId: string

  beforeEach(async () => {
    sessionStore.clear()
    userStore.clear()
    app = createApp()

    // Create a landlord user
    const landlord = await userStore.getOrCreateByEmail('landlord@example.com')
    landlordId = landlord.id
    const landlordSession = await sessionStore.create('landlord@example.com', 'landlord-session-token')
    landlordToken = landlordSession.token

    // Create a tenant user
    const tenant = await userStore.getOrCreateByEmail('tenant@example.com')
    tenantId = tenant.id
    const tenantSession = await sessionStore.create('tenant@example.com', 'tenant-session-token')
    tenantToken = tenantSession.token

    // Create an admin user
    const admin = await userStore.getOrCreateByEmail('admin@example.com')
    adminId = admin.id
    const adminSession = await sessionStore.create('admin@example.com', 'admin-session-token')
    adminToken = adminSession.token
  })

  describe('POST /api/v1/ratings/tenant', () => {
    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/ratings/tenant')
        .send({
          tenantId,
          dealId: 'deal-123',
          paymentTimeliness: 5,
          propertyCare: 4,
          communication: 5,
          overall: 5,
        })
        .expect(401)

      expectErrorShape(response, 'UNAUTHORIZED', 401)
    })

    it('should reject tenant (non-landlord) user', async () => {
      const response = await request(app)
        .post('/api/v1/ratings/tenant')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          tenantId,
          dealId: 'deal-123',
          paymentTimeliness: 5,
          propertyCare: 4,
          communication: 5,
          overall: 5,
        })
        .expect(403)

      expectErrorShape(response, 'FORBIDDEN', 403)
    })
  })

  describe('GET /api/v1/ratings/tenant/my-card', () => {
    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .get('/api/v1/ratings/tenant/my-card')
        .expect(401)

      expectErrorShape(response, 'UNAUTHORIZED', 401)
    })
  })

  describe('POST /api/v1/ratings/tenant/share-token', () => {
    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/ratings/tenant/share-token')
        .expect(401)

      expectErrorShape(response, 'UNAUTHORIZED', 401)
    })
  })
})
