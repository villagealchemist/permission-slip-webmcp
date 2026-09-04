import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkbenchStore } from '../workbench'
import { ContractExplorer } from './ContractExplorer'

afterEach(cleanup)

function context() {
  return { signal: new AbortController().signal }
}

describe('Second Surface workbench', () => {
  it('shares agent operations with visible audit, staged review, acceptance, and artifacts', async () => {
    const user = userEvent.setup()
    const store = new WorkbenchStore()
    render(<ContractExplorer store={store} />)

    expect(
      await screen.findByRole('heading', {
        name: 'See the interface your users’ agents see.',
      }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Visual workbench mode')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Inspect|Open now/ })).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: 'Run catalog audit' }))
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

    expect(screen.getByText('Decision required')).toBeInTheDocument()
    expect(screen.getByText('Only you can decide')).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Accept this revision' }),
    )
    await waitFor(() => expect(store.getSnapshot().acceptedRevision).toBe(2))
    expect(screen.getByText('Accepted revision 2')).toBeInTheDocument()
    expect(screen.getByText('None pending')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Preview artifact bundle' }),
    )
    expect(await screen.findByText('Preview ready')).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('list_tool_contracts')
  })
})
