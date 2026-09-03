import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
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

const VALID_DRAFT = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  eventType: 'Creative coding and mentorship workshop',
  preferredDate: '2026-10-10',
  estimatedAttendeeCount: 20,
  eventGoal:
    'Pair early-career developers with local mentors for a collaborative workshop',
}

afterEach(cleanup)

describe('Permission Slip interface', () => {
  it('remains usable without WebMCP and completes the human-only path', async () => {
    const user = userEvent.setup()
    render(<App store={createTestStore()} />)

    expect(await screen.findByText('Form-only mode')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Phone' })).not.toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Phone' })).toBeDisabled()
    expect(screen.getByLabelText('Contact name')).toBeRequired()

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
    expect(reviewHeading).toHaveFocus()
    expect(screen.getByText('test-digest')).toBeInTheDocument()
    expect(within(reviewPanel as HTMLElement).getByText('Phone')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Approve this exact disclosure',
      }),
    )
    const approvedHeading = await screen.findByRole('heading', {
      name: 'Approved snapshot',
    })
    expect(screen.getByText('Human approval recorded')).toBeInTheDocument()
    expect(approvedHeading).toHaveFocus()

    await user.click(
      screen.getByRole('button', { name: 'Complete local submission' }),
    )
    const receiptHeading = await screen.findByText('A precise local record')
    expect(receiptHeading).toBeInTheDocument()
    expect(receiptHeading).toHaveFocus()
    expect(screen.getByText('Local demonstration only')).toBeInTheDocument()
    expect(screen.getByText('No network transmission occurred.')).toBeInTheDocument()
  })

  it('commits a buffered field once on blur without replacing the next control', async () => {
    const user = userEvent.setup()
    const store = createTestStore()
    render(<App store={store} />)

    const contactName = screen.getByLabelText('Contact name')
    const email = screen.getByLabelText('Email')

    await user.type(contactName, 'Ava Example')
    expect(store.getSnapshot().draft.contactName).toBeUndefined()
    expect(store.getSnapshot().revision).toBe(0)

    await user.click(email)
    expect(email).toHaveFocus()
    expect(store.getSnapshot().draft.contactName).toBe('Ava Example')
    expect(store.getSnapshot().revision).toBe(1)

    act(() => {
      store.agent.draftIntake(VALID_DRAFT)
    })
    await waitFor(() => expect(contactName).toHaveValue('Maya Chen'))
    expect(screen.getByLabelText('Event type')).toHaveValue(
      'Creative coding and mentorship workshop',
    )
    expect(email).toHaveFocus()
  })

  it('shows authorization separately when an optional field has no value', async () => {
    const user = userEvent.setup()
    render(<App store={createTestStore()} />)

    await user.click(screen.getByRole('switch', { name: 'Phone' }))
    await user.click(
      screen.getByRole('button', { name: 'Load required fields manually' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Prepare exact review' }),
    )

    const authorizedEmptyHeading = await screen.findByRole('heading', {
      name: 'Authorized, no value',
    })
    const authorizedEmptyGroup = authorizedEmptyHeading.closest('.review-group')
    const withheldHeading = screen.getByRole('heading', {
      name: 'Withheld — not authorized',
    })
    const withheldGroup = withheldHeading.closest('.review-group')

    expect(authorizedEmptyGroup).not.toBeNull()
    expect(withheldGroup).not.toBeNull()
    expect(
      within(authorizedEmptyGroup as HTMLElement).getByText('Phone'),
    ).toBeInTheDocument()
    expect(
      within(withheldGroup as HTMLElement).queryByText('Phone'),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Return to editing' }))
    expect(
      screen.getByRole('heading', { name: 'One draft, shared visibly.' }),
    ).toHaveFocus()
  })

  it('focuses the first invalid field and describes a rejection truthfully', async () => {
    const user = userEvent.setup()
    render(<App store={createTestStore()} />)

    await user.click(
      screen.getByRole('button', { name: 'Prepare exact review' }),
    )

    expect(screen.getByLabelText('Contact name')).toHaveFocus()
    expect(screen.getByLabelText('Contact name')).toBeInvalid()
    expect(
      screen.getByText(/Review preparation was rejected\./),
    ).toBeInTheDocument()
  })
})
