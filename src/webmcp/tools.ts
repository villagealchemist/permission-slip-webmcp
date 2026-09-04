import {
  SECOND_SURFACE_TOOL_CONTRACT_BY_NAME,
  SECOND_SURFACE_TOOL_NAMES,
  type WorkbenchToolContract,
} from '../contracts'
import type {
  GetToolContractInput,
  JsonObject,
  ProposeContractRevisionInput,
  SecondSurfaceToolData,
  SecondSurfaceToolName,
  SecondSurfaceWebMcpAdapter,
  SecondSurfaceWebMcpAdapterProvider,
  ToolFailure,
  ToolResult,
} from './types'
import {
  invalidInputFailure,
  validateEmptyObject,
  validateGetToolContract,
  validateProposeContractRevision,
  type ValidationResult,
} from './validation'

export { SECOND_SURFACE_TOOL_NAMES, type SecondSurfaceToolName }

type Validator<T> = (input: unknown) => ValidationResult<T>

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  if (signal.reason !== undefined) throw signal.reason
  throw new DOMException('The tool execution was aborted.', 'AbortError')
}

function executionFailure(): ToolFailure {
  return {
    ok: false,
    error: {
      code: 'TOOL_EXECUTION_FAILED',
      message:
        'The operation could not be completed. The accepted contract catalog was not intentionally changed; inspect the visible workbench and retry if appropriate.',
      retryable: true,
    },
  }
}

function invalidResultFailure(): ToolFailure {
  return {
    ok: false,
    error: {
      code: 'INVALID_TOOL_RESULT',
      message:
        'The workbench produced a result that could not be represented as JSON.',
      retryable: false,
    },
  }
}

function isJsonSerializable(value: unknown): boolean {
  try {
    return JSON.stringify(value) !== undefined
  } catch {
    return false
  }
}

function executeValidated<TInput, TOutput>(
  getAdapter: SecondSurfaceWebMcpAdapterProvider,
  validate: Validator<TInput>,
  invoke: (
    adapter: SecondSurfaceWebMcpAdapter,
    input: TInput,
    signal: AbortSignal,
  ) => Promise<ToolResult<TOutput>> | ToolResult<TOutput>,
): WebMCP.ToolExecuteCallback {
  return async (input, executionOptions) => {
    // Some WebMCP-enabled builds omit the experimental callback's second
    // argument. Preserve cancellation when supplied and remain compatible with
    // those builds without adding a runtime polyfill.
    const signal = executionOptions?.signal ?? new AbortController().signal
    throwIfAborted(signal)

    const validation = validate(input)
    if (!validation.ok) return invalidInputFailure(validation.issues)

    try {
      // Resolve the adapter for every invocation so callbacks always operate on
      // the current accepted catalog and staged proposal state.
      const result = await invoke(getAdapter(), validation.value, signal)
      throwIfAborted(signal)
      return isJsonSerializable(result) ? result : invalidResultFailure()
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error
      return executionFailure()
    }
  }
}

function registerContract<TInput, TOutput>(
  contract: WorkbenchToolContract,
  getAdapter: SecondSurfaceWebMcpAdapterProvider,
  validate: Validator<TInput>,
  invoke: (
    adapter: SecondSurfaceWebMcpAdapter,
    input: TInput,
    signal: AbortSignal,
  ) => Promise<ToolResult<TOutput>> | ToolResult<TOutput>,
): WebMCP.ModelContextTool {
  return {
    name: contract.name,
    title: contract.title,
    description: contract.description,
    inputSchema: contract.inputSchema,
    ...(contract.annotations ? { annotations: contract.annotations } : {}),
    execute: executeValidated(getAdapter, validate, invoke),
  }
}

function acceptedContractsAtFactoryCreation(
  getAdapter: SecondSurfaceWebMcpAdapterProvider,
): readonly WorkbenchToolContract[] {
  const acceptedContracts = getAdapter().getAcceptedContracts()
  const expectedNames = SECOND_SURFACE_TOOL_NAMES.map(
    (name) => SECOND_SURFACE_TOOL_CONTRACT_BY_NAME[name].name,
  )
  const byName = new Map<string, WorkbenchToolContract>()

  for (const contract of acceptedContracts) {
    if (!expectedNames.includes(contract.name as SecondSurfaceToolName)) {
      throw new Error(`Unknown accepted Second Surface contract: ${contract.name}`)
    }
    if (byName.has(contract.name)) {
      throw new Error(`Duplicate accepted Second Surface contract: ${contract.name}`)
    }
    byName.set(contract.name, contract)
  }

  if (byName.size !== expectedNames.length) {
    throw new Error('The accepted Second Surface registry must contain exactly five tools.')
  }

  return expectedNames.map((name) => {
    const contract = byName.get(name)
    if (!contract) {
      throw new Error(`Missing accepted Second Surface contract: ${name}`)
    }
    return contract
  })
}

/**
 * Projects the accepted canonical registry into five native browser
 * registrations. Registration metadata is captured at factory creation; each
 * executor still resolves the live adapter at invocation time.
 */
export function createSecondSurfaceTools(
  getAdapter: SecondSurfaceWebMcpAdapterProvider,
): readonly WebMCP.ModelContextTool[] {
  const contracts = acceptedContractsAtFactoryCreation(getAdapter)

  return contracts.map((contract) => {
    switch (contract.name) {
      case 'list_tool_contracts':
        return registerContract<JsonObject, SecondSurfaceToolData>(
          contract,
          getAdapter,
          validateEmptyObject,
          (adapter, _input, signal) => adapter.listToolContracts({ signal }),
        )
      case 'get_tool_contract':
        return registerContract<GetToolContractInput, SecondSurfaceToolData>(
          contract,
          getAdapter,
          validateGetToolContract,
          (adapter, input, signal) =>
            adapter.getToolContract(input, { signal }),
        )
      case 'audit_tool_contracts':
        return registerContract<JsonObject, SecondSurfaceToolData>(
          contract,
          getAdapter,
          validateEmptyObject,
          (adapter, _input, signal) => adapter.auditToolContracts({ signal }),
        )
      case 'propose_contract_revision':
        return registerContract<
          ProposeContractRevisionInput,
          SecondSurfaceToolData
        >(
          contract,
          getAdapter,
          validateProposeContractRevision,
          (adapter, input, signal) =>
            adapter.proposeContractRevision(input, { signal }),
        )
      case 'preview_contract_bundle':
        return registerContract<JsonObject, SecondSurfaceToolData>(
          contract,
          getAdapter,
          validateEmptyObject,
          (adapter, _input, signal) => adapter.previewContractBundle({ signal }),
        )
      default:
        throw new Error(`No executor is bound for ${String(contract.name)}.`)
    }
  })
}
