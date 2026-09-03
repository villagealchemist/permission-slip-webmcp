import {
  WEBMCP_TOOL_CONTRACT_BY_NAME,
  PERMISSION_SLIP_TOOL_NAMES,
  type PermissionSlipToolName,
  type ToolContract,
} from '../contracts'
import type {
  PermissionSlipWebMcpAdapter,
  PermissionSlipWebMcpAdapterProvider,
  ToolFailure,
  ToolResult,
} from './types'
import {
  invalidInputFailure,
  validateDraftIntake,
  validateEmptyObject,
  validateGetDisclosureReceipt,
  validateSubmitApprovedIntake,
  type ValidationResult,
} from './validation'

export { PERMISSION_SLIP_TOOL_NAMES, type PermissionSlipToolName }

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
        'The operation could not be completed. The application state was not intentionally changed; inspect the visible workflow and retry if appropriate.',
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
        'The application produced a result that could not be represented as JSON.',
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
  getAdapter: PermissionSlipWebMcpAdapterProvider,
  validate: Validator<TInput>,
  invoke: (
    adapter: PermissionSlipWebMcpAdapter,
    input: TInput,
    signal: AbortSignal,
  ) => Promise<ToolResult<TOutput>> | ToolResult<TOutput>,
): WebMCP.ToolExecuteCallback {
  return async (input, executionOptions) => {
    // Some current WebMCP-enabled builds omit the draft API's second callback
    // argument. Preserve cancellation when supplied and remain compatible with
    // those builds while the browser surface is still experimental.
    const signal =
      executionOptions?.signal ?? new AbortController().signal
    throwIfAborted(signal)

    const validation = validate(input)
    if (!validation.ok) return invalidInputFailure(validation.issues)

    try {
      // Resolve the adapter for every invocation so registered callbacks always
      // operate on the current store rather than a registration-time snapshot.
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
  contract: ToolContract<PermissionSlipToolName>,
  getAdapter: PermissionSlipWebMcpAdapterProvider,
  validate: Validator<TInput>,
  invoke: (
    adapter: PermissionSlipWebMcpAdapter,
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

/**
 * Projects the canonical registry into native browser registrations and binds
 * each definition to the existing validated live-store executor. Output schemas
 * remain documentation metadata because the current registration type accepts
 * only an input schema.
 */
export function createPermissionSlipTools(
  getAdapter: PermissionSlipWebMcpAdapterProvider,
): readonly WebMCP.ModelContextTool[] {
  const getIntakeRequirements = registerContract(
    WEBMCP_TOOL_CONTRACT_BY_NAME.get_intake_requirements,
    getAdapter,
    validateEmptyObject,
    (adapter, _input, signal) => adapter.getIntakeRequirements({ signal }),
  )

  const draftIntake = registerContract(
    WEBMCP_TOOL_CONTRACT_BY_NAME.draft_intake,
    getAdapter,
    validateDraftIntake,
    (adapter, input, signal) => adapter.draftIntake(input, { signal }),
  )

  const prepareSubmissionReview = registerContract(
    WEBMCP_TOOL_CONTRACT_BY_NAME.prepare_submission_review,
    getAdapter,
    validateEmptyObject,
    (adapter, _input, signal) => adapter.prepareSubmissionReview({ signal }),
  )

  const submitApprovedIntake = registerContract(
    WEBMCP_TOOL_CONTRACT_BY_NAME.submit_approved_intake,
    getAdapter,
    validateSubmitApprovedIntake,
    (adapter, input, signal) =>
      adapter.submitApprovedIntake(input, { signal }),
  )

  const getDisclosureReceipt = registerContract(
    WEBMCP_TOOL_CONTRACT_BY_NAME.get_disclosure_receipt,
    getAdapter,
    validateGetDisclosureReceipt,
    (adapter, input, signal) =>
      adapter.getDisclosureReceipt(input, { signal }),
  )

  return [
    getIntakeRequirements,
    draftIntake,
    prepareSubmissionReview,
    submitApprovedIntake,
    getDisclosureReceipt,
  ]
}
