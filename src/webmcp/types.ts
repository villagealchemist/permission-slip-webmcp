export const REQUIRED_INTAKE_FIELDS = [
  'contactName',
  'email',
  'eventType',
  'preferredDate',
  'estimatedAttendeeCount',
  'eventGoal',
] as const

export const OPTIONAL_INTAKE_FIELDS = [
  'phone',
  'budgetRange',
  'socialHandle',
  'additionalNotes',
] as const

export const NEVER_COLLECTED_FIELDS = [
  'street address',
  'employer',
  'precise live location',
  'payment information',
  'unrelated private conversation history',
] as const

export type RequiredIntakeField = (typeof REQUIRED_INTAKE_FIELDS)[number]
export type OptionalIntakeField = (typeof OPTIONAL_INTAKE_FIELDS)[number]
export type IntakeField = RequiredIntakeField | OptionalIntakeField

export type WorkflowStatus =
  | 'empty'
  | 'draft'
  | 'review_pending'
  | 'approved'
  | 'submitted'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  [key: string]: JsonValue
}

export interface DraftIntakeInput {
  contactName: string
  email: string
  eventType: string
  preferredDate: string
  estimatedAttendeeCount: number
  eventGoal: string
  phone?: string
  budgetRange?: string
  socialHandle?: string
  additionalNotes?: string
}

export interface SubmitApprovedIntakeInput {
  reviewId: string
}

export interface GetDisclosureReceiptInput {
  receiptId?: string
}

export interface ToolExecutionContext {
  signal: AbortSignal
}

export interface ToolFailure {
  ok: false
  error: {
    code: string
    message: string
    retryable: boolean
    details?: JsonObject
  }
}

export interface ToolSuccess<T> {
  ok: true
  data: T
}

export type ToolResult<T> = ToolSuccess<T> | ToolFailure

export interface IntakeRequirementsOutput {
  requiredFields: RequiredIntakeField[]
  optionalFields: OptionalIntakeField[]
  authorizedOptionalFields: OptionalIntakeField[]
  neverCollectedFields: string[]
  workflowStatus: WorkflowStatus
  instructions: string
}

export interface DraftIntakeOutput {
  acceptedFields: IntakeField[]
  withheldFields: OptionalIntakeField[]
  workflowStatus: WorkflowStatus
  nextRecommendedAction: string
}

export interface SubmissionReviewSummary {
  fieldsDisclosed: Partial<Record<IntakeField, string | number>>
  optionalFieldsWithheld: OptionalIntakeField[]
}

export interface PrepareSubmissionReviewOutput {
  reviewId: string
  digest: string
  reviewSummary: SubmissionReviewSummary
  humanApprovalRequired: string
}

export interface SubmitApprovedIntakeOutput {
  confirmation: string
  receiptId: string
  reviewId: string
  workflowStatus: 'submitted'
}

export interface DisclosureReceiptOutput {
  receiptId: string
  reviewId: string
  submissionTimestamp: string
  fieldsDisclosed: Partial<Record<IntakeField, string | number>>
  optionalFieldsWithheld: OptionalIntakeField[]
  neverCollectedCategories: string[]
  snapshotDigest: string
  destination: 'Local demonstration only'
  networkTransmissionOccurred: false
  statement: string
}

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

export type PermissionSlipWebMcpAdapterProvider =
  () => PermissionSlipWebMcpAdapter
