export type PropertyIssueReport = {
  reportId: string
  propertyId: string
  category: string
  details: string
  ip?: string
  userAgent?: string
  createdAt: Date
}

export type CreatePropertyIssueReportInput = {
  propertyId: string
  category: string
  details: string
  ip?: string
  userAgent?: string
}

