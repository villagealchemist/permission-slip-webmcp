export const REQUIRED_FIELD_NAMES = [
  'contactName',
  'email',
  'eventType',
  'preferredDate',
  'estimatedAttendeeCount',
  'eventGoal',
] as const

export const OPTIONAL_FIELD_NAMES = [
  'phone',
  'budgetRange',
  'socialHandle',
  'additionalNotes',
] as const

export const INTAKE_FIELD_NAMES = [
  ...REQUIRED_FIELD_NAMES,
  ...OPTIONAL_FIELD_NAMES,
] as const

export type RequiredFieldName = (typeof REQUIRED_FIELD_NAMES)[number]
export type OptionalFieldName = (typeof OPTIONAL_FIELD_NAMES)[number]
export type IntakeFieldName = (typeof INTAKE_FIELD_NAMES)[number]

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
  | 'review_prepared'
  | 'review_approved'
  | 'returned_to_editing'
  | 'intake_submitted'

export type IdKind = 'activity' | 'review' | 'receipt'

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

export type OptionalDisclosureAuthorizations = Record<OptionalFieldName, boolean>

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

export interface HumanApproval {
  reviewId: string
  digest: string
  revision: number
  approvedAt: string
}

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

export interface ActivityEntry {
  activityId: string
  timestamp: string
  actor: ActivityActor
  action: ActivityAction
  outcome: ActivityOutcome
  fieldNames: IntakeFieldName[]
}

export interface FieldProvenance {
  actor: 'agent' | 'human'
  updatedAt: string
}

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

export const NEVER_COLLECTED_NAMES = [
  'streetAddress',
  'employer',
  'preciseLiveLocation',
  'paymentInformation',
  'unrelatedPrivateConversationHistory',
] as const

export type NeverCollectedName = (typeof NEVER_COLLECTED_NAMES)[number]

export interface FieldDefinition<Name extends IntakeFieldName = IntakeFieldName> {
  name: Name
  label: string
  description: string
  type: 'string' | 'integer'
  required: boolean
}

export interface NeverCollectedDefinition {
  name: NeverCollectedName
  label: string
  reason: string
}

export interface IntakeRequirements {
  requiredFields: FieldDefinition<RequiredFieldName>[]
  optionalFields: Array<FieldDefinition<OptionalFieldName> & { authorized: boolean }>
  currentlyAuthorizedOptionalFields: OptionalFieldName[]
  neverCollectedFields: NeverCollectedDefinition[]
  workflowStatus: WorkflowStatus
  instructions: string
}

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
}

export type OperationResult<T> = OperationSuccess<T> | OperationFailure

export interface DomainDependencies {
  now: () => string
  createId: (kind: IdKind) => string
  digest: (canonicalSnapshot: string) => Promise<string>
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
  receipt: DisclosureReceipt
  workflowStatus: 'submitted'
  confirmation: string
}

export interface ResetResult {
  workflowStatus: 'empty'
  cleared: true
}
