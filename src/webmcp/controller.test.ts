import { describe, expect, it, vi } from 'vitest'
import {
  SECOND_SURFACE_TOOL_CONTRACT_BY_NAME,
  SECOND_SURFACE_TOOL_NAMES,
} from '../contracts'
import {
  createSecondSurfaceWebMcpController,
  type SecondSurfaceWebMcpAdapter,
  type WebMcpRegistrationTarget,
} from './index'

function acceptedContracts() {
  return SECOND_SURFACE_TOOL_NAMES.map(
    (name) => SECOND_SURFACE_TOOL_CONTRACT_BY_NAME[name],
  )
}

function ok(operation: string) {
  return { ok: true, data: { operation } } as const
}

function createAdapter(): SecondSurfaceWebMcpAdapter {
  return {
    getAcceptedContracts: vi.fn(acceptedContracts),
    listToolContracts: vi.fn<
      SecondSurfaceWebMcpAdapter['listToolContracts']
    >(() => ok('list')),
    getToolContract: vi.fn<SecondSurfaceWebMcpAdapter['getToolContract']>(
      () => ok('get'),
    ),
    auditToolContracts: vi.fn<
      SecondSurfaceWebMcpAdapter['auditToolContracts']
    >(() => ok('audit')),
    proposeContractRevision: vi.fn<
      SecondSurfaceWebMcpAdapter['proposeContractRevision']
    >(() => ok('propose')),
    previewContractBundle: vi.fn<
      SecondSurfaceWebMcpAdapter['previewContractBundle']
    >(() => ok('preview')),
  }
}

function createRegistrationTarget() {
  const registrations: Array<{
    tool: WebMCP.ModelContextTool
    options?: WebMCP.ModelContextRegisterToolOptions
  }> = []
  const target: WebMcpRegistrationTarget = {
    registerTool: vi.fn(async (tool, options) => {
      registrations.push({ tool, options })
    }),
  }
  return { registrations, target }
}

describe('Second Surface WebMCP registration', () => {
  it('registers the exact accepted five in canonical order and cleans them up with one signal', async () => {
    const adapter = createAdapter()
    const { registrations, target } = createRegistrationTarget()
    const controller = createSecondSurfaceWebMcpController({
      getAdapter: () => adapter,
      modelContext: target,
    })

    await expect(controller.start()).resolves.toMatchObject({
      phase: 'ready',
      supported: true,
      registeredToolCount: 5,
    })

    expect(registrations.map(({ tool }) => tool.name)).toEqual(
      SECOND_SURFACE_TOOL_NAMES,
    )
    registrations.forEach(({ tool }, index) => {
      const contract = acceptedContracts()[index]
      expect(tool).toMatchObject({
        name: contract.name,
        title: contract.title,
        description: contract.description,
        annotations: contract.annotations,
      })
      expect(tool.inputSchema).toBe(contract.inputSchema)
      expect(
        (tool.inputSchema as { additionalProperties?: boolean })
          .additionalProperties,
      ).toBe(false)
    })

    const signals = registrations.map(({ options }) => options?.signal)
    expect(signals.every((signal) => signal === signals[0])).toBe(true)
    expect(signals[0]?.aborted).toBe(false)

    controller.stop()
    expect(signals[0]?.aborted).toBe(true)
    expect(controller.getStatus()).toMatchObject({
      phase: 'stopped',
      registeredToolCount: 0,
    })
  })

  it('falls back without registering when document.modelContext is unavailable', async () => {
    const adapter = createAdapter()
    const controller = createSecondSurfaceWebMcpController({
      getAdapter: () => adapter,
      modelContext: null,
    })

    await expect(controller.start()).resolves.toEqual({
      phase: 'unsupported',
      supported: false,
      registeredToolCount: 0,
    })
  })

  it('rejects unknown proposal properties at every structured level without invoking the adapter', async () => {
    const adapter = createAdapter()
    const { registrations, target } = createRegistrationTarget()
    const controller = createSecondSurfaceWebMcpController({
      getAdapter: () => adapter,
      modelContext: target,
    })
    await controller.start()

    const proposalTool = registrations.find(
      ({ tool }) => tool.name === 'propose_contract_revision',
    )?.tool
    expect(proposalTool).toBeDefined()

    const result = await proposalTool?.execute(
      {
        toolName: 'get_tool_contract',
        baseRevision: 1,
        rationale: 'Clarify the lookup contract.',
        changes: {
          annotations: { readOnlyHint: true, hiddenAuthority: true },
          privacy: {
            outputSource: 'system',
            note: 'Returns accepted contract metadata.',
            telemetry: true,
          },
          inventedBehavior: 'publish the revision',
        },
        bypassHumanReview: true,
      },
      { signal: new AbortController().signal },
    )

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        retryable: true,
        details: {
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: 'bypassHumanReview',
              code: 'unknown_property',
            }),
            expect.objectContaining({
              path: 'changes.inventedBehavior',
              code: 'unknown_property',
            }),
            expect.objectContaining({
              path: 'changes.annotations.hiddenAuthority',
              code: 'unknown_property',
            }),
            expect.objectContaining({
              path: 'changes.privacy.telemetry',
              code: 'unknown_property',
            }),
          ]),
        },
      },
    })
    expect(adapter.proposeContractRevision).not.toHaveBeenCalled()
  })

  it('rejects a lookup outside the exact five-tool enum', async () => {
    const adapter = createAdapter()
    const { registrations, target } = createRegistrationTarget()
    const controller = createSecondSurfaceWebMcpController({
      getAdapter: () => adapter,
      modelContext: target,
    })
    await controller.start()

    const lookupTool = registrations.find(
      ({ tool }) => tool.name === 'get_tool_contract',
    )?.tool
    const result = await lookupTool?.execute(
      { toolName: 'publish_contract_bundle' },
      { signal: new AbortController().signal },
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    })
    expect(adapter.getToolContract).not.toHaveBeenCalled()
  })

  it('resolves the live adapter and forwards the invocation AbortSignal', async () => {
    const firstAdapter = createAdapter()
    const currentAdapter = createAdapter()
    let liveAdapter = firstAdapter
    const { registrations, target } = createRegistrationTarget()
    const controller = createSecondSurfaceWebMcpController({
      getAdapter: () => liveAdapter,
      modelContext: target,
    })
    await controller.start()
    liveAdapter = currentAdapter

    const lookupTool = registrations.find(
      ({ tool }) => tool.name === 'get_tool_contract',
    )?.tool
    const invocationController = new AbortController()
    await lookupTool?.execute(
      { toolName: 'audit_tool_contracts' },
      { signal: invocationController.signal },
    )

    expect(firstAdapter.getToolContract).not.toHaveBeenCalled()
    expect(currentAdapter.getToolContract).toHaveBeenCalledWith(
      { toolName: 'audit_tool_contracts' },
      { signal: invocationController.signal },
    )
  })

  it('supports experimental builds that omit invocation options', async () => {
    const adapter = createAdapter()
    const { registrations, target } = createRegistrationTarget()
    const controller = createSecondSurfaceWebMcpController({
      getAdapter: () => adapter,
      modelContext: target,
    })
    await controller.start()

    const listTool = registrations.find(
      ({ tool }) => tool.name === 'list_tool_contracts',
    )?.tool
    const invokeWithoutOptions = listTool?.execute as (
      input: unknown,
    ) => Promise<unknown>

    await expect(invokeWithoutOptions({})).resolves.toMatchObject({ ok: true })
    expect(adapter.listToolContracts).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    })
  })

  it('aborts all partial registrations when one registration fails', async () => {
    const registrationSignals: AbortSignal[] = []
    const target: WebMcpRegistrationTarget = {
      registerTool: vi.fn(async (tool, options) => {
        if (options?.signal) registrationSignals.push(options.signal)
        if (tool.name === 'audit_tool_contracts') {
          throw new Error('registration rejected')
        }
      }),
    }
    const controller = createSecondSurfaceWebMcpController({
      getAdapter: createAdapter,
      modelContext: target,
    })

    await expect(controller.start()).resolves.toMatchObject({
      phase: 'error',
      supported: true,
      registeredToolCount: 0,
      error: 'registration rejected',
    })
    expect(registrationSignals).toHaveLength(5)
    expect(registrationSignals.every((signal) => signal.aborted)).toBe(true)
  })
})
