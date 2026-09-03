import {
  ACTIVITY_LIMIT,
  EMPTY_OPTIONAL_AUTHORIZATIONS,
  buildDisclosureSnapshot,
  canonicalSerialize,
  INTAKE_FIELD_NAMES,
  NEVER_COLLECTED_NAMES,
  OPTIONAL_FIELD_NAMES,
  validateCompleteDraft,
  type ActivityAction,
  type ActivityActor,
  type ActivityEntry,
  type ActivityOutcome,
  type DisclosureReceipt,
  type DisclosureSnapshot,
  type FrozenReview,
  type HumanApproval,
  type IntakeDraft,
  type IntakeFieldName,
  type NeverCollectedName,
  type OptionalDisclosureAuthorizations,
  type OptionalFieldName,
  type PermissionSlipState,
  type WorkflowStatus,
} from '../domain'

export const PERSISTED_STATE_VERSION = 1
export const DEFAULT_STORAGE_KEY = 'permission-slip:state'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface PersistedEnvelope {
  version: 1
  state: PermissionSlipState
}

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
  'review_prepared',
  'review_approved',
  'returned_to_editing',
  'intake_submitted',
])
const FIELD_NAMES = new Set<string>(INTAKE_FIELD_NAMES)
const OPTIONAL_FIELDS = new Set<string>(OPTIONAL_FIELD_NAMES)
const NEVER_COLLECTED = new Set<string>(NEVER_COLLECTED_NAMES)
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function isSafeString(value: unknown, maximum = 4_000): value is string {
  return typeof value === 'string' && value.length <= maximum
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

function sameStringArray<T extends string>(left: T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function parseFieldNames(value: unknown): IntakeFieldName[] | null {
  if (!Array.isArray(value) || value.some((field) => !FIELD_NAMES.has(String(field)))) {
    return null
  }
  const fields = value as IntakeFieldName[]
  return new Set(fields).size === fields.length ? [...fields] : null
}

function parseOptionalFields(value: unknown): OptionalFieldName[] | null {
  if (!Array.isArray(value) || value.some((field) => !OPTIONAL_FIELDS.has(String(field)))) {
    return null
  }
  const fields = value as OptionalFieldName[]
  return new Set(fields).size === fields.length ? [...fields] : null
}

function parseNeverCollected(value: unknown): NeverCollectedName[] | null {
  if (!Array.isArray(value) || value.some((field) => !NEVER_COLLECTED.has(String(field)))) {
    return null
  }
  const fields = value as NeverCollectedName[]
  return sameStringArray(fields, NEVER_COLLECTED_NAMES) ? [...fields] : null
}

function parseDraft(value: unknown): IntakeDraft | null {
  if (!isRecord(value) || !hasOnlyKeys(value, INTAKE_FIELD_NAMES)) return null

  const draft: IntakeDraft = {}
  for (const field of INTAKE_FIELD_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) continue
    const fieldValue = value[field]

    if (field === 'estimatedAttendeeCount') {
      if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) return null
      draft.estimatedAttendeeCount = fieldValue
    } else {
      if (!isSafeString(fieldValue)) return null
      draft[field] = fieldValue
    }
  }

  return draft
}

function parseSnapshot(value: unknown): DisclosureSnapshot | null {
  const draft = parseDraft(value)
  if (!draft) return null
  const validation = validateCompleteDraft(draft)
  if (!validation.valid || !validation.normalizedDraft) return null

  return canonicalSerialize(draft as DisclosureSnapshot) ===
    canonicalSerialize(validation.normalizedDraft)
    ? validation.normalizedDraft
    : null
}

function parseAuthorizations(value: unknown): OptionalDisclosureAuthorizations | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, OPTIONAL_FIELD_NAMES) ||
    Object.keys(value).length !== OPTIONAL_FIELD_NAMES.length
  ) {
    return null
  }

  const authorizations = { ...EMPTY_OPTIONAL_AUTHORIZATIONS }
  for (const field of OPTIONAL_FIELD_NAMES) {
    if (typeof value[field] !== 'boolean') return null
    authorizations[field] = value[field]
  }
  return authorizations
}

function parseProvenance(
  value: unknown,
  draft: IntakeDraft,
): PermissionSlipState['fieldProvenance'] | null {
  if (!isRecord(value) || !hasOnlyKeys(value, INTAKE_FIELD_NAMES)) return null
  const provenance: PermissionSlipState['fieldProvenance'] = {}

  for (const field of INTAKE_FIELD_NAMES) {
    const entry = value[field]
    if (draft[field] === undefined) {
      if (entry !== undefined) return null
      continue
    }
    if (
      !isRecord(entry) ||
      !hasOnlyKeys(entry, ['actor', 'updatedAt']) ||
      (entry.actor !== 'agent' && entry.actor !== 'human') ||
      !isTimestamp(entry.updatedAt)
    ) {
      return null
    }
    provenance[field] = { actor: entry.actor, updatedAt: entry.updatedAt }
  }

  return provenance
}

function parseReview(value: unknown): FrozenReview | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'reviewId',
      'digest',
      'revision',
      'createdAt',
      'snapshot',
      'disclosedFields',
      'authorizedOptionalFields',
      'withheldOptionalFields',
    ]) ||
    !isSafeId(value.reviewId) ||
    !isSafeString(value.digest, 256) ||
    value.digest.length === 0 ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !isTimestamp(value.createdAt)
  ) {
    return null
  }

  const snapshot = parseSnapshot(value.snapshot)
  const disclosedFields = parseFieldNames(value.disclosedFields)
  const authorizedOptionalFields = parseOptionalFields(value.authorizedOptionalFields)
  const withheldOptionalFields = parseOptionalFields(value.withheldOptionalFields)
  if (!snapshot || !disclosedFields || !authorizedOptionalFields || !withheldOptionalFields) {
    return null
  }

  const expectedDisclosed = INTAKE_FIELD_NAMES.filter(
    (field) => snapshot[field] !== undefined,
  )
  const expectedWithheld = OPTIONAL_FIELD_NAMES.filter(
    (field) => snapshot[field] === undefined,
  )
  if (
    !sameStringArray(disclosedFields, expectedDisclosed) ||
    !sameStringArray(withheldOptionalFields, expectedWithheld)
  ) {
    return null
  }

  return {
    reviewId: value.reviewId,
    digest: value.digest,
    revision: value.revision as number,
    createdAt: value.createdAt,
    snapshot,
    disclosedFields,
    authorizedOptionalFields,
    withheldOptionalFields,
  }
}

function parseApproval(value: unknown): HumanApproval | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['reviewId', 'digest', 'revision', 'approvedAt']) ||
    !isSafeId(value.reviewId) ||
    !isSafeString(value.digest, 256) ||
    value.digest.length === 0 ||
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

function parseReceipt(value: unknown): DisclosureReceipt | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'receiptId',
      'reviewId',
      'submissionTimestamp',
      'fieldsDisclosed',
      'disclosedFieldNames',
      'optionalFieldsWithheld',
      'neverCollectedCategories',
      'snapshotDigest',
      'destination',
      'noNetworkTransmission',
      'statement',
    ]) ||
    !isSafeId(value.receiptId) ||
    !isSafeId(value.reviewId) ||
    !isTimestamp(value.submissionTimestamp) ||
    !isSafeString(value.snapshotDigest, 256) ||
    value.snapshotDigest.length === 0 ||
    value.destination !== 'Local demonstration only' ||
    value.noNetworkTransmission !== true ||
    value.statement !== 'No network transmission occurred.'
  ) {
    return null
  }

  const fieldsDisclosed = parseSnapshot(value.fieldsDisclosed)
  const disclosedFieldNames = parseFieldNames(value.disclosedFieldNames)
  const optionalFieldsWithheld = parseOptionalFields(value.optionalFieldsWithheld)
  const neverCollectedCategories = parseNeverCollected(value.neverCollectedCategories)
  if (
    !fieldsDisclosed ||
    !disclosedFieldNames ||
    !optionalFieldsWithheld ||
    !neverCollectedCategories
  ) {
    return null
  }

  const expectedDisclosed = INTAKE_FIELD_NAMES.filter(
    (field) => fieldsDisclosed[field] !== undefined,
  )
  const expectedWithheld = OPTIONAL_FIELD_NAMES.filter(
    (field) => fieldsDisclosed[field] === undefined,
  )
  if (
    !sameStringArray(disclosedFieldNames, expectedDisclosed) ||
    !sameStringArray(optionalFieldsWithheld, expectedWithheld)
  ) {
    return null
  }

  return {
    receiptId: value.receiptId,
    reviewId: value.reviewId,
    submissionTimestamp: value.submissionTimestamp,
    fieldsDisclosed,
    disclosedFieldNames,
    optionalFieldsWithheld,
    neverCollectedCategories,
    snapshotDigest: value.snapshotDigest,
    destination: value.destination,
    noNetworkTransmission: true,
    statement: value.statement,
  }
}

function parseActivity(value: unknown): ActivityEntry[] | null {
  if (!Array.isArray(value) || value.length > ACTIVITY_LIMIT) return null
  const entries: ActivityEntry[] = []

  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [
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

  return entries
}

function reviewMatchesCurrentDisclosure(
  state: Pick<
    PermissionSlipState,
    'draft' | 'optionalDisclosureAuthorizations' | 'review' | 'revision'
  >,
): boolean {
  if (!state.review || state.review.revision !== state.revision) return false
  const validation = validateCompleteDraft(state.draft)
  if (!validation.valid || !validation.normalizedDraft) return false
  const expected = buildDisclosureSnapshot(
    validation.normalizedDraft,
    state.optionalDisclosureAuthorizations,
  )
  return (
    canonicalSerialize(expected.snapshot) === canonicalSerialize(state.review.snapshot) &&
    sameStringArray(expected.disclosedFields, state.review.disclosedFields) &&
    sameStringArray(
      expected.authorizedOptionalFields,
      state.review.authorizedOptionalFields,
    ) &&
    sameStringArray(expected.withheldOptionalFields, state.review.withheldOptionalFields)
  )
}

export function parsePermissionSlipState(value: unknown): PermissionSlipState | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'stateVersion',
      'status',
      'draft',
      'fieldProvenance',
      'revision',
      'optionalDisclosureAuthorizations',
      'review',
      'approval',
      'receipts',
      'activity',
    ]) ||
    value.stateVersion !== 1 ||
    !WORKFLOW_STATUSES.has(value.status as WorkflowStatus) ||
    !Number.isInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Array.isArray(value.receipts) ||
    value.receipts.length > 20
  ) {
    return null
  }

  const draft = parseDraft(value.draft)
  if (!draft) return null
  const fieldProvenance = parseProvenance(value.fieldProvenance, draft)
  const optionalDisclosureAuthorizations = parseAuthorizations(
    value.optionalDisclosureAuthorizations,
  )
  const review = value.review === null ? null : parseReview(value.review)
  const approval = value.approval === null ? null : parseApproval(value.approval)
  const receipts = value.receipts.map(parseReceipt)
  const activity = parseActivity(value.activity)
  if (
    !fieldProvenance ||
    !optionalDisclosureAuthorizations ||
    (value.review !== null && !review) ||
    (value.approval !== null && !approval) ||
    receipts.some((receipt) => receipt === null) ||
    !activity
  ) {
    return null
  }

  const state: PermissionSlipState = {
    stateVersion: 1,
    status: value.status as WorkflowStatus,
    draft,
    fieldProvenance,
    revision: value.revision as number,
    optionalDisclosureAuthorizations,
    review,
    approval,
    receipts: receipts as DisclosureReceipt[],
    activity,
  }

  const hasDraft = INTAKE_FIELD_NAMES.some((field) => draft[field] !== undefined)
  if (state.status === 'empty') {
    return !hasDraft && !review && !approval && state.receipts.length === 0 ? state : null
  }
  if (state.status === 'draft') {
    return hasDraft && !review && !approval && state.receipts.length === 0 ? state : null
  }
  if (!review || !reviewMatchesCurrentDisclosure(state)) return null
  if (state.status === 'review_pending') {
    return !approval && state.receipts.length === 0 ? state : null
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
    return state.receipts.length === 0 ? state : null
  }

  const latestReceipt = state.receipts.at(-1)
  return latestReceipt &&
    latestReceipt.reviewId === review.reviewId &&
    latestReceipt.snapshotDigest === review.digest &&
    canonicalSerialize(latestReceipt.fieldsDisclosed) ===
      canonicalSerialize(review.snapshot)
    ? state
    : null
}

export function serializePermissionSlipState(state: PermissionSlipState): string {
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
  if (!storage) return null

  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      !hasOnlyKeys(parsed, ['version', 'state']) ||
      parsed.version !== PERSISTED_STATE_VERSION
    ) {
      return null
    }
    return parsePermissionSlipState(parsed.state)
  } catch {
    return null
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
