/** Required data the inquiry cannot advance to review without. */
export const REQUIRED_FIELD_NAMES = [
  'contactName',
  'email',
  'eventType',
  'preferredDate',
  'estimatedAttendeeCount',
  'eventGoal',
] as const

/** Data that remains withheld unless the visible human explicitly authorizes it. */
export const OPTIONAL_FIELD_NAMES = [
  'phone',
  'budgetRange',
  'socialHandle',
  'additionalNotes',
] as const

/** Stable field order shared by validation, canonicalization, and receipts. */
export const INTAKE_FIELD_NAMES = [
  ...REQUIRED_FIELD_NAMES,
  ...OPTIONAL_FIELD_NAMES,
] as const

/** Names accepted at the required-field boundary. */
export type RequiredFieldName = (typeof REQUIRED_FIELD_NAMES)[number]
/** Names governed by human-controlled disclosure authorization. */
export type OptionalFieldName = (typeof OPTIONAL_FIELD_NAMES)[number]
/** Every field the application intentionally accepts or stores. */
export type IntakeFieldName = (typeof INTAKE_FIELD_NAMES)[number]

/**
 * Consent workflow phases. `submitted` is terminal until the human resets the
 * demonstration; approval is valid only for the current review revision.
 */
export type WorkflowStatus =
  | 'empty'
  | 'draft'
  | 'review_pending'
  | 'approved'
  | 'submitted'

/** Parties recorded in the privacy-preserving activity trail. */
export type ActivityActor = 'agent' | 'human' | 'system'
/** Whether an attempted domain transition was accepted. */
export type ActivityOutcome = 'succeeded' | 'rejected'
/** Auditable workflow events; entries intentionally record field names, not values. */
export type ActivityAction =
  | 'draft_replaced'
  | 'draft_updated'
  | 'disclosure_changed'
  | 'review_prepared'
  | 'review_approved'
  | 'returned_to_editing'
  | 'intake_submitted'

/** Identifier namespaces keep otherwise opaque IDs recognizable in local records. */
export type IdKind = 'activity' | 'review' | 'receipt'

/**
 * Incrementally editable intake data. Required fields are optional here because
 * humans build drafts over time; completeness is enforced at review boundaries.
 */
export interface IntakeDraft {
  contactName?: string
  email?: string
  eventType?: string
  preferredDate?: string
  estimatedAttendeeCount?: number
  eventGoal?: string
  phone?: string
  budgetRange?: string
  socialHandle?: string
  additionalNotes?: string
}

/**
 * Complete, normalized intake values used to derive a disclosure. A frozen
 * review includes optional properties only after the authorization projection.
 */
export interface DisclosureSnapshot {
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

/** Human-controlled disclosure policy for every optional field. */
export type OptionalDisclosureAuthorizations = Record<OptionalFieldName, boolean>

/**
 * Exact disclosure offered for human review. The ID, digest, and revision form
 * the binding later required for approval and submission.
 */
export interface FrozenReview {
  reviewId: string
  digest: string
  revision: number
  createdAt: string
  snapshot: DisclosureSnapshot
  disclosedFields: IntakeFieldName[]
  authorizedOptionalFields: OptionalFieldName[]
  withheldOptionalFields: OptionalFieldName[]
}

/** Evidence that the visible UI approved one exact review binding. */
export interface HumanApproval {
  reviewId: string
  digest: string
  revision: number
  approvedAt: string
}

/**
 * Local audit record of the simulated submission. Its network assertions
 * describe application behavior; they are not proof of identity or integrity.
 */
export interface DisclosureReceipt {
  receiptId: string
  reviewId: string
  submissionTimestamp: string
  fieldsDisclosed: DisclosureSnapshot
  disclosedFieldNames: IntakeFieldName[]
  optionalFieldsWithheld: OptionalFieldName[]
  neverCollectedCategories: NeverCollectedName[]
  snapshotDigest: string
  destination: 'Local demonstration only'
  noNetworkTransmission: true
  statement: 'No network transmission occurred.'
}

/** Value-free workflow metadata suitable for the on-page activity history. */
export interface ActivityEntry {
  activityId: string
  timestamp: string
  actor: ActivityActor
  action: ActivityAction
  outcome: ActivityOutcome
  fieldNames: IntakeFieldName[]
}

/** Last editor and edit time for a stored field, without retaining prior values. */
export interface FieldProvenance {
  actor: 'agent' | 'human'
  updatedAt: string
}

/**
 * Single source of truth shared by the human UI and WebMCP adapter. Any
 * disclosure-affecting edit advances `revision` and clears review/approval.
 */
export interface PermissionSlipState {
  stateVersion: 1
  status: WorkflowStatus
  draft: IntakeDraft
  fieldProvenance: Partial<Record<IntakeFieldName, FieldProvenance>>
  revision: number
  optionalDisclosureAuthorizations: OptionalDisclosureAuthorizations
  review: FrozenReview | null
  approval: HumanApproval | null
  receipts: DisclosureReceipt[]
  activity: ActivityEntry[]
}

/** Categories explicitly outside the intake's collection boundary. */
export const NEVER_COLLECTED_NAMES = [
  'streetAddress',
  'employer',
  'preciseLiveLocation',
  'paymentInformation',
  'unrelatedPrivateConversationHistory',
] as const

/** Names used to make the non-collection policy machine-readable. */
export type NeverCollectedName = (typeof NEVER_COLLECTED_NAMES)[number]

/** Public metadata used to explain and validate an accepted intake field. */
export interface FieldDefinition<Name extends IntakeFieldName = IntakeFieldName> {
  name: Name
  label: string
  description: string
  type: 'string' | 'integer'
  required: boolean
}

/** Human-readable rationale for excluding a category from collection. */
export interface NeverCollectedDefinition {
  name: NeverCollectedName
  label: string
  reason: string
}

/** Current policy and workflow context returned before an agent drafts data. */
export interface IntakeRequirements {
  requiredFields: FieldDefinition<RequiredFieldName>[]
  optionalFields: Array<FieldDefinition<OptionalFieldName> & { authorized: boolean }>
  currentlyAuthorizedOptionalFields: OptionalFieldName[]
  neverCollectedFields: NeverCollectedDefinition[]
  workflowStatus: WorkflowStatus
  instructions: string
}

/** Stable failure codes shared by the UI, store, and tool adapter. */
export type DomainErrorCode =
  | 'APPROVAL_REQUIRED'
  | 'DIGEST_MISMATCH'
  | 'DIGEST_UNAVAILABLE'
  | 'HUMAN_ACTION_REQUIRED'
  | 'INCOMPLETE_DRAFT'
  | 'INVALID_INPUT'
  | 'INVALID_STATE'
  | 'RECEIPT_NOT_FOUND'
  | 'REVIEW_NOT_FOUND'
  | 'STALE_OPERATION'
  | 'STALE_REVIEW'
  | 'SUBMITTED_TERMINAL'
  | 'UNAUTHORIZED_OPTIONAL_FIELDS'
  | 'UNKNOWN_FIELDS'

/** A field-specific validation failure safe to return to an agent or human. */
export interface ValidationIssue {
  field: string
  code: 'format' | 'missing' | 'range' | 'type'
  message: string
}

/** Structured rejection with enough guidance for a constrained retry. */
export interface DomainError {
  code: DomainErrorCode
  message: string
  fields?: string[]
  issues?: ValidationIssue[]
  retry: string
}

/** Accepted transition and the authoritative state produced by it. */
export interface OperationSuccess<T> {
  ok: true
  data: T
  state: PermissionSlipState
}

/**
 * Rejected transition. Callers must still adopt `state` because rejection
 * activity may have been appended even when business data was unchanged.
 */
export interface OperationFailure {
  ok: false
  error: DomainError
  state: PermissionSlipState
}

/**
 * Domain operation envelope. Every branch carries the next authoritative state
 * so UI and tool callers cannot diverge in how transitions are committed.
 */
export type OperationResult<T> = OperationSuccess<T> | OperationFailure

/** Injectable nondeterminism keeps transition logic testable and browser-only. */
export interface DomainDependencies {
  now: () => string
  createId: (kind: IdKind) => string
  digest: (canonicalSnapshot: string) => Promise<string>
}

/** Agent draft acceptance metadata and the next consent-preserving action. */
export interface DraftIntakeResult {
  acceptedFields: IntakeFieldName[]
  withheldOptionalFields: OptionalFieldName[]
  workflowStatus: 'draft'
  revision: number
  nextAction: string
}

/** Result of an incremental human edit, including whether review state changed. */
export interface HumanDraftUpdateResult {
  changed: boolean
  changedFields: IntakeFieldName[]
  workflowStatus: 'empty' | 'draft'
  revision: number
}

/** Result of a human decision about one optional disclosure category. */
export interface DisclosureAuthorizationResult {
  changed: boolean
  field: OptionalFieldName
  authorized: boolean
  authorizedOptionalFields: OptionalFieldName[]
  workflowStatus: 'empty' | 'draft'
  revision: number
}

/** Frozen review binding returned without granting submission authority. */
export interface PreparedReviewResult {
  reviewId: string
  digest: string
  revision: number
  review: FrozenReview
  reviewSummary: {
    disclosedFields: IntakeFieldName[]
    authorizedOptionalFields: OptionalFieldName[]
    withheldOptionalFields: OptionalFieldName[]
  }
  workflowStatus: 'review_pending'
  humanActionRequired: string
}

/** Exact values the visible UI must echo to approve the current review. */
export interface ApprovalInput {
  reviewId: string
  digest: string
  revision: number
}

/** Human approval result; it authorizes only the bound review revision. */
export interface ApprovalResult {
  approval: HumanApproval
  workflowStatus: 'approved'
  nextAction: string
}

/** Editing transition result after invalidating any review and approval. */
export interface ReturnToEditingResult {
  workflowStatus: 'empty' | 'draft'
  revision: number
}

/** Result of the local-only submission simulation and its durable receipt. */
export interface SubmissionResult {
  receiptId: string
  receipt: DisclosureReceipt
  workflowStatus: 'submitted'
  confirmation: string
}

/** Result of the human-only reset to a new empty workflow. */
export interface ResetResult {
  workflowStatus: 'empty'
  cleared: true
}
