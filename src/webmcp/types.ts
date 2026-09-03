import {
  NEVER_COLLECTED_DEFINITIONS,
  OPTIONAL_FIELD_NAMES,
  REQUIRED_FIELD_NAMES,
  type DisclosureSnapshot,
  type IntakeFieldName,
  type OptionalFieldName,
  type RequiredFieldName,
  type WorkflowStatus as DomainWorkflowStatus,
} from '../domain'
import type { ContractErrorCode } from '../contracts/defineContract'

/** Stable required-field names in the external tool contract. */
export const REQUIRED_INTAKE_FIELDS = REQUIRED_FIELD_NAMES

/** Stable optional-field names that remain subject to live human authorization. */
export const OPTIONAL_INTAKE_FIELDS = OPTIONAL_FIELD_NAMES

/** Human-readable collection exclusions returned to tool callers. */
export const NEVER_COLLECTED_FIELDS = Object.freeze(
  NEVER_COLLECTED_DEFINITIONS.map((definition) =>
    definition.label.toLowerCase(),
  ),
)

/** Required input names exposed through WebMCP. */
export type RequiredIntakeField = RequiredFieldName
/** Consent-gated input names exposed through WebMCP. */
export type OptionalIntakeField = OptionalFieldName
/** Every accepted WebMCP intake property. */
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

/** Complete draft proposal; runtime policy still decides which optionals are allowed. */
export type DraftIntakeInput = DisclosureSnapshot

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

/** Live collection policy returned before an agent constructs a draft. */
export interface IntakeRequirementsOutput {
  requiredFields: RequiredIntakeField[]
  optionalFields: OptionalIntakeField[]
  authorizedOptionalFields: OptionalIntakeField[]
  neverCollectedFields: string[]
  workflowStatus: WorkflowStatus
  instructions: string
}

/** Agent draft result that explicitly identifies data withheld from disclosure. */
export interface DraftIntakeOutput {
  acceptedFields: IntakeField[]
  withheldFields: OptionalIntakeField[]
  workflowStatus: 'draft'
  nextRecommendedAction: string
}

/** Exact values presented to the human and the optional categories omitted. */
export interface SubmissionReviewSummary {
  fieldsDisclosed: DisclosureSnapshot
  optionalFieldsWithheld: OptionalIntakeField[]
}

/** Review binding plus an explicit reminder that approval remains human-only. */
export interface PrepareSubmissionReviewOutput {
  reviewId: string
  digest: string
  reviewSummary: SubmissionReviewSummary
  humanApprovalRequired: string
}

/** Confirmation of local simulated submission, linked to its receipt. */
export interface SubmitApprovedIntakeOutput {
  confirmation: string
  receiptId: string
  reviewId: string
  workflowStatus: 'submitted'
}

/**
 * Portable record of the local simulation. `networkTransmissionOccurred` is a
 * behavior statement, not an identity or tamper-resistance guarantee.
 */
export interface DisclosureReceiptOutput {
  receiptId: string
  reviewId: string
  submissionTimestamp: string
  fieldsDisclosed: DisclosureSnapshot
  optionalFieldsWithheld: OptionalIntakeField[]
  neverCollectedCategories: string[]
  snapshotDigest: string
  destination: 'Local demonstration only'
  networkTransmissionOccurred: false
  statement: string
}

/** Allows adapters to keep read operations synchronous without constraining async work. */
export type MaybePromise<T> = T | Promise<T>

/**
 * The application-facing boundary for WebMCP. Implementations should call the
 * same live store/domain operations as the visible UI; they must not cache a
 * snapshot of state when the tools are registered.
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
