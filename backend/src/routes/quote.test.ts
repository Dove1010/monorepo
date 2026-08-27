import express from 'express'
import request from 'supertest'
import { describe, it, expect } from 'vitest'
import { createQuoteRouter } from './quote.js'
import { INTEREST_TIERS, computeOutrightBreakdown, computeInstallmentSchedule } from '../services/pricingService.js'

const app = express()
app.use('/api/quote', createQuoteRouter())
app.use((err: any, _req: any, res: any, _next: any) => {
  res.status(err.status ?? 500).json({ error: { code: err.code, message: err.message } })
})

describe('GET /api/quote', () => {
  it('returns outright and all installment tiers for valid inputs', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: 2_000_000, depositPercent: 0.3 })
      .expect(200)

    expect(res.body.success).toBe(true)
    const { data } = res.body
    expect(data.annualRentNgn).toBe(2_000_000)
    expect(data.depositPercent).toBe(0.3)
    expect(data.outright).toBeDefined()
    expect(data.outright.paymentType).toBe('outright')
    for (const term of Object.keys(INTEREST_TIERS)) {
      expect(data[`installment${term}`]).toBeDefined()
    }
  })

  it('defaults depositPercent to 0.2 when omitted', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: 1_500_000 })
      .expect(200)

    expect(res.body.data.depositPercent).toBe(0.2)
  })

  it('outright amounts match the pricing service', async () => {
    const annualRentNgn = 3_000_000
    const depositPercent = 0.25
    const expected = computeOutrightBreakdown(annualRentNgn, depositPercent)

    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn, depositPercent })
      .expect(200)

    const { outright } = res.body.data
    expect(outright.depositAmount).toBe(expected.depositAmount)
    expect(outright.balanceDue).toBe(expected.balanceDue)
    expect(outright.totalPayable).toBe(expected.totalPayable)
  })

  it('installment amounts match the pricing service for each tier', async () => {
    const annualRentNgn = 2_400_000
    const depositPercent = 0.2

    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn, depositPercent })
      .expect(200)

    const { data } = res.body
    for (const [term, rate] of Object.entries(INTEREST_TIERS)) {
      const expected = computeInstallmentSchedule(annualRentNgn, depositPercent, parseInt(term, 10))
      const tier = data[`installment${term}`]
      expect(tier.termMonths).toBe(parseInt(term, 10))
      expect(tier.interestRate).toBe(rate)
      expect(tier.depositAmount).toBe(expected.depositAmount)
      expect(tier.monthlyPayment).toBe(expected.monthlyPayment)
      expect(tier.totalRepayment).toBe(expected.totalRepayment)
    }
  })

  it('rejects missing annualRentNgn with 400', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({})
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects non-positive annualRentNgn with 400', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: -1 })
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects annualRentNgn of zero with 400', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: 0 })
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects depositPercent below minimum (0.2) with 400', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: 2_000_000, depositPercent: 0.1 })
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects depositPercent above 1 with 400', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: 2_000_000, depositPercent: 1.5 })
      .expect(400)

    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('accepts depositPercent of exactly 1 (full upfront)', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: 1_000_000, depositPercent: 1 })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.outright.balanceDue).toBe(0)
  })

  it('response shape includes all expected fields on outright tier', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: 2_000_000 })
      .expect(200)

    const { outright } = res.body.data
    expect(outright).toHaveProperty('depositAmount')
    expect(outright).toHaveProperty('balanceDue')
    expect(outright).toHaveProperty('totalPayable')
    expect(outright).toHaveProperty('paymentType', 'outright')
  })

  it('response shape includes all expected fields on installment tiers', async () => {
    const res = await request(app)
      .get('/api/quote')
      .query({ annualRentNgn: 2_000_000 })
      .expect(200)

    for (const term of Object.keys(INTEREST_TIERS)) {
      const tier = res.body.data[`installment${term}`]
      expect(tier).toHaveProperty('depositAmount')
      expect(tier).toHaveProperty('financedBalance')
      expect(tier).toHaveProperty('interestAmount')
      expect(tier).toHaveProperty('monthlyPayment')
      expect(tier).toHaveProperty('totalRepayment')
      expect(tier).toHaveProperty('termMonths')
      expect(tier).toHaveProperty('interestRate')
    }
  })
})
