import {
  draftIntakeSchema,
  emptyObjectSchema,
  getDisclosureReceiptSchema,
  submitApprovedIntakeSchema,
} from './schemas'
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

export const PERMISSION_SLIP_TOOL_NAMES = [
  'get_intake_requirements',
  'draft_intake',
  'prepare_submission_review',
  'submit_approved_intake',
  'get_disclosure_receipt',
] as const

export type PermissionSlipToolName =
  (typeof PERMISSION_SLIP_TOOL_NAMES)[number]

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

export function createPermissionSlipTools(
  getAdapter: PermissionSlipWebMcpAdapterProvider,
): readonly WebMCP.ModelContextTool[] {
  const getIntakeRequirements: WebMCP.ModelContextTool = {
    name: 'get_intake_requirements',
    title: 'Get intake requirements',
    description:
      'Read the required, optional, currently human-authorized, and never-collected intake fields plus workflow status. This does not change state. Submission always requires explicit human approval in the visible webpage.',
    inputSchema: emptyObjectSchema,
    annotations: { readOnlyHint: true },
    execute: executeValidated(
      getAdapter,
      validateEmptyObject,
      (adapter, _input, signal) =>
        adapter.getIntakeRequirements({ signal }),
    ),
  }

  const draftIntake: WebMCP.ModelContextTool = {
    name: 'draft_intake',
    title: 'Draft the intake',
    description:
      'Replace the visible intake with one complete proposed draft. The complete call is rejected if it is malformed, contains an unknown field, or includes an optional field the person has not authorized. A successful draft invalidates any older review or approval and never approves or submits.',
    inputSchema: draftIntakeSchema,
    execute: executeValidated(
      getAdapter,
      validateDraftIntake,
      (adapter, input, signal) => adapter.draftIntake(input, { signal }),
    ),
  }

  const prepareSubmissionReview: WebMCP.ModelContextTool = {
    name: 'prepare_submission_review',
    title: 'Prepare submission review',
    description:
      'Freeze the current valid draft into an exact disclosure review and digest shown in the webpage. This does not approve or submit it; the person must approve that exact review using the visible human-only control.',
    inputSchema: emptyObjectSchema,
    execute: executeValidated(
      getAdapter,
      validateEmptyObject,
      (adapter, _input, signal) =>
        adapter.prepareSubmissionReview({ signal }),
    ),
  }

  const submitApprovedIntake: WebMCP.ModelContextTool = {
    name: 'submit_approved_intake',
    title: 'Submit approved intake',
    description:
      'Consequential action: finalize only the exact unchanged review identified by reviewId after the person has explicitly approved it in the visible webpage. This hackathon demonstration creates a local disclosure receipt and transitions the workflow to submitted; it sends no network request. Calls without matching current human approval are rejected.',
    inputSchema: submitApprovedIntakeSchema,
    execute: executeValidated(
      getAdapter,
      validateSubmitApprovedIntake,
      (adapter, input, signal) =>
        adapter.submitApprovedIntake(input, { signal }),
    ),
  }

  const getDisclosureReceipt: WebMCP.ModelContextTool = {
    name: 'get_disclosure_receipt',
    title: 'Get disclosure receipt',
    description:
      'Read a local disclosure receipt by receiptId, or read the latest receipt when receiptId is omitted. Returns exactly what was disclosed and withheld and confirms that no network transmission occurred. This does not change state.',
    inputSchema: getDisclosureReceiptSchema,
    annotations: { readOnlyHint: true },
    execute: executeValidated(
      getAdapter,
      validateGetDisclosureReceipt,
      (adapter, input, signal) =>
        adapter.getDisclosureReceipt(input, { signal }),
    ),
  }

  return [
    getIntakeRequirements,
    draftIntake,
    prepareSubmissionReview,
    submitApprovedIntake,
    getDisclosureReceipt,
  ]
}
