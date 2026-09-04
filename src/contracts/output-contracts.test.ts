import { describe, expect, it } from 'vitest'
import { WorkbenchStore } from '../workbench/store'
import { auditToolContracts } from './audit'
import {
  SECOND_SURFACE_TOOL_CONTRACT_BY_NAME,
  type SecondSurfaceToolName,
} from './registry'
import {
  cloneContracts,
  type WorkbenchJsonValue,
} from './workbenchContract'

function context() {
  return { signal: new AbortController().signal }
}

describe('documented success outputs', () => {
  it('validates every live WorkbenchStore success against its canonical output schema', async () => {
    const proposalInput = {
      toolName: 'list_tool_contracts',
      baseRevision: 1,
      rationale: 'Replace the deliberately vague seeded description.',
      changes: {
        description:
          'Return the accepted workbench catalog with each fixed tool name, summary, revision, annotation classification, side-effect class, and deterministic finding count.',
      },
    } as const

    const listStore = new WorkbenchStore()
    const getStore = new WorkbenchStore()
    const auditStore = new WorkbenchStore()
    const proposalStore = new WorkbenchStore()
    const previewStore = new WorkbenchStore()

    const cases: readonly {
      toolName: SecondSurfaceToolName
      input: WorkbenchJsonValue
      output: unknown
    }[] = [
      {
        toolName: 'list_tool_contracts',
        input: {},
        output: await listStore.listToolContracts(context()),
      },
      {
        toolName: 'get_tool_contract',
        input: { toolName: 'list_tool_contracts' },
        output: await getStore.getToolContract(
          { toolName: 'list_tool_contracts' },
          context(),
        ),
      },
      {
        toolName: 'audit_tool_contracts',
        input: {},
        output: await auditStore.auditToolContracts(context()),
      },
      {
        toolName: 'propose_contract_revision',
        input: proposalInput,
        output: await proposalStore.proposeContractRevision(
          proposalInput,
          context(),
        ),
      },
      {
        toolName: 'preview_contract_bundle',
        input: {},
        output: await previewStore.previewContractBundle(context()),
      },
    ]

    for (const runtimeCase of cases) {
      expect(runtimeCase.output).toMatchObject({ ok: true })
      const contract = SECOND_SURFACE_TOOL_CONTRACT_BY_NAME[runtimeCase.toolName]
      const fixture = cloneContracts([
        {
          ...contract,
          examples: [
            {
              title: 'Observed successful workbench result',
              input: runtimeCase.input,
              output: runtimeCase.output as WorkbenchJsonValue,
            },
          ],
        },
      ])

      expect(
        auditToolContracts(fixture).findings.filter(
          (finding) => finding.code === 'INVALID_EXAMPLE',
        ),
        runtimeCase.toolName,
      ).toEqual([])
    }
  })
})
