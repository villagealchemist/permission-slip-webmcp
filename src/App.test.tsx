import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { PermissionSlipStore } from './store'

function createTestStore(): PermissionSlipStore {
  let id = 0
  return new PermissionSlipStore({
    storage: null,
    dependencies: {
      now: () => '2026-09-03T16:00:00.000Z',
      createId: (kind) => `${kind}_test_${++id}`,
      digest: async () => 'test-digest',
    },
  })
}

describe('Permission Slip interface', () => {
  it('remains usable without WebMCP and completes the human-only path', async () => {
    const user = userEvent.setup()
    render(<App store={createTestStore()} />)

    expect(await screen.findByText('Form-only mode')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Phone' })).not.toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Phone' })).toBeDisabled()

    await user.click(
      screen.getByRole('button', { name: 'Load required fields manually' }),
    )
    expect(screen.getByLabelText('Contact name')).toHaveValue('Maya Chen')
    expect(screen.getByLabelText('Email')).toHaveValue(
      'maya.chen@example.com',
    )
    expect(screen.getAllByText('Human')).toHaveLength(6)

    await user.click(
      screen.getByRole('button', { name: 'Prepare exact review' }),
    )
    const reviewHeading = await screen.findByText('Ready for your review')
    const reviewPanel = reviewHeading.closest('section')
    expect(reviewPanel).not.toBeNull()
    expect(screen.getByText('test-digest')).toBeInTheDocument()
    expect(within(reviewPanel as HTMLElement).getByText('Phone')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Approve this exact disclosure',
      }),
    )
    expect(screen.getByText('Human approval recorded')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Complete local submission' }),
    )
    expect(await screen.findByText('A precise local record')).toBeInTheDocument()
    expect(screen.getByText('Local demonstration only')).toBeInTheDocument()
    expect(screen.getByText('No network transmission occurred.')).toBeInTheDocument()
  })
})
