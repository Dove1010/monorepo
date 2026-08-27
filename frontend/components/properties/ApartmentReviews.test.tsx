// ApartmentReviews.test.tsx – component tests for ApartmentReviews
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@/components/__tests__/test-utils';
import { ApartmentReviews } from '@/components/properties/ApartmentReviews';
import '@testing-library/jest-dom';

// Mock next/navigation hooks
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/property/123',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the review API
jest.mock('@/lib/reviewApi', () => ({
  getApartmentReviews: jest.fn(),
}));

import { getApartmentReviews } from '@/lib/reviewApi';

const mockReviews = [
  {
    id: 'r1',
    rating: 5,
    userName: 'Alice',
    content: 'Great place!',
    date: new Date().toISOString(),
    verifiedStay: true,
  },
  {
    id: 'r2',
    rating: 3,
    userName: 'Bob',
    content: 'Average experience.',
    date: new Date().toISOString(),
    verifiedStay: false,
  },
];

describe('ApartmentReviews component', () => {
  beforeEach(() => {
    (getApartmentReviews as jest.Mock).mockResolvedValue({
      reviews: mockReviews,
      totalPages: 1,
      total: 2,
      aggregateRating: 4.0,
    });
  });

  it('displays loading spinner initially', async () => {
    render(<ApartmentReviews propertyId="prop-123" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  });

  it('renders reviews after loading', async () => {
    render(<ApartmentReviews propertyId="prop-123" />);
    await waitFor(() => expect(screen.getByText(/great place!/i)).toBeInTheDocument());
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getByText(/average experience/i)).toBeInTheDocument();
    // Verify aggregate rating is shown
    expect(screen.getByText('4.0')).toBeInTheDocument();
  });

  it('shows error state when API fails', async () => {
    (getApartmentReviews as jest.Mock).mockRejectedValue(new Error('Network'));
    render(<ApartmentReviews propertyId="prop-123" />);
    await waitFor(() => expect(screen.getByText(/error/i)).toBeInTheDocument());
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    expect(retryBtn).toBeInTheDocument();
    // Mock successful retry
    (getApartmentReviews as jest.Mock).mockResolvedValue({
      reviews: mockReviews,
      totalPages: 1,
      total: 2,
      aggregateRating: 4.0,
    });
    fireEvent.click(retryBtn);
    await waitFor(() => expect(screen.getByText(/great place!/i)).toBeInTheDocument());
  });

  it('handles empty reviews list', async () => {
    (getApartmentReviews as jest.Mock).mockResolvedValue({
      reviews: [],
      totalPages: 0,
      total: 0,
      aggregateRating: null,
    });
    render(<ApartmentReviews propertyId="prop-123" />);
    await waitFor(() => expect(screen.getByText(/no reviews/i)).toBeInTheDocument());
  });
});
