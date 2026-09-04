import {
  NEVER_COLLECTED_DEFINITIONS,
  OPTIONAL_FIELD_NAMES,
  REQUIRED_FIELD_NAMES,
  type ContactPermissionName,
  type ContactPermissions,
  type FailedSubmissionReceipt,
  type FieldProvenance,
  type InquiryProvenance,
  type InquirySnapshot,
  type IntakeFieldName,
  type OptionalDisclosureAuthorizations,
  type OptionalFieldName,
  type RequiredFieldName,
  type SuccessfulSubmissionReceipt,
  type WorkflowStatus as DomainWorkflowStatus,
} from '../domain'
import type { ContractErrorCode } from '../contracts/defineContract'

/** Stable required-field names in the external tool contract. */
export const REQUIRED_INTAKE_FIELDS = REQUIRED_FIELD_NAMES

/** Stable optional-field names that remain subject to live human authorization. */
export const OPTIONAL_INTAKE_FIELDS = OPTIONAL_FIELD_NAMES

/** Human-readable collection exclusions returned to tool callers. */
export const NEVER_COLLECTED_FIELDS = Object.freeze(
  NEVER_COLLECTED_DEFINITIONS.map((definition) => definition.label),
)

/** Required input names exposed through WebMCP. */
export type RequiredIntakeField = RequiredFieldName
/** Consent-gated input names exposed through WebMCP. */
export type OptionalIntakeField = OptionalFieldName
/** Every accepted WebMCP inquiry property. */
export type IntakeField = IntakeFieldName

/** Tool-facing alias of the authoritative domain workflow lifecycle. */
export type WorkflowStatus = DomainWorkflowStatus

/** JSON-only boundary prevents tool results from leaking browser-specific objects. */
export type JsonPrimitive = string | number | boolean | null
/** Recursive value accepted in structured tool error details. */
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
/** Structured JSON object accepted by the WebMCP result contract. */
export interface JsonObject {
  [key: string]: JsonValue
}

/** Complete proposed inquiry; runtime policy still gates every optional value. */
export type DraftIntakeInput = InquirySnapshot

/** Submission binds to the exact review previously returned to the caller. */
export interface SubmitApprovedIntakeInput {
  reviewId: string
}

/** Omitted receipt ID intentionally means “latest local receipt.” */
export interface GetDisclosureReceiptInput {
  receiptId?: string
}

/** Per-invocation cancellation propagated into asynchronous store operations. */
export interface ToolExecutionContext {
  signal: AbortSignal
}

/** Agent-readable rejection with constrained retry guidance. */
export interface ToolFailure {
  ok: false
  error: {
    code: ContractErrorCode
    message: string
    retryable: boolean
    details?: JsonObject
  }
}

/** Structured success envelope used consistently by all five tools. */
export interface ToolSuccess<T> {
  ok: true
  data: T
}

/** Discriminated result that keeps expected policy rejections out of exceptions. */
export type ToolResult<T> = ToolSuccess<T> | ToolFailure

/** Explicitly readable state for controls that no WebMCP tool may operate. */
export interface HumanOnlyRequirementsOutput {
  assistantSuggestionVerification: {
    required: true
    complete: boolean
    unverifiedFields: IntakeField[]
  }
  requestedNextStepIntent: {
    required: true
    confirmed: boolean
  }
  projectResponsePermission: {
    required: true
    granted: boolean
  }
  exactReviewApproval: {
    required: true
    granted: boolean
  }
}

/** Live collection policy and human-only prerequisite state. */
export interface IntakeRequirementsOutput {
  requiredFields: RequiredIntakeField[]
  optionalFields: OptionalIntakeField[]
  authorizedOptionalFields: OptionalIntakeField[]
  neverCollectedFields: string[]
  workflowStatus: WorkflowStatus
  nextStepIntentConfirmed: boolean
  contactPermissions: ContactPermissions
  unverifiedAssistantFields: IntakeField[]
  humanOnlyRequirements: HumanOnlyRequirementsOutput
  instructions: string
}

/** Agent draft result that explicitly identifies data withheld from disclosure. */
export interface DraftIntakeOutput {
  acceptedFields: IntakeField[]
  withheldFields: OptionalIntakeField[]
  workflowStatus: 'draft'
  revision: number
  nextRecommendedAction: string
}

/** Review binding and the exact frozen payload offered to the person. */
export interface PrepareSubmissionReviewOutput {
  reviewId: string
  digest: string
  revision: number
  workflowStatus: 'review_pending'
  frozenSnapshot: InquirySnapshot
  disclosedFields: IntakeField[]
  authorizedOptionalFields: OptionalIntakeField[]
  withheldOptionalFields: OptionalIntakeField[]
  optionalDisclosureAuthorizations: OptionalDisclosureAuthorizations
  contactPermissions: ContactPermissions
  permissionsGranted: ContactPermissionName[]
  permissionsWithheld: ContactPermissionName[]
  nextStepIntentConfirmed: true
  inquiryProvenance: InquiryProvenance
  fieldProvenance: Partial<Record<IntakeFieldName, FieldProvenance>>
  humanApprovalRequired: string
}

/** Confirmation of one local simulated submission, linked to its receipt. */
export interface SubmitApprovedIntakeOutput {
  confirmation: string
  submissionId: string
  receiptId: string
  reviewId: string
  workflowStatus: 'submitted'
  idempotentReplay: boolean
}

/** Accepted receipts may contain the exact frozen inquiry values. */
export type SuccessfulDisclosureReceiptOutput = SuccessfulSubmissionReceipt

/** Rejected-attempt receipts intentionally contain no inquiry snapshot or values. */
export type FailedDisclosureReceiptOutput = FailedSubmissionReceipt

/** Durable local receipt union returned without widening either outcome. */
export type DisclosureReceiptOutput =
  | SuccessfulDisclosureReceiptOutput
  | FailedDisclosureReceiptOutput

/** Allows adapters to keep read operations synchronous without constraining async work. */
export type MaybePromise<T> = T | Promise<T>

/**
 * Application-facing WebMCP boundary. Implementations call the same current
 * store as the visible UI and deliberately omit all human-only operations.
 */
export interface PermissionSlipWebMcpAdapter {
  getIntakeRequirements(
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<IntakeRequirementsOutput>>
  draftIntake(
    input: DraftIntakeInput,
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<DraftIntakeOutput>>
  prepareSubmissionReview(
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<PrepareSubmissionReviewOutput>>
  submitApprovedIntake(
    input: SubmitApprovedIntakeInput,
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<SubmitApprovedIntakeOutput>>
  getDisclosureReceipt(
    input: GetDisclosureReceiptInput,
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<DisclosureReceiptOutput>>
}

/** Resolves the adapter at invocation time so tools always reach the live store. */
export type PermissionSlipWebMcpAdapterProvider =
  () => PermissionSlipWebMcpAdapter
