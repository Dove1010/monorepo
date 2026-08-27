import express from 'express'
import request from 'supertest'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPropertiesRouter } from './properties.js'
import { listingStore } from '../models/listingStore.js'
import { ListingStatus, type CreateListingInput } from '../models/listing.js'

const app = express()
app.use('/api/properties', createPropertiesRouter())
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status ?? 500).json({ error: { code: err.code, message: err.message } })
})

const PRIVATE_FIELDS = [
  'whistleblowerId',
  'negotiatedLandlordRateNgn',
  'reviewedBy',
  'reviewedAt',
  'rejectionReason',
  'dealId',
]

let seq = 0

async function createApproved(input: Partial<CreateListingInput> = {}) {
  seq += 1
  const listing = await listingStore.create({
    whistleblowerId: `wb-${seq}`,
    address: input.address ?? `${seq} Test Street`,
    city: input.city ?? 'Lagos',
    area: input.area ?? 'Lekki',
    bedrooms: input.bedrooms ?? 2,
    bathrooms: input.bathrooms ?? 1,
    annualRentNgn: input.annualRentNgn ?? 1_500_000,
    outrightPriceNgn: input.outrightPriceNgn,
    installmentBasePriceNgn: input.installmentBasePriceNgn,
    negotiatedLandlordRateNgn: input.negotiatedLandlordRateNgn ?? 1_200_000,
    description: input.description ?? 'A nice place',
    photos: input.photos ?? [
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
      'https://example.com/c.jpg',
    ],
  })
  const approved = await listingStore.moderate(listing.listingId, ListingStatus.APPROVED, 'test-admin')
  if (!approved) throw new Error('moderate returned null')
  return approved
}

describe('Properties Routes', () => {
  beforeEach(async () => {
    seq = 0
    await listingStore.clear()
  })

  describe('GET /api/properties/search', () => {
    it('returns approved listings with a success wrapper', async () => {
      await createApproved({ address: '10 Broad Street', area: 'Victoria Island' })

      const res = await request(app).get('/api/properties/search').expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.total).toBe(1)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].address).toBe('10 Broad Street')
    })

    it('omits private fields from every listing in the response', async () => {
      await createApproved()

      const res = await request(app).get('/api/properties/search').expect(200)

      for (const listing of res.body.data) {
        for (const field of PRIVATE_FIELDS) {
          expect(listing).not.toHaveProperty(field)
        }
      }
    })

    it('does not return listings that are pending review', async () => {
      await listingStore.create({
        whistleblowerId: 'wb-pending',
        address: '1 Pending Road',
        city: 'Lagos',
        area: 'Ikeja',
        bedrooms: 1,
        bathrooms: 1,
        annualRentNgn: 900_000,
        photos: ['https://example.com/p1.jpg', 'https://example.com/p2.jpg', 'https://example.com/p3.jpg'],
      })

      const res = await request(app).get('/api/properties/search').expect(200)

      expect(res.body.total).toBe(0)
      expect(res.body.data).toHaveLength(0)
    })

    it('does not return rejected listings', async () => {
      const listing = await listingStore.create({
        whistleblowerId: 'wb-rej',
        address: '2 Rejected Ave',
        city: 'Lagos',
        area: 'Surulere',
        bedrooms: 2,
        bathrooms: 1,
        annualRentNgn: 1_000_000,
        photos: ['https://example.com/r1.jpg', 'https://example.com/r2.jpg', 'https://example.com/r3.jpg'],
      })
      await listingStore.moderate(listing.listingId, ListingStatus.REJECTED, 'admin', 'Incomplete info')

      const res = await request(app).get('/api/properties/search').expect(200)

      expect(res.body.total).toBe(0)
    })

    it('filters results by bedrooms', async () => {
      await createApproved({ bedrooms: 2 })
      await createApproved({ bedrooms: 3 })
      await createApproved({ bedrooms: 3 })

      const res = await request(app)
        .get('/api/properties/search')
        .query({ bedrooms: 3 })
        .expect(200)

      expect(res.body.total).toBe(2)
      for (const item of res.body.data) {
        expect(item.bedrooms).toBe(3)
      }
    })

    it('paginates results with page and pageSize', async () => {
      for (let i = 0; i < 5; i++) await createApproved()

      const res = await request(app)
        .get('/api/properties/search')
        .query({ page: 2, pageSize: 2 })
        .expect(200)

      expect(res.body.total).toBe(5)
      expect(res.body.page).toBe(2)
      expect(res.body.pageSize).toBe(2)
      expect(res.body.totalPages).toBe(3)
      expect(res.body.data).toHaveLength(2)
    })

    it('clamps pageSize to the schema maximum (100)', async () => {
      const res = await request(app)
        .get('/api/properties/search')
        .query({ pageSize: 9999 })
        .expect(400)

      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('rejects a negative page number', async () => {
      const res = await request(app)
        .get('/api/properties/search')
        .query({ page: 0 })
        .expect(400)

      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns empty result when no listings match filters', async () => {
      await createApproved({ bedrooms: 1 })

      const res = await request(app)
        .get('/api/properties/search')
        .query({ bedrooms: 5 })
        .expect(200)

      expect(res.body.total).toBe(0)
      expect(res.body.data).toEqual([])
    })

    it('exposes expected public fields', async () => {
      await createApproved({
        address: '5 Public Lane',
        city: 'Abuja',
        area: 'Maitama',
        bedrooms: 3,
        bathrooms: 2,
        annualRentNgn: 2_000_000,
        outrightPriceNgn: 2_200_000,
        installmentBasePriceNgn: 2_400_000,
        description: 'Spacious apartment',
        photos: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
      })

      const res = await request(app).get('/api/properties/search').expect(200)
      const item = res.body.data[0]

      expect(item).toHaveProperty('listingId')
      expect(item).toHaveProperty('address', '5 Public Lane')
      expect(item).toHaveProperty('city', 'Abuja')
      expect(item).toHaveProperty('area', 'Maitama')
      expect(item).toHaveProperty('bedrooms', 3)
      expect(item).toHaveProperty('bathrooms', 2)
      expect(item).toHaveProperty('annualRentNgn', 2_000_000)
      expect(item).toHaveProperty('outrightPriceNgn', 2_200_000)
      expect(item).toHaveProperty('installmentBasePriceNgn', 2_400_000)
      expect(item).toHaveProperty('description', 'Spacious apartment')
      expect(item).toHaveProperty('photos')
      expect(item).toHaveProperty('status', ListingStatus.APPROVED)
      expect(item).toHaveProperty('createdAt')
      expect(item).toHaveProperty('updatedAt')
    })
  })

  describe('GET /api/properties/:id', () => {
    it('returns an approved listing by id', async () => {
      const approved = await createApproved({ address: '99 Id Street' })

      const res = await request(app)
        .get(`/api/properties/${approved.listingId}`)
        .expect(200)

      expect(res.body.success).toBe(true)
      expect(res.body.data.listingId).toBe(approved.listingId)
      expect(res.body.data.address).toBe('99 Id Street')
    })

    it('omits private fields from a single listing response', async () => {
      const approved = await createApproved()

      const res = await request(app)
        .get(`/api/properties/${approved.listingId}`)
        .expect(200)

      for (const field of PRIVATE_FIELDS) {
        expect(res.body.data).not.toHaveProperty(field)
      }
    })

    it('returns 404 for a pending listing (not accessible publicly)', async () => {
      const pending = await listingStore.create({
        whistleblowerId: 'wb-x',
        address: '1 Hidden Road',
        city: 'Lagos',
        area: 'Yaba',
        bedrooms: 1,
        bathrooms: 1,
        annualRentNgn: 800_000,
        photos: ['https://example.com/x1.jpg', 'https://example.com/x2.jpg', 'https://example.com/x3.jpg'],
      })

      const res = await request(app)
        .get(`/api/properties/${pending.listingId}`)
        .expect(404)

      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 for a rejected listing', async () => {
      const listing = await listingStore.create({
        whistleblowerId: 'wb-y',
        address: '2 Rejected Close',
        city: 'Lagos',
        area: 'Ikoyi',
        bedrooms: 2,
        bathrooms: 1,
        annualRentNgn: 1_200_000,
        photos: ['https://example.com/y1.jpg', 'https://example.com/y2.jpg', 'https://example.com/y3.jpg'],
      })
      await listingStore.moderate(listing.listingId, ListingStatus.REJECTED, 'admin', 'Bad photos')

      const res = await request(app)
        .get(`/api/properties/${listing.listingId}`)
        .expect(404)

      expect(res.body.error.code).toBe('NOT_FOUND')
    })

    it('returns 404 for a non-existent id', async () => {
      const res = await request(app)
        .get('/api/properties/non-existent-uuid')
        .expect(404)

      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })
})
