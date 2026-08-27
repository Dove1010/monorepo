/**
 * Inspection Checklist Item model and types
 */

export enum ChecklistCategory {
  STRUCTURAL = 'structural',
  PLUMBING = 'plumbing',
  ELECTRICAL = 'electrical',
  SAFETY = 'safety',
  EXTERIOR = 'exterior',
}

export enum ChecklistResult {
  PASS = 'pass',
  FAIL = 'fail',
  NA = 'na',
}

export interface InspectionChecklistItem {
  id: string
  inspectionId: string
  category: ChecklistCategory
  item: string
  result: ChecklistResult
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface CreateChecklistItemInput {
  inspectionId: string
  category: ChecklistCategory
  item: string
  result: ChecklistResult
  notes?: string
}

export interface UpdateChecklistItemInput {
  result?: ChecklistResult
  notes?: string
}
