import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DocumentPreviewDialog } from './document-preview-dialog'

describe('DocumentPreviewDialog', () => {
  it('shows the loading state while a preview is pending', () => {
    render(
      <DocumentPreviewDialog
        preview={null}
        loading={true}
        error={null}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/loading document/i)
  })

  it('renders an informative error state when the preview fails', () => {
    render(
      <DocumentPreviewDialog
        preview={{
          fileName: 'lease.pdf',
          fileFormat: 'pdf',
          storageKey: 'https://example.com/lease.pdf',
          previewAvailable: false,
          message: 'Preview not available',
          fileSizeBytes: 1024,
        } as any}
        loading={false}
        error={null}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByText(/preview not available/i)).toBeInTheDocument()
  })
})
