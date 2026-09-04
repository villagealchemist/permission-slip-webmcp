/** Required data the inquiry cannot advance to review without. */
export const REQUIRED_FIELD_NAMES = [
  'contactName',
  'email',
  'inquiryType',
  'desiredOutcome',
  'relevantBackground',
  'timeline',
  'preferredResponseMethod',
  'requestedNextStep',
] as const

/** Data that remains withheld unless the visible human explicitly authorizes it. */
export const OPTIONAL_FIELD_NAMES = [
  'phone',
  'budgetOrConstraints',
  'organization',
  'additionalContext',
] as const

/** Stable field order shared by validation, canonicalization, and receipts. */
export const INTAKE_FIELD_NAMES = [
  ...REQUIRED_FIELD_NAMES,
  ...OPTIONAL_FIELD_NAMES,
] as const

/** Human-controlled contact permissions, intentionally absent from agent tools. */
export const CONTACT_PERMISSION_NAMES = [
  'projectResponse',
  'occasionalUpdates',
] as const

export type RequiredFieldName = (typeof REQUIRED_FIELD_NAMES)[number]
export type OptionalFieldName = (typeof OPTIONAL_FIELD_NAMES)[number]
export type IntakeFieldName = (typeof INTAKE_FIELD_NAMES)[number]
export type ContactPermissionName = (typeof CONTACT_PERMISSION_NAMES)[number]

export const INQUIRY_TYPES = [
  'prototype',
  'website',
  'product_strategy',
  'creative_collaboration',
  'other',
] as const

export const PREFERRED_RESPONSE_METHODS = [
  'email',
  'phone',
  'video_call',
] as const

export const REQUESTED_NEXT_STEPS = [
  'discovery_call',
  'written_response',
  'project_review',
] as const

export type InquiryType = (typeof INQUIRY_TYPES)[number]
export type PreferredResponseMethod =
  (typeof PREFERRED_RESPONSE_METHODS)[number]
export type RequestedNextStep = (typeof REQUESTED_NEXT_STEPS)[number]

/** Workflow phases. A draft is not a qualified inquiry. */
export type WorkflowStatus =
  | 'empty'
  | 'draft'
  | 'review_pending'
  | 'approved'
  | 'submitted'

export type ActivityActor = 'agent' | 'human' | 'system'
export type ActivityOutcome = 'succeeded' | 'rejected'
export type ActivityAction =
  | 'draft_replaced'
  | 'draft_updated'
  | 'disclosure_changed'
  | 'assistant_suggestions_verified'
  | 'next_step_intent_changed'
  | 'contact_permission_changed'
  | 'review_prepared'
  | 'review_approved'
  | 'returned_to_editing'
  | 'intake_submitted'

export type IdKind = 'activity' | 'review' | 'receipt' | 'submission'

/** Incrementally editable project inquiry. Completeness is enforced at review. */
export interface InquiryDraft {
  contactName?: string
  email?: string
  inquiryType?: InquiryType
  desiredOutcome?: string
  relevantBackground?: string
  timeline?: string
  preferredResponseMethod?: PreferredResponseMethod
  requestedNextStep?: RequestedNextStep
  phone?: string
  budgetOrConstraints?: string
  organization?: string
  additionalContext?: string
}

/** Complete normalized inquiry values before optional disclosure projection. */
export interface InquirySnapshot {
  contactName: string
  email: string
  inquiryType: InquiryType
  desiredOutcome: string
  relevantBackground: string
  timeline: string
  preferredResponseMethod: PreferredResponseMethod
  requestedNextStep: RequestedNextStep
  phone?: string
  budgetOrConstraints?: string
  organization?: string
  additionalContext?: string
}

/** Compatibility names retained while the surrounding layers migrate. */
export type IntakeDraft = InquiryDraft
export type DisclosureSnapshot = InquirySnapshot

export type OptionalDisclosureAuthorizations = Record<OptionalFieldName, boolean>
export type ContactPermissions = Record<ContactPermissionName, boolean>

/** Automatically captured, narrow provenance for this one inquiry flow. */
export interface InquiryProvenance {
  entrySource: 'direct' | 'webmcp'
  referralSource: string | null
  campaign: string | null
}

export type FieldValueSource = 'person_provided' | 'assistant_suggested'

/** Current source and human-verification state for one populated field. */
export interface FieldProvenance {
  source: FieldValueSource
  verifiedByHuman: boolean
  updatedAt: string
  verifiedAt?: string
}

/** Exact payload whose canonical representation is bound to review approval. */
export interface InquiryReviewPayload {
  snapshot: InquirySnapshot
  optionalDisclosureAuthorizations: OptionalDisclosureAuthorizations
  contactPermissions: ContactPermissions
  nextStepIntentConfirmed: true
  inquiryProvenance: InquiryProvenance
  fieldProvenance: Partial<Record<IntakeFieldName, FieldProvenance>>
}

/** Exact inquiry payload offered for visible human review. */
export interface FrozenReview {
  reviewId: string
  digest: string
  revision: number
  createdAt: string
  payload: InquiryReviewPayload
  /** Convenience projection retained for existing review renderers. */
  snapshot: InquirySnapshot
  disclosedFields: IntakeFieldName[]
  authorizedOptionalFields: OptionalFieldName[]
  withheldOptionalFields: OptionalFieldName[]
  contactPermissions: ContactPermissions
  nextStepIntentConfirmed: true
  inquiryProvenance: InquiryProvenance
  fieldProvenance: Partial<Record<IntakeFieldName, FieldProvenance>>
}

export interface HumanApproval {
  reviewId: string
  digest: string
  revision: number
  approvedAt: string
}

export const NEVER_COLLECTED_NAMES = [
  'streetAddress',
  'employmentHistory',
  'preciseLiveLocation',
  'paymentInformation',
  'unrelatedPrivateConversationHistory',
] as const

export type NeverCollectedName = (typeof NEVER_COLLECTED_NAMES)[number]

export const SIMULATED_INQUIRY_DESTINATION =
  'Village Alchemist project inquiry desk (simulated)' as const

interface SubmissionReceiptBase {
  receiptId: string
  submissionTimestamp: string
  destination: typeof SIMULATED_INQUIRY_DESTINATION
  requestedNextStep: RequestedNextStep | null
  permissionsGranted: ContactPermissionName[]
  permissionsWithheld: ContactPermissionName[]
  inquiryProvenance: InquiryProvenance
  reviewId: string | null
  reviewRevision: number | null
  reviewDigest: string | null
  noNetworkTransmission: true
  statement: 'No network transmission occurred.'
}

/** Durable local receipt for the one successfully qualified simulated inquiry. */
export interface SuccessfulSubmissionReceipt extends SubmissionReceiptBase {
  outcome: 'accepted'
  status: 'qualified_inquiry_created'
  submissionId: string
  reviewId: string
  reviewRevision: number
  reviewDigest: string
  requestedNextStep: RequestedNextStep
  frozenSnapshot: InquirySnapshot
  /** Compatibility projections for existing receipt consumers. */
  fieldsDisclosed: InquirySnapshot
  disclosedFieldNames: IntakeFieldName[]
  optionalFieldsWithheld: OptionalFieldName[]
  neverCollectedCategories: NeverCollectedName[]
  snapshotDigest: string
  fieldProvenance: Partial<Record<IntakeFieldName, FieldProvenance>>
  contactPermissions: ContactPermissions
}

/** PII-free durable local explanation of a rejected submit attempt. */
export interface FailedSubmissionReceipt extends SubmissionReceiptBase {
  outcome: 'rejected'
  status: 'submission_rejected'
  submissionId: null
  failure: {
    code: DomainErrorCode
    message: string
    retry: string
  }
}

export type SubmissionReceipt =
  | SuccessfulSubmissionReceipt
  | FailedSubmissionReceipt

/** Compatibility name retained while receipt consumers migrate. */
export type DisclosureReceipt = SubmissionReceipt

export interface ActivityEntry {
  activityId: string
  timestamp: string
  actor: ActivityActor
  action: ActivityAction
  outcome: ActivityOutcome
  fieldNames: IntakeFieldName[]
}

/** Single immutable source of truth shared by UI and WebMCP adapters. */
export interface PermissionSlipState {
  stateVersion: 2
  status: WorkflowStatus
  draft: InquiryDraft
  fieldProvenance: Partial<Record<IntakeFieldName, FieldProvenance>>
  revision: number
  optionalDisclosureAuthorizations: OptionalDisclosureAuthorizations
  nextStepIntentConfirmed: boolean
  contactPermissions: ContactPermissions
  inquiryProvenance: InquiryProvenance
  review: FrozenReview | null
  approval: HumanApproval | null
  receipts: SubmissionReceipt[]
  activity: ActivityEntry[]
}

export interface FieldDefinition<Name extends IntakeFieldName = IntakeFieldName> {
  name: Name
  label: string
  description: string
  type: 'string'
  required: boolean
}

export interface NeverCollectedDefinition {
  name: NeverCollectedName
  label: string
  reason: string
}

export interface ContactPermissionDefinition {
  name: ContactPermissionName
  label: string
  description: string
  requiredForSubmission: boolean
}

export interface IntakeRequirements {
  requiredFields: FieldDefinition<RequiredFieldName>[]
  optionalFields: Array<FieldDefinition<OptionalFieldName> & { authorized: boolean }>
  currentlyAuthorizedOptionalFields: OptionalFieldName[]
  neverCollectedFields: NeverCollectedDefinition[]
  workflowStatus: WorkflowStatus
  nextStepIntentConfirmed: boolean
  contactPermissions: ContactPermissions
  unverifiedAssistantFields: IntakeFieldName[]
  instructions: string
}

export type DomainErrorCode =
  | 'APPROVAL_REQUIRED'
  | 'CONTACT_PERMISSION_REQUIRED'
  | 'DIGEST_MISMATCH'
  | 'DIGEST_UNAVAILABLE'
  | 'HUMAN_ACTION_REQUIRED'
  | 'HUMAN_VERIFICATION_REQUIRED'
  | 'INCOMPLETE_DRAFT'
  | 'INTENT_CONFIRMATION_REQUIRED'
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'RECEIPT_NOT_FOUND'
  | 'REVIEW_NOT_FOUND'
  | 'STALE_OPERATION'
  | 'STALE_REVIEW'
  | 'SUBMITTED_TERMINAL'
  | 'UNAUTHORIZED_OPTIONAL_FIELDS'
  | 'UNKNOWN_FIELDS'

export interface ValidationIssue {
  field: string
  code: 'format' | 'missing' | 'range' | 'type'
  message: string
}

export interface DomainError {
  code: DomainErrorCode
  message: string
  fields?: string[]
  issues?: ValidationIssue[]
  retry: string
  receiptId?: string
}

export interface OperationSuccess<T> {
  ok: true
  data: T
  state: PermissionSlipState
}

export interface OperationFailure {
  ok: false
  error: DomainError
  state: PermissionSlipState
  failureReceipt?: FailedSubmissionReceipt
}

export type OperationResult<T> = OperationSuccess<T> | OperationFailure

export interface DomainDependencies {
  now: () => string
  createId: (kind: IdKind) => string
  digest: (canonicalPayload: string) => Promise<string>
}

export interface DraftIntakeResult {
  acceptedFields: IntakeFieldName[]
  withheldOptionalFields: OptionalFieldName[]
  workflowStatus: 'draft'
  revision: number
  nextAction: string
}

export interface HumanDraftUpdateResult {
  changed: boolean
  changedFields: IntakeFieldName[]
  workflowStatus: 'empty' | 'draft'
  revision: number
}

export interface DisclosureAuthorizationResult {
  changed: boolean
  field: OptionalFieldName
  authorized: boolean
  authorizedOptionalFields: OptionalFieldName[]
  workflowStatus: 'empty' | 'draft'
  revision: number
}

export interface AssistantVerificationResult {
  changed: boolean
  verifiedFields: IntakeFieldName[]
  workflowStatus: 'empty' | 'draft'
  revision: number
}

export interface NextStepIntentResult {
  changed: boolean
  confirmed: boolean
  requestedNextStep?: RequestedNextStep
  workflowStatus: 'empty' | 'draft'
  revision: number
}

export interface ContactPermissionResult {
  changed: boolean
  permission: ContactPermissionName
  granted: boolean
  contactPermissions: ContactPermissions
  workflowStatus: 'empty' | 'draft'
  revision: number
}

export interface PreparedReviewResult {
  reviewId: string
  digest: string
  revision: number
  review: FrozenReview
  reviewSummary: {
    disclosedFields: IntakeFieldName[]
    authorizedOptionalFields: OptionalFieldName[]
    withheldOptionalFields: OptionalFieldName[]
    permissionsGranted: ContactPermissionName[]
    permissionsWithheld: ContactPermissionName[]
  }
  workflowStatus: 'review_pending'
  humanActionRequired: string
}

export interface ApprovalInput {
  reviewId: string
  digest: string
  revision: number
}

export interface ApprovalResult {
  approval: HumanApproval
  workflowStatus: 'approved'
  nextAction: string
}

export interface ReturnToEditingResult {
  workflowStatus: 'empty' | 'draft'
  revision: number
}

export interface SubmissionResult {
  receiptId: string
  submissionId: string
  receipt: SuccessfulSubmissionReceipt
  workflowStatus: 'submitted'
  confirmation: string
  idempotentReplay: boolean
}

export interface ResetResult {
  workflowStatus: 'empty'
  cleared: true
}
