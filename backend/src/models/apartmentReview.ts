export interface ApartmentReview {
  id: string
  apartmentId: string
  userId: string
  userName?: string
  rating: number
  content: string
  verifiedStay: boolean
  isHidden: boolean
  isReported: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateApartmentReviewInput {
  apartmentId: string
  userId: string
  rating: number
  content: string
  verifiedStay?: boolean
}

export interface ApartmentReviewFilters {
  apartmentId?: string
  rating?: number
  verifiedStay?: boolean
  includeHidden?: boolean
  sortBy?: 'newest' | 'oldest' | 'rating_desc' | 'rating_asc'
  page?: number
  pageSize?: number
}

export interface PaginatedApartmentReviews {
  reviews: ApartmentReview[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
