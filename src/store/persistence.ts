import {
  ACTIVITY_LIMIT,
  CONTACT_PERMISSION_NAMES,
  EMPTY_CONTACT_PERMISSIONS,
  EMPTY_OPTIONAL_AUTHORIZATIONS,
  INTAKE_FIELD_NAMES,
  NEVER_COLLECTED_NAMES,
  OPTIONAL_FIELD_NAMES,
  REQUESTED_NEXT_STEPS,
  SIMULATED_INQUIRY_DESTINATION,
  buildDisclosureSnapshot,
  canonicalSerialize,
  canonicalSerializeReviewPayload,
  validateCompleteDraft,
  type ActivityAction,
  type ActivityActor,
  type ActivityEntry,
  type ActivityOutcome,
  type ContactPermissionName,
  type ContactPermissions,
  type DomainErrorCode,
  type FailedSubmissionReceipt,
  type FrozenReview,
  type HumanApproval,
  type InquiryDraft,
  type InquiryProvenance,
  type InquiryReviewPayload,
  type InquirySnapshot,
  type IntakeFieldName,
  type NeverCollectedName,
  type OptionalDisclosureAuthorizations,
  type OptionalFieldName,
  type PermissionSlipState,
  type SubmissionReceipt,
  type SuccessfulSubmissionReceipt,
  type WorkflowStatus,
} from '../domain'

/** Version 2 deliberately invalidates the earlier demo representation. */
export const PERSISTED_STATE_VERSION = 2
/** Namespaced browser key for the one local inquiry workflow. */
export const DEFAULT_STORAGE_KEY = 'permission-slip:state'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface PersistedEnvelope {
  version: 2
  state: PermissionSlipState
}

export type PermissionSlipStorageReadResult =
  | { status: 'valid'; state: PermissionSlipState }
  | { status: 'missing' | 'invalid' | 'unavailable'; state: null }

const WORKFLOW_STATUSES = new Set<WorkflowStatus>([
  'empty',
  'draft',
  'review_pending',
  'approved',
  'submitted',
])
const ACTIVITY_ACTORS = new Set<ActivityActor>(['agent', 'human', 'system'])
const ACTIVITY_OUTCOMES = new Set<ActivityOutcome>(['succeeded', 'rejected'])
const ACTIVITY_ACTIONS = new Set<ActivityAction>([
  'draft_replaced',
  'draft_updated',
  'disclosure_changed',
  'assistant_suggestions_verified',
  'next_step_intent_changed',
  'contact_permission_changed',
  'review_prepared',
  'review_approved',
  'returned_to_editing',
  'intake_submitted',
])
const DOMAIN_ERROR_CODES = new Set<DomainErrorCode>([
  'APPROVAL_REQUIRED',
  'CONTACT_PERMISSION_REQUIRED',
  'DIGEST_MISMATCH',
  'DIGEST_UNAVAILABLE',
  'HUMAN_ACTION_REQUIRED',
  'HUMAN_VERIFICATION_REQUIRED',
  'INCOMPLETE_DRAFT',
  'INTENT_CONFIRMATION_REQUIRED',
  'INVALID_INPUT',
  'INVALID_STATE',
  'RECEIPT_NOT_FOUND',
  'REVIEW_NOT_FOUND',
  'STALE_OPERATION',
  'STALE_REVIEW',
  'SUBMITTED_TERMINAL',
  'UNAUTHORIZED_OPTIONAL_FIELDS',
  'UNKNOWN_FIELDS',
])
const FIELD_NAMES = new Set<string>(INTAKE_FIELD_NAMES)
const OPTIONAL_FIELDS = new Set<string>(OPTIONAL_FIELD_NAMES)
const CONTACT_PERMISSIONS = new Set<string>(CONTACT_PERMISSION_NAMES)
const NEVER_COLLECTED = new Set<string>(NEVER_COLLECTED_NAMES)
const NEXT_STEP_VALUES = new Set<string>(REQUESTED_NEXT_STEPS)
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const SAFE_PROVENANCE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const RECEIPT_LIMIT = 100

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  )
}

function isSafeString(value: unknown, maximum = 4_000): value is string {
  return typeof value === 'string' && value.length <= maximum
}

function isNonEmptySafeString(
  value: unknown,
  maximum = 4_000,
): value is string {
  return isSafeString(value, maximum) && value.length > 0
}

function isSafeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    SAFE_ID_PATTERN.test(value)
  )
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 100 &&
    Number.isFinite(Date.parse(value))
  )
}

function sameStringArray<T extends string>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function sameRecord(left: object, right: object): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function parseFieldNames(value: unknown): IntakeFieldName[] | null {
  if (
    !Array.isArray(value) ||
    value.some((field) => !FIELD_NAMES.has(String(field)))
  ) {
    return null
  }
  const fields = value as IntakeFieldName[]
  return new Set(fields).size === fields.length ? [...fields] : null
}

function parseOptionalFields(value: unknown): OptionalFieldName[] | null {
  if (
    !Array.isArray(value) ||
    value.some((field) => !OPTIONAL_FIELDS.has(String(field)))
  ) {
    return null
  }
  const fields = value as OptionalFieldName[]
  return new Set(fields).size === fields.length ? [...fields] : null
}

function parseContactPermissionNames(
  value: unknown,
): ContactPermissionName[] | null {
  if (
    !Array.isArray(value) ||
    value.some((permission) => !CONTACT_PERMISSIONS.has(String(permission)))
  ) {
    return null
  }
  const permissions = value as ContactPermissionName[]
  const expectedOrder = CONTACT_PERMISSION_NAMES.filter((permission) =>
    permissions.includes(permission),
  )
  return new Set(permissions).size === permissions.length &&
    sameStringArray(permissions, expectedOrder)
    ? [...permissions]
    : null
}

function parseNeverCollected(value: unknown): NeverCollectedName[] | null {
  if (
    !Array.isArray(value) ||
    value.some((field) => !NEVER_COLLECTED.has(String(field)))
  ) {
    return null
  }
  const fields = value as NeverCollectedName[]
  return sameStringArray(fields, NEVER_COLLECTED_NAMES) ? [...fields] : null
}

function parseDraft(value: unknown): InquiryDraft | null {
  if (!isRecord(value) || !hasOnlyKeys(value, INTAKE_FIELD_NAMES)) return null

  const draft: InquiryDraft = {}
  for (const field of INTAKE_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue
    const fieldValue = value[field]
    if (!isSafeString(fieldValue)) return null
    draft[field] = fieldValue as never
  }
  return draft
}

function parseSnapshot(value: unknown): InquirySnapshot | null {
  const draft = parseDraft(value)
  if (!draft) return null
  const validation = validateCompleteDraft(draft)
  if (!validation.valid || !validation.normalizedDraft) return null
  return canonicalSerialize(draft as InquirySnapshot) ===
    canonicalSerialize(validation.normalizedDraft)
    ? validation.normalizedDraft
    : null
}

function parseAuthorizations(
  value: unknown,
): OptionalDisclosureAuthorizations | null {
  if (!isRecord(value) || !hasExactKeys(value, OPTIONAL_FIELD_NAMES)) {
    return null
  }

  const authorizations = { ...EMPTY_OPTIONAL_AUTHORIZATIONS }
  for (const field of OPTIONAL_FIELD_NAMES) {
    if (typeof value[field] !== 'boolean') return null
    authorizations[field] = value[field]
  }
  return authorizations
}

function parseContactPermissions(value: unknown): ContactPermissions | null {
  if (!isRecord(value) || !hasExactKeys(value, CONTACT_PERMISSION_NAMES)) {
    return null
  }

  const permissions = { ...EMPTY_CONTACT_PERMISSIONS }
  for (const permission of CONTACT_PERMISSION_NAMES) {
    if (typeof value[permission] !== 'boolean') return null
    permissions[permission] = value[permission]
  }
  return permissions
}

function parseProvenanceToken(value: unknown): string | null | undefined {
  if (value === null) return null
  if (
    typeof value === 'string' &&
    SAFE_PROVENANCE_TOKEN_PATTERN.test(value)
  ) {
    return value
  }
  return undefined
}

function parseInquiryProvenance(value: unknown): InquiryProvenance | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['entrySource', 'referralSource', 'campaign']) ||
    (value.entrySource !== 'direct' && value.entrySource !== 'webmcp')
  ) {
    return null
  }

  const referralSource = parseProvenanceToken(value.referralSource)
  const campaign = parseProvenanceToken(value.campaign)
  if (referralSource === undefined || campaign === undefined) return null

  return {
    entrySource: value.entrySource,
    referralSource,
    campaign,
  }
}

function parseFieldProvenance(
  value: unknown,
  expectedValues: InquiryDraft,
): PermissionSlipState['fieldProvenance'] | null {
  if (!isRecord(value) || !hasOnlyKeys(value, INTAKE_FIELD_NAMES)) return null
  const provenance: PermissionSlipState['fieldProvenance'] = {}

  for (const field of INTAKE_FIELD_NAMES) {
    const entry = value[field]
    if (expectedValues[field] === undefined) {
      if (entry !== undefined) return null
      continue
    }
    if (
      !isRecord(entry) ||
      !hasOnlyKeys(entry, [
        'source',
        'verifiedByHuman',
        'updatedAt',
        'verifiedAt',
      ]) ||
      !Object.prototype.hasOwnProperty.call(entry, 'source') ||
      !Object.prototype.hasOwnProperty.call(entry, 'verifiedByHuman') ||
      !Object.prototype.hasOwnProperty.call(entry, 'updatedAt') ||
      (entry.source !== 'person_provided' &&
        entry.source !== 'assistant_suggested') ||
      typeof entry.verifiedByHuman !== 'boolean' ||
      !isTimestamp(entry.updatedAt)
    ) {
      return null
    }

    const hasVerifiedAt = Object.prototype.hasOwnProperty.call(
      entry,
      'verifiedAt',
    )
    if (
      (entry.verifiedByHuman &&
        (!hasVerifiedAt || !isTimestamp(entry.verifiedAt))) ||
      (!entry.verifiedByHuman && hasVerifiedAt) ||
      (entry.source === 'person_provided' && !entry.verifiedByHuman)
    ) {
      return null
    }

    provenance[field] = {
      source: entry.source,
      verifiedByHuman: entry.verifiedByHuman,
      updatedAt: entry.updatedAt,
      ...(entry.verifiedByHuman
        ? { verifiedAt: entry.verifiedAt as string }
        : {}),
    }
  }
  return provenance
}

function allPopulatedFieldsVerified(
  draft: InquiryDraft,
  provenance: PermissionSlipState['fieldProvenance'],
): boolean {
  return INTAKE_FIELD_NAMES.every(
    (field) =>
      draft[field] === undefined ||
      provenance[field]?.verifiedByHuman === true,
  )
}

function parseReviewPayload(value: unknown): InquiryReviewPayload | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'snapshot',
      'optionalDisclosureAuthorizations',
      'contactPermissions',
      'nextStepIntentConfirmed',
      'inquiryProvenance',
      'fieldProvenance',
    ]) ||
    value.nextStepIntentConfirmed !== true
  ) {
    return null
  }

  const snapshot = parseSnapshot(value.snapshot)
  const optionalDisclosureAuthorizations = parseAuthorizations(
    value.optionalDisclosureAuthorizations,
  )
  const contactPermissions = parseContactPermissions(value.contactPermissions)
  const inquiryProvenance = parseInquiryProvenance(value.inquiryProvenance)
  const fieldProvenance = snapshot
    ? parseFieldProvenance(value.fieldProvenance, snapshot)
    : null
  if (
    !snapshot ||
    !optionalDisclosureAuthorizations ||
    !contactPermissions ||
    !inquiryProvenance ||
    !fieldProvenance ||
    !allPopulatedFieldsVerified(snapshot, fieldProvenance) ||
    !contactPermissions.projectResponse
  ) {
    return null
  }

  const projected = buildDisclosureSnapshot(
    snapshot,
    optionalDisclosureAuthorizations,
  )
  if (canonicalSerialize(projected.snapshot) !== canonicalSerialize(snapshot)) {
    return null
  }
  if (snapshot.preferredResponseMethod === 'phone' && !snapshot.phone) {
    return null
  }

  return {
    snapshot,
    optionalDisclosureAuthorizations,
    contactPermissions,
    nextStepIntentConfirmed: true,
    inquiryProvenance,
    fieldProvenance,
  }
}

function parseReview(value: unknown): FrozenReview | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'reviewId',
      'digest',
      'revision',
      'createdAt',
      'payload',
      'snapshot',
      'disclosedFields',
      'authorizedOptionalFields',
      'withheldOptionalFields',
      'contactPermissions',
      'nextStepIntentConfirmed',
      'inquiryProvenance',
      'fieldProvenance',
    ]) ||
    !isSafeId(value.reviewId) ||
    !isNonEmptySafeString(value.digest, 256) ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !isTimestamp(value.createdAt) ||
    value.nextStepIntentConfirmed !== true
  ) {
    return null
  }

  const payload = parseReviewPayload(value.payload)
  const snapshot = parseSnapshot(value.snapshot)
  const disclosedFields = parseFieldNames(value.disclosedFields)
  const authorizedOptionalFields = parseOptionalFields(
    value.authorizedOptionalFields,
  )
  const withheldOptionalFields = parseOptionalFields(
    value.withheldOptionalFields,
  )
  const contactPermissions = parseContactPermissions(value.contactPermissions)
  const inquiryProvenance = parseInquiryProvenance(value.inquiryProvenance)
  const fieldProvenance = snapshot
    ? parseFieldProvenance(value.fieldProvenance, snapshot)
    : null
  if (
    !payload ||
    !snapshot ||
    !disclosedFields ||
    !authorizedOptionalFields ||
    !withheldOptionalFields ||
    !contactPermissions ||
    !inquiryProvenance ||
    !fieldProvenance
  ) {
    return null
  }

  const expectedDisclosed = INTAKE_FIELD_NAMES.filter(
    (field) => snapshot[field] !== undefined,
  )
  const expectedAuthorized = OPTIONAL_FIELD_NAMES.filter(
    (field) => payload.optionalDisclosureAuthorizations[field],
  )
  const expectedWithheld = OPTIONAL_FIELD_NAMES.filter(
    (field) => snapshot[field] === undefined,
  )
  if (
    canonicalSerialize(payload.snapshot) !== canonicalSerialize(snapshot) ||
    !sameStringArray(disclosedFields, expectedDisclosed) ||
    !sameStringArray(authorizedOptionalFields, expectedAuthorized) ||
    !sameStringArray(withheldOptionalFields, expectedWithheld) ||
    !sameRecord(contactPermissions, payload.contactPermissions) ||
    !sameRecord(inquiryProvenance, payload.inquiryProvenance) ||
    !sameRecord(fieldProvenance, payload.fieldProvenance)
  ) {
    return null
  }

  return {
    reviewId: value.reviewId,
    digest: value.digest,
    revision: value.revision as number,
    createdAt: value.createdAt,
    payload,
    snapshot,
    disclosedFields,
    authorizedOptionalFields,
    withheldOptionalFields,
    contactPermissions,
    nextStepIntentConfirmed: true,
    inquiryProvenance,
    fieldProvenance,
  }
}

function parseApproval(value: unknown): HumanApproval | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['reviewId', 'digest', 'revision', 'approvedAt']) ||
    !isSafeId(value.reviewId) ||
    !isNonEmptySafeString(value.digest, 256) ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !isTimestamp(value.approvedAt)
  ) {
    return null
  }
  return {
    reviewId: value.reviewId,
    digest: value.digest,
    revision: value.revision as number,
    approvedAt: value.approvedAt,
  }
}

interface ParsedReceiptBase {
  receiptId: string
  submissionTimestamp: string
  requestedNextStep: SuccessfulSubmissionReceipt['requestedNextStep'] | null
  permissionsGranted: ContactPermissionName[]
  permissionsWithheld: ContactPermissionName[]
  inquiryProvenance: InquiryProvenance
  reviewId: string | null
  reviewRevision: number | null
  reviewDigest: string | null
}

function parseReceiptBase(
  value: Record<string, unknown>,
): ParsedReceiptBase | null {
  if (
    !isSafeId(value.receiptId) ||
    !isTimestamp(value.submissionTimestamp) ||
    value.destination !== SIMULATED_INQUIRY_DESTINATION ||
    value.noNetworkTransmission !== true ||
    value.statement !== 'No network transmission occurred.' ||
    (value.requestedNextStep !== null &&
      !NEXT_STEP_VALUES.has(String(value.requestedNextStep))) ||
    (value.reviewId !== null && !isSafeId(value.reviewId)) ||
    (value.reviewRevision !== null &&
      (!Number.isInteger(value.reviewRevision) ||
        (value.reviewRevision as number) < 0)) ||
    (value.reviewDigest !== null &&
      !isNonEmptySafeString(value.reviewDigest, 256))
  ) {
    return null
  }

  const permissionsGranted = parseContactPermissionNames(
    value.permissionsGranted,
  )
  const permissionsWithheld = parseContactPermissionNames(
    value.permissionsWithheld,
  )
  const inquiryProvenance = parseInquiryProvenance(value.inquiryProvenance)
  if (!permissionsGranted || !permissionsWithheld || !inquiryProvenance) {
    return null
  }
  if (
    CONTACT_PERMISSION_NAMES.some(
      (permission) =>
        permissionsGranted.includes(permission) ===
        permissionsWithheld.includes(permission),
    )
  ) {
    return null
  }

  return {
    receiptId: value.receiptId,
    submissionTimestamp: value.submissionTimestamp,
    requestedNextStep:
      value.requestedNextStep as ParsedReceiptBase['requestedNextStep'],
    permissionsGranted,
    permissionsWithheld,
    inquiryProvenance,
    reviewId: value.reviewId as string | null,
    reviewRevision: value.reviewRevision as number | null,
    reviewDigest: value.reviewDigest as string | null,
  }
}

const RECEIPT_BASE_KEYS = [
  'receiptId',
  'submissionTimestamp',
  'destination',
  'requestedNextStep',
  'permissionsGranted',
  'permissionsWithheld',
  'inquiryProvenance',
  'reviewId',
  'reviewRevision',
  'reviewDigest',
  'noNetworkTransmission',
  'statement',
] as const

function parseSuccessfulReceipt(
  value: Record<string, unknown>,
): SuccessfulSubmissionReceipt | null {
  if (
    !hasExactKeys(value, [
      ...RECEIPT_BASE_KEYS,
      'outcome',
      'status',
      'submissionId',
      'frozenSnapshot',
      'fieldsDisclosed',
      'disclosedFieldNames',
      'optionalFieldsWithheld',
      'neverCollectedCategories',
      'snapshotDigest',
      'fieldProvenance',
      'contactPermissions',
    ]) ||
    value.outcome !== 'accepted' ||
    value.status !== 'qualified_inquiry_created' ||
    !isSafeId(value.submissionId) ||
    !isNonEmptySafeString(value.snapshotDigest, 256)
  ) {
    return null
  }

  const base = parseReceiptBase(value)
  const frozenSnapshot = parseSnapshot(value.frozenSnapshot)
  const fieldsDisclosed = parseSnapshot(value.fieldsDisclosed)
  const disclosedFieldNames = parseFieldNames(value.disclosedFieldNames)
  const optionalFieldsWithheld = parseOptionalFields(
    value.optionalFieldsWithheld,
  )
  const neverCollectedCategories = parseNeverCollected(
    value.neverCollectedCategories,
  )
  const fieldProvenance = frozenSnapshot
    ? parseFieldProvenance(value.fieldProvenance, frozenSnapshot)
    : null
  const contactPermissions = parseContactPermissions(value.contactPermissions)
  if (
    !base ||
    base.requestedNextStep === null ||
    base.reviewId === null ||
    base.reviewRevision === null ||
    base.reviewDigest === null ||
    !frozenSnapshot ||
    !fieldsDisclosed ||
    !disclosedFieldNames ||
    !optionalFieldsWithheld ||
    !neverCollectedCategories ||
    !fieldProvenance ||
    !contactPermissions ||
    !allPopulatedFieldsVerified(frozenSnapshot, fieldProvenance)
  ) {
    return null
  }

  const expectedDisclosed = INTAKE_FIELD_NAMES.filter(
    (field) => frozenSnapshot[field] !== undefined,
  )
  const expectedWithheld = OPTIONAL_FIELD_NAMES.filter(
    (field) => frozenSnapshot[field] === undefined,
  )
  const expectedGranted = CONTACT_PERMISSION_NAMES.filter(
    (permission) => contactPermissions[permission],
  )
  const expectedPermissionWithheld = CONTACT_PERMISSION_NAMES.filter(
    (permission) => !contactPermissions[permission],
  )
  if (
    !contactPermissions.projectResponse ||
    canonicalSerialize(frozenSnapshot) !== canonicalSerialize(fieldsDisclosed) ||
    frozenSnapshot.requestedNextStep !== base.requestedNextStep ||
    !sameStringArray(disclosedFieldNames, expectedDisclosed) ||
    !sameStringArray(optionalFieldsWithheld, expectedWithheld) ||
    !sameStringArray(base.permissionsGranted, expectedGranted) ||
    !sameStringArray(base.permissionsWithheld, expectedPermissionWithheld) ||
    value.snapshotDigest !== base.reviewDigest
  ) {
    return null
  }

  return {
    receiptId: base.receiptId,
    submissionId: value.submissionId,
    submissionTimestamp: base.submissionTimestamp,
    outcome: 'accepted',
    status: 'qualified_inquiry_created',
    destination: SIMULATED_INQUIRY_DESTINATION,
    requestedNextStep: base.requestedNextStep,
    permissionsGranted: base.permissionsGranted,
    permissionsWithheld: base.permissionsWithheld,
    inquiryProvenance: base.inquiryProvenance,
    reviewId: base.reviewId,
    reviewRevision: base.reviewRevision,
    reviewDigest: base.reviewDigest,
    frozenSnapshot,
    fieldsDisclosed,
    disclosedFieldNames,
    optionalFieldsWithheld,
    neverCollectedCategories,
    snapshotDigest: value.snapshotDigest,
    fieldProvenance,
    contactPermissions,
    noNetworkTransmission: true,
    statement: 'No network transmission occurred.',
  }
}

function parseFailedReceipt(
  value: Record<string, unknown>,
): FailedSubmissionReceipt | null {
  if (
    !hasExactKeys(value, [
      ...RECEIPT_BASE_KEYS,
      'outcome',
      'status',
      'submissionId',
      'failure',
    ]) ||
    value.outcome !== 'rejected' ||
    value.status !== 'submission_rejected' ||
    value.submissionId !== null ||
    !isRecord(value.failure) ||
    !hasExactKeys(value.failure, ['code', 'message', 'retry']) ||
    !DOMAIN_ERROR_CODES.has(value.failure.code as DomainErrorCode) ||
    !isNonEmptySafeString(value.failure.message, 2_000) ||
    !isNonEmptySafeString(value.failure.retry, 2_000)
  ) {
    return null
  }

  const base = parseReceiptBase(value)
  if (!base) return null

  return {
    receiptId: base.receiptId,
    submissionId: null,
    submissionTimestamp: base.submissionTimestamp,
    outcome: 'rejected',
    status: 'submission_rejected',
    destination: SIMULATED_INQUIRY_DESTINATION,
    requestedNextStep: base.requestedNextStep,
    permissionsGranted: base.permissionsGranted,
    permissionsWithheld: base.permissionsWithheld,
    inquiryProvenance: base.inquiryProvenance,
    reviewId: base.reviewId,
    reviewRevision: base.reviewRevision,
    reviewDigest: base.reviewDigest,
    failure: {
      code: value.failure.code as DomainErrorCode,
      message: value.failure.message,
      retry: value.failure.retry,
    },
    noNetworkTransmission: true,
    statement: 'No network transmission occurred.',
  }
}

function parseReceipt(value: unknown): SubmissionReceipt | null {
  if (!isRecord(value)) return null
  if (value.outcome === 'accepted') return parseSuccessfulReceipt(value)
  if (value.outcome === 'rejected') return parseFailedReceipt(value)
  return null
}

function parseActivity(value: unknown): ActivityEntry[] | null {
  if (!Array.isArray(value) || value.length > ACTIVITY_LIMIT) return null
  const entries: ActivityEntry[] = []

  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, [
        'activityId',
        'timestamp',
        'actor',
        'action',
        'outcome',
        'fieldNames',
      ]) ||
      !isSafeId(candidate.activityId) ||
      !isTimestamp(candidate.timestamp) ||
      !ACTIVITY_ACTORS.has(candidate.actor as ActivityActor) ||
      !ACTIVITY_ACTIONS.has(candidate.action as ActivityAction) ||
      !ACTIVITY_OUTCOMES.has(candidate.outcome as ActivityOutcome)
    ) {
      return null
    }
    const fieldNames = parseFieldNames(candidate.fieldNames)
    if (!fieldNames) return null
    entries.push({
      activityId: candidate.activityId,
      timestamp: candidate.timestamp,
      actor: candidate.actor as ActivityActor,
      action: candidate.action as ActivityAction,
      outcome: candidate.outcome as ActivityOutcome,
      fieldNames,
    })
  }

  return new Set(entries.map((entry) => entry.activityId)).size ===
    entries.length
    ? entries
    : null
}

function reviewMatchesCurrentDisclosure(
  state: Pick<
    PermissionSlipState,
    | 'draft'
    | 'fieldProvenance'
    | 'optionalDisclosureAuthorizations'
    | 'nextStepIntentConfirmed'
    | 'contactPermissions'
    | 'inquiryProvenance'
    | 'review'
    | 'revision'
  >,
): boolean {
  if (
    !state.review ||
    state.review.revision !== state.revision ||
    !state.nextStepIntentConfirmed ||
    !state.contactPermissions.projectResponse ||
    !allPopulatedFieldsVerified(state.draft, state.fieldProvenance)
  ) {
    return false
  }

  const validation = validateCompleteDraft(state.draft)
  if (!validation.valid || !validation.normalizedDraft) return false
  const expected = buildDisclosureSnapshot(
    validation.normalizedDraft,
    state.optionalDisclosureAuthorizations,
  )
  if (
    expected.snapshot.preferredResponseMethod === 'phone' &&
    !expected.snapshot.phone
  ) {
    return false
  }

  const expectedFieldProvenance: PermissionSlipState['fieldProvenance'] = {}
  for (const field of expected.disclosedFields) {
    const provenance = state.fieldProvenance[field]
    if (!provenance) return false
    expectedFieldProvenance[field] = { ...provenance }
  }
  const expectedPayload: InquiryReviewPayload = {
    snapshot: expected.snapshot,
    optionalDisclosureAuthorizations: {
      ...state.optionalDisclosureAuthorizations,
    },
    contactPermissions: { ...state.contactPermissions },
    nextStepIntentConfirmed: true,
    inquiryProvenance: { ...state.inquiryProvenance },
    fieldProvenance: expectedFieldProvenance,
  }

  return (
    canonicalSerializeReviewPayload(expectedPayload) ===
      canonicalSerializeReviewPayload(state.review.payload) &&
    sameStringArray(expected.disclosedFields, state.review.disclosedFields) &&
    sameStringArray(
      expected.authorizedOptionalFields,
      state.review.authorizedOptionalFields,
    ) &&
    sameStringArray(
      expected.withheldOptionalFields,
      state.review.withheldOptionalFields,
    )
  )
}

function successMatchesReview(
  receipt: SuccessfulSubmissionReceipt,
  review: FrozenReview,
): boolean {
  return (
    receipt.reviewId === review.reviewId &&
    receipt.reviewRevision === review.revision &&
    receipt.reviewDigest === review.digest &&
    receipt.snapshotDigest === review.digest &&
    canonicalSerialize(receipt.frozenSnapshot) ===
      canonicalSerialize(review.snapshot) &&
    sameRecord(receipt.fieldProvenance, review.fieldProvenance) &&
    sameRecord(receipt.contactPermissions, review.contactPermissions) &&
    sameRecord(receipt.inquiryProvenance, review.inquiryProvenance)
  )
}

/** Parses untrusted state only when shape and workflow relationships agree. */
export function parsePermissionSlipState(
  value: unknown,
): PermissionSlipState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'stateVersion',
      'status',
      'draft',
      'fieldProvenance',
      'revision',
      'optionalDisclosureAuthorizations',
      'nextStepIntentConfirmed',
      'contactPermissions',
      'inquiryProvenance',
      'review',
      'approval',
      'receipts',
      'activity',
    ]) ||
    value.stateVersion !== 2 ||
    !WORKFLOW_STATUSES.has(value.status as WorkflowStatus) ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    typeof value.nextStepIntentConfirmed !== 'boolean' ||
    !Array.isArray(value.receipts) ||
    value.receipts.length > RECEIPT_LIMIT
  ) {
    return null
  }

  const draft = parseDraft(value.draft)
  if (!draft) return null
  const fieldProvenance = parseFieldProvenance(value.fieldProvenance, draft)
  const optionalDisclosureAuthorizations = parseAuthorizations(
    value.optionalDisclosureAuthorizations,
  )
  const contactPermissions = parseContactPermissions(value.contactPermissions)
  const inquiryProvenance = parseInquiryProvenance(value.inquiryProvenance)
  const review = value.review === null ? null : parseReview(value.review)
  const approval = value.approval === null ? null : parseApproval(value.approval)
  const receipts = value.receipts.map(parseReceipt)
  const activity = parseActivity(value.activity)
  if (
    !fieldProvenance ||
    !optionalDisclosureAuthorizations ||
    !contactPermissions ||
    !inquiryProvenance ||
    (value.review !== null && !review) ||
    (value.approval !== null && !approval) ||
    receipts.some((receipt) => receipt === null) ||
    !activity
  ) {
    return null
  }

  const parsedReceipts = receipts as SubmissionReceipt[]
  if (
    new Set(parsedReceipts.map((receipt) => receipt.receiptId)).size !==
    parsedReceipts.length
  ) {
    return null
  }

  const state: PermissionSlipState = {
    stateVersion: 2,
    status: value.status as WorkflowStatus,
    draft,
    fieldProvenance,
    revision: value.revision as number,
    optionalDisclosureAuthorizations,
    nextStepIntentConfirmed: value.nextStepIntentConfirmed,
    contactPermissions,
    inquiryProvenance,
    review,
    approval,
    receipts: parsedReceipts,
    activity,
  }

  const hasDraft = INTAKE_FIELD_NAMES.some(
    (field) => draft[field] !== undefined,
  )
  const successfulReceipts = parsedReceipts.filter(
    (receipt): receipt is SuccessfulSubmissionReceipt =>
      receipt.outcome === 'accepted',
  )

  if (state.status === 'empty') {
    return !hasDraft &&
      !state.nextStepIntentConfirmed &&
      !review &&
      !approval &&
      successfulReceipts.length === 0
      ? state
      : null
  }
  if (state.status === 'draft') {
    return hasDraft &&
      !review &&
      !approval &&
      successfulReceipts.length === 0
      ? state
      : null
  }
  if (!review || !reviewMatchesCurrentDisclosure(state)) return null
  if (state.status === 'review_pending') {
    return !approval && successfulReceipts.length === 0 ? state : null
  }
  if (
    !approval ||
    approval.reviewId !== review.reviewId ||
    approval.digest !== review.digest ||
    approval.revision !== review.revision
  ) {
    return null
  }
  if (state.status === 'approved') {
    return successfulReceipts.length === 0 ? state : null
  }

  return successfulReceipts.length === 1 &&
    successMatchesReview(successfulReceipts[0], review)
    ? state
    : null
}

export function serializePermissionSlipState(
  state: PermissionSlipState,
): string {
  const envelope: PersistedEnvelope = {
    version: PERSISTED_STATE_VERSION,
    state,
  }
  return JSON.stringify(envelope)
}

export function loadPermissionSlipState(
  storage: StorageLike | null,
  key = DEFAULT_STORAGE_KEY,
): PermissionSlipState | null {
  const result = readPermissionSlipState(storage, key)
  return result.status === 'valid' ? result.state : null
}

export function readPermissionSlipState(
  storage: StorageLike | null,
  key = DEFAULT_STORAGE_KEY,
): PermissionSlipStorageReadResult {
  if (!storage) return { status: 'unavailable', state: null }

  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return { status: 'unavailable', state: null }
  }
  if (raw === null) return { status: 'missing', state: null }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      !hasExactKeys(parsed, ['version', 'state']) ||
      parsed.version !== PERSISTED_STATE_VERSION
    ) {
      return { status: 'invalid', state: null }
    }
    const state = parsePermissionSlipState(parsed.state)
    return state
      ? { status: 'valid', state }
      : { status: 'invalid', state: null }
  } catch {
    return { status: 'invalid', state: null }
  }
}

export function savePermissionSlipState(
  storage: StorageLike | null,
  state: PermissionSlipState,
  key = DEFAULT_STORAGE_KEY,
): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, serializePermissionSlipState(state))
    return true
  } catch {
    return false
  }
}

export function clearPermissionSlipState(
  storage: StorageLike | null,
  key = DEFAULT_STORAGE_KEY,
): boolean {
  if (!storage) return false
  try {
    storage.removeItem(key)
    return true
  } catch {
    return false
  }
}
