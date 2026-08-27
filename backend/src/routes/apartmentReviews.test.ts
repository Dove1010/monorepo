import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTestAgent, expectErrorShape } from '../test-helpers.js'
import { apartmentReviewStore } from '../models/apartmentReviewStore.js'
import { landlordPropertyStore } from '../models/landlordPropertyStore.js'
import { userStore, sessionStore } from '../models/authStore.js'

describe('Apartment Reviews API', () => {
  const request = createTestAgent()
  const tenantId = 'test-tenant-id'
  const tenantEmail = 'tenant@test.com'
  const token = 'test-tenant-token'
  
  let apartmentId: string

  beforeEach(async () => {
    await apartmentReviewStore.clear()
    await landlordPropertyStore.clear()
    userStore.clear()
    sessionStore.clear()

    // Setup tenant user
    // @ts-ignore
    userStore.fallbackCache.set(tenantEmail, {
      id: tenantId,
      email: tenantEmail,
      name: 'Test Tenant',
      role: 'tenant',
      createdAt: new Date(),
    })

    // Setup session
    // @ts-ignore
    sessionStore.fallbackCache.set(token, {
      token,
      email: tenantEmail,
      createdAt: new Date(),
    })

    // Create an apartment to review
    const apartment = await landlordPropertyStore.create({
      landlordId: 'landlord-1',
      title: 'Test Apartment',
      address: '123 Main St',
      bedrooms: 2,
      bathrooms: 1,
      annualRentNgn: 1000000,
      photos: [],
    })
    apartmentId = apartment.id
    
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('POST /api/apartment-reviews', () => {
    it('should create a review successfully', async () => {
      const response = await request
        .post('/api/apartment-reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          apartmentId,
          rating: 5,
          content: 'Excellent place to stay! Highly recommended.',
          verifiedStay: true,
        })

      expect(response.status).toBe(201)
      expect(response.body.rating).toBe(5)
      expect(response.body.apartmentId).toBe(apartmentId)
      expect(response.body.userId).toBe(tenantId)
      expect(response.body.verifiedStay).toBe(true)
    })

    it('should validate rating range', async () => {
      const response = await request
        .post('/api/apartment-reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          apartmentId,
          rating: 6, // Invalid
          content: 'Short content',
        })

      expectErrorShape(response, 'VALIDATION_ERROR', 400)
    })

    it('should return 404 for non-existent apartment', async () => {
      const response = await request
        .post('/api/apartment-reviews')
        .set('Authorization', `Bearer ${token}`)
        .send({
          apartmentId: '00000000-0000-0000-0000-000000000000',
          rating: 5,
          content: 'This apartment does not exist.',
        })

      expectErrorShape(response, 'NOT_FOUND', 404)
    })
  })

  describe('GET /api/apartment-reviews', () => {
    beforeEach(async () => {
      // Create some reviews
      await apartmentReviewStore.create({ apartmentId, userId: tenantId, rating: 5, content: 'Great!', verifiedStay: true })
      await apartmentReviewStore.create({ apartmentId, userId: 'user-2', rating: 3, content: 'Average.', verifiedStay: false })
      await apartmentReviewStore.create({ apartmentId: 'other-apt', userId: 'user-3', rating: 1, content: 'Bad.', verifiedStay: false })
    })

    it('should list reviews for a specific apartment', async () => {
      const response = await request.get(`/api/apartment-reviews?apartmentId=${apartmentId}`)

      expect(response.status).toBe(200)
      expect(response.body.reviews).toHaveLength(2)
      expect(response.body.total).toBe(2)
    })

    it('should filter by rating', async () => {
      const response = await request.get(`/api/apartment-reviews?apartmentId=${apartmentId}&rating=5`)

      expect(response.status).toBe(200)
      expect(response.body.reviews).toHaveLength(1)
      expect(response.body.reviews[0].rating).toBe(5)
    })

    it('should filter by verified stay', async () => {
      const response = await request.get(`/api/apartment-reviews?apartmentId=${apartmentId}&verifiedStay=true`)

      expect(response.status).toBe(200)
      expect(response.body.reviews).toHaveLength(1)
      expect(response.body.reviews[0].verifiedStay).toBe(true)
    })

    it('should sort by newest first by default', async () => {
      const response = await request.get(`/api/apartment-reviews?apartmentId=${apartmentId}`)
      
      const times = response.body.reviews.map((r: any) => new Date(r.createdAt).getTime())
      expect(times[0]).toBeGreaterThanOrEqual(times[1])
    })

    it('should support pagination', async () => {
      const response = await request.get(`/api/apartment-reviews?apartmentId=${apartmentId}&pageSize=1`)

      expect(response.status).toBe(200)
      expect(response.body.reviews).toHaveLength(1)
      expect(response.body.totalPages).toBe(2)
    })
  })

  describe('POST /api/apartment-reviews/:id/report', () => {
    it('should mark a review as reported', async () => {
      const review = await apartmentReviewStore.create({ apartmentId, userId: tenantId, rating: 5, content: 'Report me' })
      
      const response = await request
        .post(`/api/apartment-reviews/${review.id}/report`)
        .set('Authorization', `Bearer ${token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      
      const updated = await apartmentReviewStore.getById(review.id)
      expect(updated?.isReported).toBe(true)
    })
  })
})
