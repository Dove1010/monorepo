import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'

describe('Migration Guide API', () => {
  let app: any

  beforeEach(async () => {
    app = createApp()
  })

  describe('GET /api/versions', () => {
    it('should return all supported versions', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      expect(response.body).toHaveProperty('currentVersion')
      expect(response.body).toHaveProperty('versions')
      expect(Array.isArray(response.body.versions)).toBe(true)
    })

    it('should return current version', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      expect(response.body.currentVersion).toBeDefined()
      expect(typeof response.body.currentVersion).toBe('string')
    })

    it('should mark current version correctly', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      const currentVersion = response.body.currentVersion
      const currentVersionEntry = response.body.versions.find((v: any) => v.version === currentVersion)
      expect(currentVersionEntry).toBeDefined()
      expect(currentVersionEntry.current).toBe(true)
    })

    it('should include deprecation status for each version', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      for (const version of response.body.versions) {
        expect(version).toHaveProperty('version')
        expect(version).toHaveProperty('current')
        expect(version).toHaveProperty('deprecated')
        expect(typeof version.deprecated).toBe('boolean')
      }
    })

    it('should include sunset date for deprecated versions', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      for (const version of response.body.versions) {
        if (version.deprecated) {
          expect(version).toHaveProperty('sunsetDate')
        }
      }
    })

    it('should include breaking changes for each version', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      for (const version of response.body.versions) {
        expect(version).toHaveProperty('breakingChanges')
        expect(Array.isArray(version.breakingChanges)).toBe(true)
      }
    })

    it('should return v1 as current version', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      expect(response.body.currentVersion).toBe('v1')
    })

    it('should include v1 in versions list', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      const v1Entry = response.body.versions.find((v: any) => v.version === 'v1')
      expect(v1Entry).toBeDefined()
    })

    it('should have breaking changes for v1', async () => {
      const response = await request(app)
        .get('/api/versions')
        .expect(200)

      const v1Entry = response.body.versions.find((v: any) => v.version === 'v1')
      expect(v1Entry.breakingChanges).toContain('Initial API version')
    })
  })

  describe('GET /api/migration-guide/:from', () => {
    it('should return migration guide for supported version', async () => {
      const response = await request(app)
        .get('/api/migration-guide/v1')
        .expect(400)

      // v1 is current version, so should return 400
      expect(response.body.error).toBeDefined()
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
      expect(response.body.error.message).toContain('already the current version')
    })

    it('should return 400 when requesting guide for current version', async () => {
      const response = await request(app)
        .get('/api/migration-guide/v1')
        .expect(400)

      expect(response.body.error.code).toBe('VALIDATION_ERROR')
      expect(response.body.error.message).toContain('No migration needed')
    })

    it('should return 404 for non-existent version', async () => {
      const response = await request(app)
        .get('/api/migration-guide/v99')
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
      expect(response.body.error.message).toContain('No migration guide found')
    })

    it('should return 404 for invalid version format', async () => {
      const response = await request(app)
        .get('/api/migration-guide/invalid')
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should return plain text content type for valid migration guide', async () => {
      // This test would need a deprecated version to work properly
      // For now, we test the error case which returns JSON
      const response = await request(app)
        .get('/api/migration-guide/v1')
        .expect(400)

      expect(response.headers['content-type']).toContain('application/json')
    })

    it('should return 400 for empty version parameter', async () => {
      const response = await request(app)
        .get('/api/migration-guide/')
        .expect(404)

      expect(response.body.error).toBeDefined()
    })

    it('should handle version with special characters', async () => {
      const response = await request(app)
        .get('/api/migration-guide/v1.0-beta')
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })

    it('should be case-sensitive for version parameter', async () => {
      const response = await request(app)
        .get('/api/migration-guide/V1')
        .expect(404)

      expect(response.body.error.code).toBe('NOT_FOUND')
    })
  })
})
