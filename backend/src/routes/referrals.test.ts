import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { sessionStore, userStore } from '../models/authStore.js'
import { expectErrorShape } from '../test-helpers.js'

describe('Referrals API', () => {
  let app: any
  let tenantToken: string
  let landlordToken: string
  let adminToken: string
  let tenantId: string
  let landlordId: string
  let adminId: string

  beforeEach(async () => {
    sessionStore.clear()
    userStore.clear()
    app = createApp()

    // Create a tenant user
    const tenant = await userStore.getOrCreateByEmail('tenant@example.com')
    tenantId = tenant.id
    const tenantSession = await sessionStore.create('tenant@example.com', 'tenant-session-token')
    tenantToken = tenantSession.token

    // Create a landlord user
    const landlord = await userStore.getOrCreateByEmail('landlord@example.com')
    landlordId = landlord.id
    const landlordSession = await sessionStore.create('landlord@example.com', 'landlord-session-token')
    landlordToken = landlordSession.token

    // Create an admin user
    const admin = await userStore.getOrCreateByEmail('admin@example.com')
    adminId = admin.id
    const adminSession = await sessionStore.create('admin@example.com', 'admin-session-token')
    adminToken = adminSession.token
  })

  describe('GET /api/v1/tenant/referral', () => {
    it('should return 404 as route is not mounted', async () => {
      const response = await request(app)
        .get('/api/v1/tenant/referral')
        .expect(404)

      expectErrorShape(response, 'NOT_FOUND', 404)
    })
  })

  describe('POST /api/v1/referrals/apply', () => {
    it('should return 404 as route is not mounted', async () => {
      const response = await request(app)
        .post('/api/v1/referrals/apply')
        .send({
          referralCode: 'ABCD1234',
          referredTenantId: tenantId,
        })
        .expect(404)

      expectErrorShape(response, 'NOT_FOUND', 404)
    })
  })

  describe('GET /api/v1/admin/referrals', () => {
    it('should return 404 as route is not mounted', async () => {
      const response = await request(app)
        .get('/api/v1/admin/referrals')
        .expect(404)

      expectErrorShape(response, 'NOT_FOUND', 404)
    })
  })
})
