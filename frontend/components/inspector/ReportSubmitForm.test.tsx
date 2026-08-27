import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportSubmitForm } from './ReportSubmitForm'
import { propertyInspectionApi } from '@/lib/propertyInspectionApi'

vi.mock('@/lib/propertyInspectionApi', () => ({
  propertyInspectionApi: {
    submitReport: vi.fn(),
  },
}))

describe('ReportSubmitForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:inspection-photo'),
    })
  })

  it('submits the inspection report after the required fields are completed', async () => {
    const onSubmitted = vi.fn()
    const submitReportMock = vi.mocked(propertyInspectionApi.submitReport)
    submitReportMock.mockResolvedValue(undefined as never)

    render(<ReportSubmitForm jobId="job-42" propertyTitle="Sunny Villa" onSubmitted={onSubmitted} />)

    fireEvent.change(screen.getByLabelText(/summary of findings/i), {
      target: { value: 'All systems are in good order.' },
    })

    const fileInput = screen.getByLabelText(/upload inspection photos/i)
    fireEvent.change(fileInput, {
      target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] },
    })

    screen.getAllByRole('checkbox').forEach((checkbox) => {
      fireEvent.click(checkbox)
    })

    fireEvent.click(screen.getByRole('button', { name: /submit inspection report/i }))

    expect(submitReportMock).toHaveBeenCalledWith(
      'job-42',
      expect.objectContaining({
        inspectorNotes: 'All systems are in good order.',
      }),
    )
    expect(onSubmitted).toHaveBeenCalledTimes(1)
  })
})
