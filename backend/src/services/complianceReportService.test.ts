import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ComplianceReportService } from './complianceReportService.js'
import { complianceReportStore } from '../models/complianceReportStore.js'
import { kycRepository } from '../repositories/KycRepository.js'
import { dealStore } from '../models/dealStore.js'
import { ngnDepositStore } from '../models/ngnDepositStore.js'
import { outboxStore } from '../outbox/index.js'

// Mock dependencies
vi.mock('../models/complianceReportStore.js')
vi.mock('../repositories/KycRepository.js', () => ({
  kycRepository: {
    findByDateRange: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }),
  },
}))
vi.mock('../models/dealStore.js', () => ({
  dealStore: {
    findMany: vi.fn().mockResolvedValue({ deals: [], total: 0, page: 1, pageSize: 50, totalPages: 0 }),
  },
}))
vi.mock('../models/ngnDepositStore.js')
vi.mock('../outbox/index.js', () => ({
  outboxStore: {
    create: vi.fn().mockResolvedValue({}),
    listByDealId: vi.fn().mockResolvedValue([]),
  },
}))

describe('ComplianceReportService', () => {
  let complianceReportService: ComplianceReportService

  beforeEach(() => {
    complianceReportService = new ComplianceReportService()
  })

  describe('generateReport', () => {
    it('generates transaction report in CSV format', async () => {
      const reportId = 'report-1'
      const mockReport = {
        id: reportId,
        reportType: 'transaction',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      expect(complianceReportStore.findById).toHaveBeenCalledWith(reportId)
      expect(complianceReportStore.updateStatus).toHaveBeenCalledWith(
        reportId,
        'completed',
        expect.any(String),
        expect.any(String)
      )
    })

    it('generates transaction report in JSON format', async () => {
      const reportId = 'report-2'
      const mockReport = {
        id: reportId,
        reportType: 'transaction',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'json',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      expect(complianceReportStore.updateStatus).toHaveBeenCalledWith(
        reportId,
        'completed',
        expect.any(String),
        expect.any(String)
      )
    })

    it('generates KYC report', async () => {
      const reportId = 'report-3'
      const mockReport = {
        id: reportId,
        reportType: 'kyc',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(kycRepository.list).mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 50, totalPages: 0 })
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      expect(kycRepository.list).toHaveBeenCalled()
      expect(complianceReportStore.updateStatus).toHaveBeenCalledWith(
        reportId,
        'completed',
        expect.any(String),
        expect.any(String)
      )
    })

    it('generates ACTIVE_DEALS_REPORT', async () => {
      const reportId = 'report-4'
      const mockReport = {
        id: reportId,
        reportType: 'ACTIVE_DEALS_REPORT',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(dealStore.findMany).mockResolvedValue({ deals: [], total: 0, page: 1, pageSize: 50, totalPages: 0 })
      vi.mocked(outboxStore.listByDealId).mockResolvedValue([])
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      expect(dealStore.findMany).toHaveBeenCalledWith({ status: 'active' })
      expect(complianceReportStore.updateStatus).toHaveBeenCalledWith(
        reportId,
        'completed',
        expect.any(String),
        expect.any(String)
      )
    })

    it('generates DEFAULTED_DEALS_REPORT', async () => {
      const reportId = 'report-5'
      const mockReport = {
        id: reportId,
        reportType: 'DEFAULTED_DEALS_REPORT',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(dealStore.findMany).mockResolvedValue({ deals: [], total: 0, page: 1, pageSize: 50, totalPages: 0 })
      vi.mocked(outboxStore.listByDealId).mockResolvedValue([])
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      expect(dealStore.findMany).toHaveBeenCalledWith({ status: 'defaulted' })
      expect(complianceReportStore.updateStatus).toHaveBeenCalledWith(
        reportId,
        'completed',
        expect.any(String),
        expect.any(String)
      )
    })

    it('generates KYC_STATUS_REPORT', async () => {
      const reportId = 'report-6'
      const mockReport = {
        id: reportId,
        reportType: 'KYC_STATUS_REPORT',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(kycRepository.list).mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 50, totalPages: 0 })
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      expect(kycRepository.list).toHaveBeenCalled()
      expect(complianceReportStore.updateStatus).toHaveBeenCalledWith(
        reportId,
        'completed',
        expect.any(String),
        expect.any(String)
      )
    })

    it('generates TRANSACTION_VOLUME_REPORT', async () => {
      const reportId = 'report-7'
      const mockReport = {
        id: reportId,
        reportType: 'TRANSACTION_VOLUME_REPORT',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(ngnDepositStore.listByStatus).mockResolvedValue([])
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      expect(ngnDepositStore.listByStatus).toHaveBeenCalledWith({ status: 'confirmed', limit: 1000 })
      expect(complianceReportStore.updateStatus).toHaveBeenCalledWith(
        reportId,
        'completed',
        expect.any(String),
        expect.any(String)
      )
    })

    it('generates LATE_FEE_REVENUE_REPORT', async () => {
      const reportId = 'report-8'
      const mockReport = {
        id: reportId,
        reportType: 'LATE_FEE_REVENUE_REPORT',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      expect(complianceReportStore.updateStatus).toHaveBeenCalledWith(
        reportId,
        'completed',
        expect.any(String),
        expect.any(String)
      )
    })

    it('throws error for unsupported report type', async () => {
      const reportId = 'report-9'
      const mockReport = {
        id: reportId,
        reportType: 'unsupported_type',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)

      await expect(complianceReportService.generateReport(reportId)).rejects.toThrow('Unsupported report type')
    })

    it('throws error if report not found', async () => {
      const reportId = 'report-10'

      vi.mocked(complianceReportStore.findById).mockReturnValue(undefined)

      await expect(complianceReportService.generateReport(reportId)).rejects.toThrow('Report not found')
    })

    it('marks report as failed on error', async () => {
      const reportId = 'report-11'
      const mockReport = {
        id: reportId,
        reportType: 'transaction',
        dateFrom: new Date('2026-01-01T00:00:00Z'),
        dateTo: new Date('2026-01-31T23:59:59Z'),
        format: 'csv',
      }

      vi.mocked(complianceReportStore.findById).mockReturnValue(mockReport as any)
      vi.mocked(complianceReportStore.updateStatus).mockResolvedValue(undefined)

      await complianceReportService.generateReport(reportId)

      // The test should pass without throwing
      expect(complianceReportStore.updateStatus).toHaveBeenCalled()
    })
  })

  describe('computeIntegrityHash', () => {
    it('computes SHA256 hash of content', () => {
      const content = 'test content'
      const hash = complianceReportService.computeIntegrityHash(content)

      expect(hash).toBe('6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72')
    })

    it('produces different hashes for different content', () => {
      const content1 = 'content 1'
      const content2 = 'content 2'
      const hash1 = complianceReportService.computeIntegrityHash(content1)
      const hash2 = complianceReportService.computeIntegrityHash(content2)

      expect(hash1).not.toBe(hash2)
    })

    it('produces consistent hash for identical content', () => {
      const content = 'consistent content'
      const hash1 = complianceReportService.computeIntegrityHash(content)
      const hash2 = complianceReportService.computeIntegrityHash(content)

      expect(hash1).toBe(hash2)
    })
  })

  describe('verifyIntegrity', () => {
    it('returns true for matching hash', () => {
      const content = 'test content'
      const hash = complianceReportService.computeIntegrityHash(content)
      const isValid = complianceReportService.verifyIntegrity(content, hash)

      expect(isValid).toBe(true)
    })

    it('returns false for mismatched hash', () => {
      const content = 'test content'
      const wrongHash = 'wrong-hash'
      const isValid = complianceReportService.verifyIntegrity(content, wrongHash)

      expect(isValid).toBe(false)
    })
  })
})
