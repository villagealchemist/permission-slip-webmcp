import type {
  DomainError,
  FieldProvenance,
  IntakeFieldName,
  OperationResult,
  SubmissionReceipt,
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
  if (error.receiptId) details.receiptId = error.receiptId
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

function cloneFieldProvenance(
  provenance: Partial<Record<IntakeFieldName, FieldProvenance>>,
): Partial<Record<IntakeFieldName, FieldProvenance>> {
  return Object.fromEntries(
    Object.entries(provenance).map(([field, entry]) => [
      field,
      entry ? { ...entry } : entry,
    ]),
  )
}

/**
 * Clones the receipt union without ever projecting inquiry values onto a
 * rejected-attempt receipt.
 */
function mapReceipt(receipt: SubmissionReceipt): DisclosureReceiptOutput {
  const common = {
    receiptId: receipt.receiptId,
    submissionTimestamp: receipt.submissionTimestamp,
    destination: receipt.destination,
    requestedNextStep: receipt.requestedNextStep,
    permissionsGranted: [...receipt.permissionsGranted],
    permissionsWithheld: [...receipt.permissionsWithheld],
    inquiryProvenance: { ...receipt.inquiryProvenance },
    reviewId: receipt.reviewId,
    reviewRevision: receipt.reviewRevision,
    reviewDigest: receipt.reviewDigest,
    noNetworkTransmission: true as const,
    statement: receipt.statement,
  }

  if (receipt.outcome === 'rejected') {
    return {
      ...common,
      outcome: 'rejected',
      status: 'submission_rejected',
      submissionId: null,
      failure: { ...receipt.failure },
    }
  }

  return {
    ...common,
    outcome: 'accepted',
    status: 'qualified_inquiry_created',
    submissionId: receipt.submissionId,
    requestedNextStep: receipt.requestedNextStep,
    reviewId: receipt.reviewId,
    reviewRevision: receipt.reviewRevision,
    reviewDigest: receipt.reviewDigest,
    frozenSnapshot: { ...receipt.frozenSnapshot },
    fieldsDisclosed: { ...receipt.fieldsDisclosed },
    disclosedFieldNames: [...receipt.disclosedFieldNames],
    optionalFieldsWithheld: [...receipt.optionalFieldsWithheld],
    neverCollectedCategories: [...receipt.neverCollectedCategories],
    snapshotDigest: receipt.snapshotDigest,
    fieldProvenance: cloneFieldProvenance(receipt.fieldProvenance),
    contactPermissions: { ...receipt.contactPermissions },
  }
}

/**
 * Maps WebMCP's JSON contract onto the store's five-operation agent facade.
 * Human verification, intent, permissions, approval, editing return, and reset
 * remain reachable only through the visible UI facade.
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
        nextStepIntentConfirmed: requirements.nextStepIntentConfirmed,
        contactPermissions: { ...requirements.contactPermissions },
        unverifiedAssistantFields: [
          ...requirements.unverifiedAssistantFields,
        ],
        humanOnlyRequirements: {
          assistantSuggestionVerification: {
            required: true,
            complete: requirements.unverifiedAssistantFields.length === 0,
            unverifiedFields: [...requirements.unverifiedAssistantFields],
          },
          requestedNextStepIntent: {
            required: true,
            confirmed: requirements.nextStepIntentConfirmed,
          },
          projectResponsePermission: {
            required: true,
            granted: requirements.contactPermissions.projectResponse,
          },
          exactReviewApproval: {
            required: true,
            granted:
              requirements.workflowStatus === 'approved' ||
              requirements.workflowStatus === 'submitted',
          },
        },
        instructions: requirements.instructions,
      }
      return { ok: true, data }
    },

    draftIntake(input, { signal }) {
      abortIfNeeded(signal)
      return mapResult(store.agent.draftIntake(input), (value) => {
        const data: DraftIntakeOutput = {
          acceptedFields: [...value.acceptedFields],
          withheldFields: [...value.withheldOptionalFields],
          workflowStatus: value.workflowStatus,
          revision: value.revision,
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
          revision: value.revision,
          workflowStatus: value.workflowStatus,
          frozenSnapshot: { ...value.review.snapshot },
          disclosedFields: [...value.review.disclosedFields],
          authorizedOptionalFields: [
            ...value.review.authorizedOptionalFields,
          ],
          withheldOptionalFields: [...value.review.withheldOptionalFields],
          optionalDisclosureAuthorizations: {
            ...value.review.payload.optionalDisclosureAuthorizations,
          },
          contactPermissions: { ...value.review.contactPermissions },
          permissionsGranted: [...value.reviewSummary.permissionsGranted],
          permissionsWithheld: [...value.reviewSummary.permissionsWithheld],
          nextStepIntentConfirmed: true,
          inquiryProvenance: { ...value.review.inquiryProvenance },
          fieldProvenance: cloneFieldProvenance(
            value.review.fieldProvenance,
          ),
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
          submissionId: value.submissionId,
          receiptId: value.receiptId,
          reviewId: value.receipt.reviewId,
          workflowStatus: value.workflowStatus,
          idempotentReplay: value.idempotentReplay,
        }
        return data
      })
    },

    getDisclosureReceipt(input, { signal }) {
      abortIfNeeded(signal)
      return mapResult(
        store.agent.getDisclosureReceipt(input.receiptId),
        mapReceipt,
      )
    },
  }
}
