import { describe, it, expect } from 'vitest'
import { createTestAgent, expectErrorShape } from '../test-helpers.js'
import request from 'supertest'
import { createApp } from '../app.js'

describe('Property Inspections API', () => {
  const request = createTestAgent()

  describe('GET /api/v1/properties/:propertyId/inspection-summary', () => {
    it('should return 404 for property without inspection', async () => {
      const response = await request.get('/api/v1/properties/non-existent/inspection-summary')
      expectErrorShape(response, 'NOT_FOUND', 404)
    })
  })
})
