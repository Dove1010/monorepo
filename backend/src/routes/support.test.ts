import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { supportMessageStore } from '../models/supportMessageStore.js'

describe('Support messages API', () => {
  let app: any

  beforeEach(async () => {
    await supportMessageStore.clear()
    app = createApp()
  })

  it('accepts a valid public support inquiry and persists it', async () => {
    const payload = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '+2348012345678',
      subject: 'Help needed',
      message: 'I need help with my account.',
    }

    const res = await request(app)
      .post('/api/support/messages')
      .set('User-Agent', 'vitest')
      .send(payload)
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.messageId).toBeTruthy()

    const all = await supportMessageStore.listAll()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      subject: payload.subject,
      message: payload.message,
    })
  })

  it('returns structured validation errors for invalid submissions', async () => {
    const res = await request(app)
      .post('/api/support/messages')
      .send({
        name: '',
        email: 'not-an-email',
        subject: '',
        message: '',
      })
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.message).toBe('Invalid request data')
    expect(res.body.error.details).toBeTruthy()
    expect(typeof res.body.error.details.name).toBe('string')
    expect(typeof res.body.error.details.email).toBe('string')
    expect(typeof res.body.error.details.subject).toBe('string')
    expect(typeof res.body.error.details.message).toBe('string')
  })

  it('treats empty phone as optional', async () => {
    const res = await request(app)
      .post('/api/support/messages')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        phone: '',
        subject: 'Subject',
        message: 'Message',
      })
      .expect(201)

    expect(res.body.success).toBe(true)
    const all = await supportMessageStore.listAll()
    expect(all[0].phone).toBeUndefined()
  })
})

