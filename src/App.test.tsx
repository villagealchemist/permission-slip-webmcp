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
  inquiryType: 'prototype',
  desiredOutcome: 'Turn a rough product idea into a working prototype.',
  relevantBackground: 'The concept and audience exist; the product flow does not.',
  timeline: 'Eight weeks',
  preferredResponseMethod: 'email',
  requestedNextStep: 'discovery_call',
}

afterEach(cleanup)

describe('Permission Slip project inquiry interface', () => {
  it('remains usable without WebMCP and completes the human-only golden path', async () => {
    const user = userEvent.setup()
    render(<App store={createTestStore()} />)

    expect(await screen.findByText('Form-only mode')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Include budget or constraints' }),
    ).not.toBeChecked()
    expect(screen.getByLabelText('Contact name')).toBeRequired()

    await user.click(
      screen.getByRole('button', { name: 'Load fictional rehearsal' }),
    )
    expect(screen.getByLabelText('Contact name')).toHaveValue('Maya Chen')
    expect(screen.getByLabelText('Requested next step')).toHaveValue(
      'discovery_call',
    )

    await user.click(
      screen.getByRole('switch', { name: 'Include budget or constraints' }),
    )
    await user.click(
      screen.getByRole('checkbox', {
        name: /I am requesting the next step written above/,
      }),
    )
    await user.click(
      screen.getByRole('checkbox', { name: /Reply about this project/ }),
    )

    await user.click(
      screen.getByRole('button', { name: 'Prepare exact review' }),
    )
    const reviewHeading = await screen.findByRole('heading', {
      name: 'Check exactly what will be recorded',
    })
    const reviewPanel = reviewHeading.closest('section')
    expect(reviewPanel).not.toBeNull()
    expect(reviewHeading).toHaveFocus()
    expect(screen.getByText('test-digest')).toBeInTheDocument()
    expect(
      within(reviewPanel as HTMLElement).getByText(
        'Qualified by explicit next-step intent',
      ),
    ).toBeInTheDocument()
    expect(
      within(reviewPanel as HTMLElement).getByText(
        /Village Alchemist project inquiry desk/,
      ),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Approve this exact inquiry' }),
    )
    const approvedHeading = await screen.findByRole('heading', {
      name: 'Approved snapshot',
    })
    expect(screen.getByText('Human approval recorded')).toBeInTheDocument()
    expect(approvedHeading).toHaveFocus()

    await user.click(
      screen.getByRole('button', { name: 'Complete local submission' }),
    )
    const receiptHeading = await screen.findByRole('heading', {
      name: 'The outcome is understandable and recoverable',
    })
    expect(receiptHeading).toHaveFocus()
    expect(screen.getByText('No network transmission occurred.')).toBeInTheDocument()
    expect(screen.getByText(/no real business inquiry is sent/i)).toBeInTheDocument()
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
    expect(screen.getByLabelText('Inquiry type')).toHaveValue(
      'prototype',
    )
    expect(email).toHaveFocus()
  })

  it('distinguishes assistant suggestions from human verification', async () => {
    const user = userEvent.setup()
    const store = createTestStore()

    act(() => {
      store.agent.draftIntake(VALID_DRAFT)
    })
    render(<App store={store} />)

    expect(screen.getAllByText('Assistant suggestion')).toHaveLength(9)
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Verify current suggestions' }),
    )

    expect(await screen.findAllByText('Verified')).toHaveLength(8)
    expect(
      screen.queryByRole('button', { name: 'Verify current suggestions' }),
    ).not.toBeInTheDocument()
  })

  it('keeps optional-field permission separate from contact permission', async () => {
    const user = userEvent.setup()
    render(<App store={createTestStore()} />)

    const budgetSwitch = screen.getByRole('switch', {
      name: 'Include budget or constraints',
    })
    const projectResponse = screen.getByRole('checkbox', {
      name: /Reply about this project/,
    })
    const updates = screen.getByRole('checkbox', {
      name: /Occasional updates/,
    })

    await user.click(budgetSwitch)
    expect(budgetSwitch).toBeChecked()
    expect(projectResponse).not.toBeChecked()
    expect(updates).not.toBeChecked()

    await user.click(projectResponse)
    expect(projectResponse).toBeChecked()
    expect(updates).not.toBeChecked()
  })

  it('focuses the first invalid field and describes a rejection truthfully', async () => {
    const user = userEvent.setup()
    render(<App store={createTestStore()} />)

    await user.click(
      screen.getByRole('button', { name: 'Prepare exact review' }),
    )

    expect(screen.getByLabelText('Inquiry type')).toHaveFocus()
    expect(screen.getByLabelText('Inquiry type')).toBeInvalid()
    expect(
      screen.getByText(/Review preparation was rejected\./),
    ).toBeInTheDocument()
  })
})
