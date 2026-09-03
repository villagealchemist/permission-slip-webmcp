import type {
  DomainError,
  OperationResult,
} from '../domain'
import type { PermissionSlipStore } from '../store'
import type {
  DisclosureReceiptOutput,
  DraftIntakeOutput,
  IntakeRequirementsOutput,
  JsonObject,
  PermissionSlipWebMcpAdapter,
  PrepareSubmissionReviewOutput,
  SubmitApprovedIntakeOutput,
  ToolFailure,
  ToolResult,
} from './types'

function abortIfNeeded(signal: AbortSignal): void {
  if (!signal.aborted) return
  throw signal.reason ?? new DOMException('Tool execution aborted.', 'AbortError')
}

function errorDetails(error: DomainError): JsonObject {
  const details: JsonObject = { retry: error.retry }
  if (error.fields) details.fields = [...error.fields]
  if (error.issues) {
    details.issues = error.issues.map((issue) => ({
      field: issue.field,
      code: issue.code,
      message: issue.message,
    }))
  }
  return details
}

function toolFailure(error: DomainError): ToolFailure {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.code !== 'SUBMITTED_TERMINAL',
      details: errorDetails(error),
    },
  }
}

function mapResult<TDomain, TTool>(
  result: OperationResult<TDomain>,
  map: (value: TDomain) => TTool,
): ToolResult<TTool> {
  return result.ok
    ? { ok: true, data: map(result.data) }
    : toolFailure(result.error)
}

/**
 * Maps WebMCP's JSON contract onto the store's agent facade. Because this
 * boundary cannot reach human-only methods, tool calls can prepare and submit
 * approved work but cannot authorize fields, approve reviews, or reset state.
 */
export function createStoreWebMcpAdapter(
  store: PermissionSlipStore,
): PermissionSlipWebMcpAdapter {
  return {
    getIntakeRequirements({ signal }) {
      abortIfNeeded(signal)
      const requirements = store.agent.getIntakeRequirements()
      const data: IntakeRequirementsOutput = {
        requiredFields: requirements.requiredFields.map((field) => field.name),
        optionalFields: requirements.optionalFields.map((field) => field.name),
        authorizedOptionalFields:
          requirements.currentlyAuthorizedOptionalFields,
        neverCollectedFields: requirements.neverCollectedFields.map(
          (field) => field.label,
        ),
        workflowStatus: requirements.workflowStatus,
        instructions: requirements.instructions,
      }
      return { ok: true, data }
    },

    draftIntake(input, { signal }) {
      abortIfNeeded(signal)
      return mapResult(store.agent.draftIntake(input), (value) => {
        const data: DraftIntakeOutput = {
          acceptedFields: value.acceptedFields,
          withheldFields: value.withheldOptionalFields,
          workflowStatus: value.workflowStatus,
          nextRecommendedAction: value.nextAction,
        }
        return data
      })
    },

    async prepareSubmissionReview({ signal }) {
      abortIfNeeded(signal)
      const result = await store.agent.prepareSubmissionReview(signal)
      abortIfNeeded(signal)
      return mapResult(result, (value) => {
        const data: PrepareSubmissionReviewOutput = {
          reviewId: value.reviewId,
          digest: value.digest,
          reviewSummary: {
            fieldsDisclosed: { ...value.review.snapshot },
            optionalFieldsWithheld: value.review.withheldOptionalFields,
          },
          humanApprovalRequired: value.humanActionRequired,
        }
        return data
      })
    },

    async submitApprovedIntake(input, { signal }) {
      abortIfNeeded(signal)
      const result = await store.agent.submitApprovedIntake(
        input.reviewId,
        signal,
      )
      abortIfNeeded(signal)
      return mapResult(result, (value) => {
        const data: SubmitApprovedIntakeOutput = {
          confirmation: value.confirmation,
          receiptId: value.receiptId,
          reviewId: value.receipt.reviewId,
          workflowStatus: value.workflowStatus,
        }
        return data
      })
    },

    getDisclosureReceipt(input, { signal }) {
      abortIfNeeded(signal)
      return mapResult(
        store.agent.getDisclosureReceipt(input.receiptId),
        (receipt) => {
          const data: DisclosureReceiptOutput = {
            receiptId: receipt.receiptId,
            reviewId: receipt.reviewId,
            submissionTimestamp: receipt.submissionTimestamp,
            fieldsDisclosed: { ...receipt.fieldsDisclosed },
            optionalFieldsWithheld: receipt.optionalFieldsWithheld,
            neverCollectedCategories: receipt.neverCollectedCategories,
            snapshotDigest: receipt.snapshotDigest,
            destination: receipt.destination,
            networkTransmissionOccurred: false,
            statement: receipt.statement,
          }
          return data
        },
      )
    },
  }
}
