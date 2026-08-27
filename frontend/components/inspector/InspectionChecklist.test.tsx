import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InspectionChecklist } from './InspectionChecklist'

describe('InspectionChecklist', () => {
  it('tracks progress and notes when checklist items are updated', () => {
    render(<InspectionChecklist />)

    expect(screen.getByText(/0 of 17 required items completed/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /building exterior condition/i }))
    expect(screen.getByText(/1 of 17 required items completed/i)).toBeInTheDocument()

    const notesField = screen.getAllByPlaceholderText(/Add notes/i)[0]
    fireEvent.change(notesField, { target: { value: 'Needs touch-up' } })
    expect(notesField).toHaveValue('Needs touch-up')
  })
})
