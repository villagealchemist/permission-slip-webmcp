import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkbenchStore } from '../workbench'
import { ContractExplorer } from './ContractExplorer'

afterEach(cleanup)

function context() {
  return { signal: new AbortController().signal }
}

describe('Port Authority workbench', () => {
  it('shares agent operations with visible audit, staged review, acceptance, and artifacts', async () => {
    const user = userEvent.setup()
    const store = new WorkbenchStore()
    render(<ContractExplorer store={store} />)

    expect(
      await screen.findByRole('heading', { level: 1 }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Harbor desk only')).toBeInTheDocument()
    expect(document.querySelectorAll('.catalog-row')).toHaveLength(5)

    await user.click(screen.getAllByRole('button', { name: 'Inspect the manifest' })[0])
    expect(await screen.findByText('6 found')).toBeInTheDocument()

    await act(async () => {
      await store.getToolContract(
        { toolName: 'get_tool_contract' },
        context(),
      )
    })
    expect(
      screen.getByRole('heading', { name: 'Get tool contract' }),
    ).toBeInTheDocument()

    await act(async () => {
      await store.proposeContractRevision(
        {
          toolName: 'list_tool_contracts',
          baseRevision: 1,
          rationale: 'Replace the deliberately vague seeded description.',
          changes: {
            description:
              'Return the accepted workbench catalog with each fixed tool name, summary, revision, annotation classification, side-effect class, and deterministic finding count.',
          },
        },
        context(),
      )
    })

    expect(screen.getByText('Clearance required')).toBeInTheDocument()
    expect(screen.getByText('Human clearance only')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: /Grant clearance.*Accept this exact revision/i }),
    )
    await waitFor(() => expect(store.getSnapshot().acceptedRevision).toBe(2))
    expect(screen.getByLabelText('Current harbor status')).toHaveTextContent('REV 02')
    expect(screen.getByText('No ship in dry dock')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Open ship’s papers' }),
    )
    expect(await screen.findByText('Uncleared manifest')).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('list_tool_contracts')
  })
})
