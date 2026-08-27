/**
 * Inspection Photo model and types
 */

export interface InspectionPhoto {
  id: string
  inspectionId: string
  url: string
  caption?: string
  takenAt: Date
  createdAt: Date
}

export interface CreateInspectionPhotoInput {
  inspectionId: string
  url: string
  caption?: string
}

export interface UpdateInspectionPhotoInput {
  caption?: string
}
