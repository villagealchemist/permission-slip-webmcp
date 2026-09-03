import {
  ACTIVITY_LIMIT,
  EMPTY_OPTIONAL_AUTHORIZATIONS,
  INTAKE_REQUIREMENTS_INSTRUCTIONS,
  NEVER_COLLECTED_DEFINITIONS,
  OPTIONAL_FIELD_DEFINITIONS,
  REQUIRED_FIELD_DEFINITIONS,
} from './constants'
import { buildDisclosureSnapshot, canonicalSerialize, sha256Digest } from './canonical'
import {
  INTAKE_FIELD_NAMES,
  NEVER_COLLECTED_NAMES,
  OPTIONAL_FIELD_NAMES,
  type ActivityAction,
  type ActivityActor,
  type ActivityEntry,
  type ApprovalInput,
  type ApprovalResult,
  type DisclosureAuthorizationResult,
  type DisclosureReceipt,
  type DomainDependencies,
  type DomainError,
  type DomainErrorCode,
  type DraftIntakeResult,
  type HumanDraftUpdateResult,
  type IntakeDraft,
  type IntakeFieldName,
  type IntakeRequirements,
  type OperationResult,
  type PermissionSlipState,
  type PreparedReviewResult,
  type ResetResult,
  type ReturnToEditingResult,
  type SubmissionResult,
} from './types'
import {
  isOptionalFieldName,
  validateAgentDraftInput,
  validateCompleteDraft,
  validateHumanDraftPatch,
} from './validation'

function defaultId(kind: 'activity' | 'review' | 'receipt'): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return `${kind}_${uuid}`

  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    globalThis.crypto.getRandomValues(bytes)
    const randomPart = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
    return `${kind}_${randomPart}`
  }

  return `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }
  for (const nestedValue of Object.values(value)) deepFreeze(nestedValue)
  return Object.freeze(value)
}

/**
 * Recursively freezes snapshots before they cross the store boundary. Stable,
 * immutable references let React and concurrent-operation guards detect change.
 */
export function freezePermissionSlipState(
  state: PermissionSlipState,
): PermissionSlipState {
  return deepFreeze(state)
}

/** Supplies browser defaults while permitting deterministic tests. */
export function createDomainDependencies(
  overrides: Partial<DomainDependencies> = {},
): DomainDependencies {
  return {
    now: () => new Date().toISOString(),
    createId: defaultId,
    digest: sha256Digest,
    ...overrides,
  }
}

/** Creates the privacy-preserving baseline with all optional fields withheld. */
export function createInitialState(): PermissionSlipState {
  return freezePermissionSlipState({
    stateVersion: 1,
    status: 'empty',
    draft: {},
    fieldProvenance: {},
    revision: 0,
    optionalDisclosureAuthorizations: { ...EMPTY_OPTIONAL_AUTHORIZATIONS },
    review: null,
    approval: null,
    receipts: [],
    activity: [],
  })
}

function appendActivity(
  state: PermissionSlipState,
  dependencies: DomainDependencies,
  actor: ActivityActor,
  action: ActivityAction,
  outcome: 'succeeded' | 'rejected',
  fieldNames: IntakeFieldName[] = [],
): PermissionSlipState {
  const entry: ActivityEntry = {
    activityId: dependencies.createId('activity'),
    timestamp: dependencies.now(),
    actor,
    action,
    outcome,
    fieldNames: [...fieldNames],
  }

  return {
    ...state,
    activity: [...state.activity, entry].slice(-ACTIVITY_LIMIT),
  }
}

function succeeded<T>(state: PermissionSlipState, data: T): OperationResult<T> {
  return { ok: true, data, state: freezePermissionSlipState(state) }
}

function rejected<T>(
  state: PermissionSlipState,
  dependencies: DomainDependencies,
  actor: ActivityActor,
  action: ActivityAction,
  error: DomainError,
  safeFieldNames: IntakeFieldName[] = [],
): OperationResult<T> {
  return {
    ok: false,
    error,
    state: freezePermissionSlipState(
      appendActivity(
        state,
        dependencies,
        actor,
        action,
        'rejected',
        safeFieldNames,
      ),
    ),
  }
}

function error(
  code: DomainErrorCode,
  message: string,
  retry: string,
  options: Pick<DomainError, 'fields' | 'issues'> = {},
): DomainError {
  return { code, message, retry, ...options }
}

function editingStatus(draft: IntakeDraft): 'empty' | 'draft' {
  return INTAKE_FIELD_NAMES.some((field) => draft[field] !== undefined)
    ? 'draft'
    : 'empty'
}

function invalidatedEditingState(
  state: PermissionSlipState,
  draft: IntakeDraft,
): PermissionSlipState {
  return {
    ...state,
    status: editingStatus(draft),
    draft,
    revision: state.revision + 1,
    review: null,
    approval: null,
  }
}

function provenanceForAgentReplacement(
  state: PermissionSlipState,
  nextDraft: IntakeDraft,
  suppliedFields: IntakeFieldName[],
  dependencies: DomainDependencies,
): PermissionSlipState['fieldProvenance'] {
  const updatedAt = dependencies.now()
  const provenance: PermissionSlipState['fieldProvenance'] = {}

  for (const field of INTAKE_FIELD_NAMES) {
    if (nextDraft[field] === undefined) continue
    if (suppliedFields.includes(field)) {
      provenance[field] = { actor: 'agent', updatedAt }
    } else if (state.fieldProvenance[field]) {
      provenance[field] = state.fieldProvenance[field]
    }
  }

  return provenance
}

function sameDraft(left: IntakeDraft, right: IntakeDraft): boolean {
  return INTAKE_FIELD_NAMES.every((field) => Object.is(left[field], right[field]))
}

/**
 * Returns a defensive policy view for agents and UI consumers. Authorization is
 * read from the live state so callers cannot rely on registration-time data.
 */
export function getIntakeRequirements(
  state: PermissionSlipState,
): IntakeRequirements {
  return {
    requiredFields: REQUIRED_FIELD_DEFINITIONS.map((field) => ({ ...field })),
    optionalFields: OPTIONAL_FIELD_DEFINITIONS.map((field) => ({
      ...field,
      authorized: state.optionalDisclosureAuthorizations[field.name],
    })),
    currentlyAuthorizedOptionalFields: OPTIONAL_FIELD_NAMES.filter(
      (field) => state.optionalDisclosureAuthorizations[field],
    ),
    neverCollectedFields: NEVER_COLLECTED_DEFINITIONS.map((field) => ({ ...field })),
    workflowStatus: state.status,
    instructions: INTAKE_REQUIREMENTS_INSTRUCTIONS,
  }
}

/**
 * Atomically replaces the agent-controlled draft after validating the complete
 * proposal against current human authorizations. Existing unauthorized optional
 * values remain local and are neither accepted from the agent nor disclosed
 * while their authorization is off.
 */
export function replaceDraftFromAgent(
  state: PermissionSlipState,
  input: unknown,
  dependencies: DomainDependencies,
): OperationResult<DraftIntakeResult> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      'agent',
      'draft_replaced',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted demo is locked.',
        'Ask the human to reset the demo before preparing another intake.',
      ),
    )
  }

  const validation = validateAgentDraftInput(
    input,
    state.optionalDisclosureAuthorizations,
  )

  if (!validation.ok) {
    if (validation.kind === 'unknown') {
      return rejected(
        state,
        dependencies,
        'agent',
        'draft_replaced',
        error(
          'UNKNOWN_FIELDS',
          'The draft included unrecognized properties.',
          'Retry with only fields listed by get_intake_requirements.',
          { fields: validation.fields },
        ),
      )
    }

    if (validation.kind === 'unauthorized') {
      return rejected(
        state,
        dependencies,
        'agent',
        'draft_replaced',
        error(
          'UNAUTHORIZED_OPTIONAL_FIELDS',
          'The draft included optional fields the human has not authorized.',
          'Retry without the unauthorized optional fields. Only the human can change disclosure permissions.',
          { fields: validation.fields },
        ),
        validation.fields.filter(isOptionalFieldName),
      )
    }

    return rejected(
      state,
      dependencies,
      'agent',
      'draft_replaced',
      error(
        'INVALID_INPUT',
        'The proposed draft did not satisfy the intake validation rules.',
        'Correct the listed fields and retry the complete draft.',
        { fields: validation.fields, issues: validation.issues },
      ),
      validation.fields.filter((field): field is IntakeFieldName =>
        INTAKE_FIELD_NAMES.includes(field as IntakeFieldName),
      ),
    )
  }

  const nextDraft: IntakeDraft = { ...validation.draft }
  for (const field of OPTIONAL_FIELD_NAMES) {
    if (!state.optionalDisclosureAuthorizations[field] && state.draft[field] !== undefined) {
      nextDraft[field] = state.draft[field]
    }
  }

  let nextState = invalidatedEditingState(state, nextDraft)
  nextState = {
    ...nextState,
    fieldProvenance: provenanceForAgentReplacement(
      state,
      nextDraft,
      validation.suppliedFields,
      dependencies,
    ),
  }
  nextState = appendActivity(
    nextState,
    dependencies,
    'agent',
    'draft_replaced',
    'succeeded',
    validation.suppliedFields,
  )

  return succeeded(nextState, {
    acceptedFields: [...validation.suppliedFields],
    withheldOptionalFields: OPTIONAL_FIELD_NAMES.filter(
      (field) => !validation.suppliedFields.includes(field),
    ),
    workflowStatus: 'draft',
    revision: nextState.revision,
    nextAction: 'Prepare a submission review, then wait for the human to approve it in the webpage.',
  })
}

/**
 * Applies an incremental human edit. Any actual change advances the revision
 * and invalidates the prior review and approval before returning.
 */
export function updateDraftFromHuman(
  state: PermissionSlipState,
  input: unknown,
  dependencies: DomainDependencies,
): OperationResult<HumanDraftUpdateResult> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      'human',
      'draft_updated',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted demo is locked.',
        'Reset the demo before editing another intake.',
      ),
    )
  }

  const validation = validateHumanDraftPatch(input)
  if (!validation.ok) {
    const unknown = validation.kind === 'unknown'
    return rejected(
      state,
      dependencies,
      'human',
      'draft_updated',
      error(
        unknown ? 'UNKNOWN_FIELDS' : 'INVALID_INPUT',
        unknown
          ? 'The draft update included unrecognized properties.'
          : 'The draft update used unsupported value types.',
        unknown
          ? 'Retry with only recognized intake fields.'
          : 'Correct the listed fields and retry.',
        { fields: validation.fields, issues: validation.issues },
      ),
    )
  }

  const nextDraft: IntakeDraft = { ...state.draft }
  for (const field of validation.suppliedFields) {
    const value = validation.patch[field]
    if (value === undefined) {
      delete nextDraft[field]
    } else if (field === 'estimatedAttendeeCount') {
      nextDraft.estimatedAttendeeCount = value as number
    } else {
      nextDraft[field] = value as string
    }
  }

  if (sameDraft(state.draft, nextDraft)) {
    const status = editingStatus(state.draft)
    return succeeded(state, {
      changed: false,
      changedFields: [],
      workflowStatus: status,
      revision: state.revision,
    })
  }

  let nextState = invalidatedEditingState(state, nextDraft)
  const updatedAt = dependencies.now()
  const fieldProvenance = { ...state.fieldProvenance }
  for (const field of validation.suppliedFields) {
    if (nextDraft[field] === undefined) {
      delete fieldProvenance[field]
    } else {
      fieldProvenance[field] = { actor: 'human', updatedAt }
    }
  }
  nextState = { ...nextState, fieldProvenance }
  nextState = appendActivity(
    nextState,
    dependencies,
    'human',
    'draft_updated',
    'succeeded',
    validation.suppliedFields,
  )

  return succeeded(nextState, {
    changed: true,
    changedFields: [...validation.suppliedFields],
    workflowStatus: nextState.status as 'empty' | 'draft',
    revision: nextState.revision,
  })
}

/**
 * Changes optional disclosure policy exclusively through the human path. A
 * policy change invalidates review/approval even if no draft value changed.
 */
export function setOptionalDisclosureFromHuman(
  state: PermissionSlipState,
  fieldInput: unknown,
  authorizedInput: unknown,
  dependencies: DomainDependencies,
): OperationResult<DisclosureAuthorizationResult> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      'human',
      'disclosure_changed',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted demo is locked.',
        'Reset the demo before changing disclosure permissions.',
      ),
    )
  }

  if (
    typeof fieldInput !== 'string' ||
    !isOptionalFieldName(fieldInput) ||
    typeof authorizedInput !== 'boolean'
  ) {
    return rejected(
      state,
      dependencies,
      'human',
      'disclosure_changed',
      error(
        'INVALID_INPUT',
        'Disclosure updates require a recognized optional field and a boolean authorization.',
        'Retry with one optional field and an explicit true or false value.',
      ),
    )
  }

  if (state.optionalDisclosureAuthorizations[fieldInput] === authorizedInput) {
    return succeeded(state, {
      changed: false,
      field: fieldInput,
      authorized: authorizedInput,
      authorizedOptionalFields: OPTIONAL_FIELD_NAMES.filter(
        (field) => state.optionalDisclosureAuthorizations[field],
      ),
      workflowStatus: editingStatus(state.draft),
      revision: state.revision,
    })
  }

  let nextState = invalidatedEditingState(state, state.draft)
  nextState = {
    ...nextState,
    optionalDisclosureAuthorizations: {
      ...state.optionalDisclosureAuthorizations,
      [fieldInput]: authorizedInput,
    },
  }
  nextState = appendActivity(
    nextState,
    dependencies,
    'human',
    'disclosure_changed',
    'succeeded',
    [fieldInput],
  )

  return succeeded(nextState, {
    changed: true,
    field: fieldInput,
    authorized: authorizedInput,
    authorizedOptionalFields: OPTIONAL_FIELD_NAMES.filter(
      (field) => nextState.optionalDisclosureAuthorizations[field],
    ),
    workflowStatus: nextState.status as 'empty' | 'draft',
    revision: nextState.revision,
  })
}

/**
 * Captures the currently authorized disclosure and computes its consistency
 * digest. Preparing a review never grants approval or submission authority.
 */
export async function prepareSubmissionReview(
  state: PermissionSlipState,
  actor: 'agent' | 'human',
  dependencies: DomainDependencies,
): Promise<OperationResult<PreparedReviewResult>> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      actor,
      'review_prepared',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted demo is locked.',
        'Ask the human to reset the demo before preparing another review.',
      ),
    )
  }

  const validation = validateCompleteDraft(state.draft)
  if (!validation.valid || !validation.normalizedDraft) {
    return rejected(
      state,
      dependencies,
      actor,
      'review_prepared',
      error(
        'INCOMPLETE_DRAFT',
        'A review cannot be prepared until every required field is valid.',
        'Complete or correct the listed fields, then prepare the review again.',
        {
          fields: [...new Set(validation.issues.map((issue) => issue.field))],
          issues: validation.issues,
        },
      ),
      validation.issues
        .map((issue) => issue.field)
        .filter((field): field is IntakeFieldName =>
          INTAKE_FIELD_NAMES.includes(field as IntakeFieldName),
        ),
    )
  }

  const details = buildDisclosureSnapshot(
    validation.normalizedDraft,
    state.optionalDisclosureAuthorizations,
  )
  const canonicalSnapshot = canonicalSerialize(details.snapshot)
  let digest: string

  try {
    digest = await dependencies.digest(canonicalSnapshot)
  } catch {
    return rejected(
      state,
      dependencies,
      actor,
      'review_prepared',
      error(
        'DIGEST_UNAVAILABLE',
        'The browser could not create the review digest.',
        'Use a browser with Web Crypto support and prepare the review again.',
      ),
    )
  }

  if (typeof digest !== 'string' || digest.length === 0) {
    return rejected(
      state,
      dependencies,
      actor,
      'review_prepared',
      error(
        'DIGEST_UNAVAILABLE',
        'The browser returned an invalid review digest.',
        'Prepare the review again in a browser with Web Crypto support.',
      ),
    )
  }

  const review = {
    reviewId: dependencies.createId('review'),
    digest,
    revision: state.revision,
    createdAt: dependencies.now(),
    snapshot: details.snapshot,
    disclosedFields: details.disclosedFields,
    authorizedOptionalFields: details.authorizedOptionalFields,
    withheldOptionalFields: details.withheldOptionalFields,
  }

  let nextState: PermissionSlipState = {
    ...state,
    status: 'review_pending',
    review,
    approval: null,
  }
  nextState = appendActivity(
    nextState,
    dependencies,
    actor,
    'review_prepared',
    'succeeded',
    details.disclosedFields,
  )

  return succeeded(nextState, {
    reviewId: review.reviewId,
    digest: review.digest,
    revision: review.revision,
    review,
    reviewSummary: {
      disclosedFields: [...review.disclosedFields],
      authorizedOptionalFields: [...review.authorizedOptionalFields],
      withheldOptionalFields: [...review.withheldOptionalFields],
    },
    workflowStatus: 'review_pending',
    humanActionRequired:
      'The human must approve this exact review in the webpage before submission.',
  })
}

/**
 * Records human approval only when ID, digest, and revision exactly match the
 * visible pending review. No agent-facing facade exposes this operation.
 */
export function approveReviewFromHuman(
  state: PermissionSlipState,
  input: ApprovalInput,
  dependencies: DomainDependencies,
): OperationResult<ApprovalResult> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      'human',
      'review_approved',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted demo is locked.',
        'Reset the demo before creating another approval.',
      ),
    )
  }

  if (!state.review || state.status !== 'review_pending') {
    return rejected(
      state,
      dependencies,
      'human',
      'review_approved',
      error(
        'REVIEW_NOT_FOUND',
        'There is no pending review to approve.',
        'Prepare a fresh review before approving.',
      ),
    )
  }

  if (
    typeof input !== 'object' ||
    input === null ||
    typeof input.reviewId !== 'string' ||
    typeof input.digest !== 'string' ||
    !Number.isInteger(input.revision)
  ) {
    return rejected(
      state,
      dependencies,
      'human',
      'review_approved',
      error(
        'INVALID_INPUT',
        'Approval requires the exact reviewId, digest, and revision.',
        'Use the values displayed by the current review.',
      ),
    )
  }

  if (
    input.reviewId !== state.review.reviewId ||
    input.revision !== state.review.revision ||
    state.revision !== state.review.revision
  ) {
    return rejected(
      state,
      dependencies,
      'human',
      'review_approved',
      error(
        'STALE_REVIEW',
        'The approval does not match the current review and draft revision.',
        'Prepare and inspect a fresh review before approving.',
      ),
    )
  }

  if (input.digest !== state.review.digest) {
    return rejected(
      state,
      dependencies,
      'human',
      'review_approved',
      error(
        'DIGEST_MISMATCH',
        'The approval digest does not match the visible review.',
        'Approve only the digest displayed in the current review.',
      ),
    )
  }

  const approval = {
    reviewId: state.review.reviewId,
    digest: state.review.digest,
    revision: state.review.revision,
    approvedAt: dependencies.now(),
  }
  let nextState: PermissionSlipState = {
    ...state,
    status: 'approved',
    approval,
  }
  nextState = appendActivity(
    nextState,
    dependencies,
    'human',
    'review_approved',
    'succeeded',
    state.review.disclosedFields,
  )

  return succeeded(nextState, {
    approval,
    workflowStatus: 'approved',
    nextAction: 'The approved review can now be submitted using its review ID.',
  })
}

/** Returns to editing by discarding any review and approval binding. */
export function returnToEditingFromHuman(
  state: PermissionSlipState,
  dependencies: DomainDependencies,
): OperationResult<ReturnToEditingResult> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      'human',
      'returned_to_editing',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted demo is locked.',
        'Reset the demo before starting another draft.',
      ),
    )
  }

  if (!state.review && !state.approval) {
    return succeeded(state, {
      workflowStatus: editingStatus(state.draft),
      revision: state.revision,
    })
  }

  let nextState = invalidatedEditingState(state, state.draft)
  nextState = appendActivity(
    nextState,
    dependencies,
    'human',
    'returned_to_editing',
    'succeeded',
  )

  return succeeded(nextState, {
    workflowStatus: nextState.status as 'empty' | 'draft',
    revision: nextState.revision,
  })
}

/**
 * Revalidates draft, authorization projection, revision, review, approval, and
 * digest before creating a local receipt. This operation performs no network I/O.
 */
export async function submitApprovedIntake(
  state: PermissionSlipState,
  reviewIdInput: unknown,
  actor: 'agent' | 'human',
  dependencies: DomainDependencies,
): Promise<OperationResult<SubmissionResult>> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'SUBMITTED_TERMINAL',
        'This demo intake has already been submitted.',
        'Retrieve its receipt, or ask the human to reset the demo.',
      ),
    )
  }

  if (typeof reviewIdInput !== 'string' || reviewIdInput.trim().length === 0) {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'INVALID_INPUT',
        'Submission requires a non-empty reviewId.',
        'Retry with the reviewId returned by prepare_submission_review.',
      ),
    )
  }

  if (!state.review) {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'REVIEW_NOT_FOUND',
        'No review exists for this draft.',
        'Prepare a review and wait for human approval before submitting.',
      ),
    )
  }

  if (reviewIdInput !== state.review.reviewId) {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'STALE_REVIEW',
        'The supplied reviewId does not match the current review.',
        'Use the current reviewId or prepare a fresh review.',
      ),
    )
  }

  if (!state.approval || state.status !== 'approved') {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'APPROVAL_REQUIRED',
        'The human has not approved this review in the webpage.',
        'Wait for the human to approve the exact visible disclosure before retrying.',
      ),
    )
  }

  if (
    state.revision !== state.review.revision ||
    state.approval.reviewId !== state.review.reviewId ||
    state.approval.revision !== state.review.revision
  ) {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'STALE_REVIEW',
        'The draft or approval no longer matches the frozen review.',
        'Prepare a fresh review and obtain a new human approval.',
      ),
    )
  }

  const validation = validateCompleteDraft(state.draft)
  if (!validation.valid || !validation.normalizedDraft) {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'STALE_REVIEW',
        'The current draft is no longer complete and valid.',
        'Correct the draft, prepare a fresh review, and obtain approval again.',
      ),
    )
  }

  const currentDetails = buildDisclosureSnapshot(
    validation.normalizedDraft,
    state.optionalDisclosureAuthorizations,
  )
  const currentCanonical = canonicalSerialize(currentDetails.snapshot)
  const reviewedCanonical = canonicalSerialize(state.review.snapshot)

  if (currentCanonical !== reviewedCanonical) {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'STALE_REVIEW',
        'The current disclosure differs from the frozen review.',
        'Prepare a fresh review and obtain a new human approval.',
      ),
    )
  }

  let currentDigest: string
  try {
    currentDigest = await dependencies.digest(currentCanonical)
  } catch {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'DIGEST_UNAVAILABLE',
        'The browser could not verify the review digest.',
        'Retry in a browser with Web Crypto support.',
      ),
    )
  }

  if (
    currentDigest !== state.review.digest ||
    state.approval.digest !== state.review.digest
  ) {
    return rejected(
      state,
      dependencies,
      actor,
      'intake_submitted',
      error(
        'DIGEST_MISMATCH',
        'The current, reviewed, and approved digests do not match.',
        'Prepare a fresh review and obtain a new human approval.',
      ),
    )
  }

  const receipt: DisclosureReceipt = {
    receiptId: dependencies.createId('receipt'),
    reviewId: state.review.reviewId,
    submissionTimestamp: dependencies.now(),
    fieldsDisclosed: { ...state.review.snapshot },
    disclosedFieldNames: [...state.review.disclosedFields],
    optionalFieldsWithheld: [...state.review.withheldOptionalFields],
    neverCollectedCategories: [...NEVER_COLLECTED_NAMES],
    snapshotDigest: state.review.digest,
    destination: 'Local demonstration only',
    noNetworkTransmission: true,
    statement: 'No network transmission occurred.',
  }

  let nextState: PermissionSlipState = {
    ...state,
    status: 'submitted',
    receipts: [...state.receipts, receipt],
  }
  nextState = appendActivity(
    nextState,
    dependencies,
    actor,
    'intake_submitted',
    'succeeded',
    state.review.disclosedFields,
  )

  return succeeded(nextState, {
    receiptId: receipt.receiptId,
    receipt,
    workflowStatus: 'submitted',
    confirmation:
      'The approved snapshot was stored locally. No network transmission occurred.',
  })
}

/** Reads a named receipt, or the latest one when no ID is supplied, without mutation. */
export function getDisclosureReceipt(
  state: PermissionSlipState,
  receiptId?: unknown,
): OperationResult<DisclosureReceipt> {
  if (
    receiptId !== undefined &&
    (typeof receiptId !== 'string' || receiptId.trim().length === 0)
  ) {
    return {
      ok: false,
      error: error(
        'INVALID_INPUT',
        'receiptId must be a non-empty string when supplied.',
        'Retry without a receiptId to get the latest receipt, or use a valid receiptId.',
      ),
      state,
    }
  }

  const receipt =
    receiptId === undefined
      ? state.receipts.at(-1)
      : state.receipts.find((candidate) => candidate.receiptId === receiptId)

  if (!receipt) {
    return {
      ok: false,
      error: error(
        'RECEIPT_NOT_FOUND',
        'No matching disclosure receipt exists.',
        'Submit an approved intake first, or retry with a known receiptId.',
      ),
      state,
    }
  }

  return succeeded(state, receipt)
}

/** Creates a fresh empty workflow; only the human store facade exposes reset. */
export function resetFromHuman(): OperationResult<ResetResult> {
  const state = createInitialState()
  return succeeded(state, { workflowStatus: 'empty', cleared: true })
}

/**
 * Converts an async race into an auditable rejection rather than overwriting a
 * newer state produced while digest work was in flight.
 */
export function rejectStaleAsyncOperation(
  state: PermissionSlipState,
  actor: 'agent' | 'human',
  action: 'review_prepared' | 'intake_submitted',
  dependencies: DomainDependencies,
): OperationResult<never> {
  return rejected(
    state,
    dependencies,
    actor,
    action,
    error(
      'STALE_OPERATION',
      'The state changed while this operation was being prepared.',
      'Inspect the current state and retry the operation.',
    ),
  )
}

/** Produces value-free activity copy suitable for the visible audit trail. */
export function activitySummary(activity: ActivityEntry): string {
  const actor = activity.actor === 'human' ? 'Human' : activity.actor === 'agent' ? 'Agent' : 'System'
  const result = activity.outcome === 'succeeded' ? 'completed' : 'rejected'
  const actions: Record<ActivityAction, string> = {
    draft_replaced: 'draft replacement',
    draft_updated: 'draft update',
    disclosure_changed: 'disclosure permission change',
    review_prepared: 'review preparation',
    review_approved: 'review approval',
    returned_to_editing: 'return to editing',
    intake_submitted: 'local submission',
  }
  return `${actor} ${actions[activity.action]} ${result}.`
}
