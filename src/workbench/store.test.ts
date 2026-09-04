import { describe, expect, it } from 'vitest'
import { WorkbenchStore } from './store'

function context() {
  return { signal: new AbortController().signal }
}

const CLEAR_LIST_DESCRIPTION =
  'Return the accepted workbench catalog with each fixed tool name, summary, revision, annotation classification, side-effect class, and deterministic finding count.'

describe('Second Surface shared workbench store', () => {
  it('runs the complete inspect, audit, stage, human-accept, and preview path', async () => {
    const store = new WorkbenchStore()
    const initial = store.getSnapshot()
    expect(initial.acceptedContracts).toHaveLength(5)
    expect(initial.findings.length).toBeGreaterThan(0)

    const catalog = await store.listToolContracts(context())
    expect(catalog.ok).toBe(true)
    if (!catalog.ok) return
    expect(catalog.data.tools.map((tool) => tool.name)).toContain(
      'propose_contract_revision',
    )

    const inspected = await store.getToolContract(
      { toolName: 'list_tool_contracts' },
      context(),
    )
    expect(inspected.ok).toBe(true)
    expect(store.getSnapshot().selectedToolName).toBe('list_tool_contracts')

    const audited = await store.auditToolContracts(context())
    expect(audited.ok).toBe(true)
    expect(store.getSnapshot().auditHasRun).toBe(true)

    const staged = await store.proposeContractRevision(
      {
        toolName: 'list_tool_contracts',
        baseRevision: 1,
        rationale: 'Replace the deliberately vague seeded description.',
        changes: { description: CLEAR_LIST_DESCRIPTION },
      },
      context(),
    )
    expect(staged.ok).toBe(true)
    const pending = store.getSnapshot().pendingRevision
    expect(pending).not.toBeNull()
    expect(
      store
        .getSnapshot()
        .acceptedContracts.find((tool) => tool.name === 'list_tool_contracts')
        ?.description,
    ).toBe('Lists tools.')
    expect(pending?.projectedFindingCount).toBeLessThan(
      pending?.currentFindingCount ?? 0,
    )

    const accepted = store.human.acceptPendingRevision()
    expect(accepted.ok).toBe(true)
    expect(store.getSnapshot().acceptedRevision).toBe(2)
    expect(
      store
        .getSnapshot()
        .acceptedContracts.find((tool) => tool.name === 'list_tool_contracts')
        ?.description,
    ).toBe(CLEAR_LIST_DESCRIPTION)

    const previewed = await store.previewContractBundle(context())
    expect(previewed.ok).toBe(true)
    const bundle = store.getSnapshot().artifactBundle
    expect(bundle?.contractJson).toContain(CLEAR_LIST_DESCRIPTION)
    expect(bundle?.markdown).toContain('list_tool_contracts')
    expect(bundle?.openApiJson).toContain('"x-network-endpoint": false')
    expect(bundle?.openApiJson).toContain('"x-documentation-projection": true')
  })

  it('rejects a staged revision without changing accepted contracts', async () => {
    const store = new WorkbenchStore()
    const before = store.getSnapshot().acceptedContracts
    const staged = await store.proposeContractRevision(
      {
        toolName: 'list_tool_contracts',
        baseRevision: 1,
        rationale: 'Make the seeded description more precise.',
        changes: { description: CLEAR_LIST_DESCRIPTION },
      },
      context(),
    )
    expect(staged.ok).toBe(true)

    const rejected = store.human.rejectPendingRevision()
    expect(rejected.ok).toBe(true)
    expect(store.getSnapshot().pendingRevision).toBeNull()
    expect(store.getSnapshot().acceptedContracts).toBe(before)
    expect(store.getSnapshot().acceptedRevision).toBe(1)
  })

  it('rejects a stale proposal atomically', async () => {
    const store = new WorkbenchStore()
    const before = store.getSnapshot()
    const result = await store.proposeContractRevision(
      {
        toolName: 'list_tool_contracts',
        baseRevision: 99,
        rationale: 'This revision is intentionally stale.',
        changes: { description: CLEAR_LIST_DESCRIPTION },
      },
      context(),
    )

    expect(result.ok).toBe(false)
    expect(store.getSnapshot()).toBe(before)
  })
})
