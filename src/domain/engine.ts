import {
  ACTIVITY_LIMIT,
  DEFAULT_INQUIRY_PROVENANCE,
  EMPTY_CONTACT_PERMISSIONS,
  EMPTY_OPTIONAL_AUTHORIZATIONS,
  INTAKE_REQUIREMENTS_INSTRUCTIONS,
  NEVER_COLLECTED_DEFINITIONS,
  OPTIONAL_FIELD_DEFINITIONS,
  REQUIRED_FIELD_DEFINITIONS,
} from './constants'
import {
  buildDisclosureSnapshot,
  canonicalSerializeReviewPayload,
  sha256Digest,
} from './canonical'
import {
  CONTACT_PERMISSION_NAMES,
  INTAKE_FIELD_NAMES,
  NEVER_COLLECTED_NAMES,
  OPTIONAL_FIELD_NAMES,
  REQUESTED_NEXT_STEPS,
  SIMULATED_INQUIRY_DESTINATION,
  type ActivityAction,
  type ActivityActor,
  type ActivityEntry,
  type ApprovalInput,
  type ApprovalResult,
  type AssistantVerificationResult,
  type ContactPermissionName,
  type ContactPermissionResult,
  type ContactPermissions,
  type DisclosureAuthorizationResult,
  type DomainDependencies,
  type DomainError,
  type DomainErrorCode,
  type DraftIntakeResult,
  type FailedSubmissionReceipt,
  type FieldProvenance,
  type HumanDraftUpdateResult,
  type InquiryDraft,
  type InquiryProvenance,
  type InquiryReviewPayload,
  type IntakeFieldName,
  type IntakeRequirements,
  type NextStepIntentResult,
  type OperationResult,
  type PermissionSlipState,
  type PreparedReviewResult,
  type ResetResult,
  type ReturnToEditingResult,
  type SubmissionResult,
  type SuccessfulSubmissionReceipt,
} from './types'
import {
  isContactPermissionName,
  isOptionalFieldName,
  validateAgentDraftInput,
  validateCompleteDraft,
  validateHumanDraftPatch,
} from './validation'

function defaultId(kind: Parameters<DomainDependencies['createId']>[0]): string {
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

export function freezePermissionSlipState(
  state: PermissionSlipState,
): PermissionSlipState {
  return deepFreeze(state)
}

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

/** Version 2 intentionally invalidates the earlier demo representation. */
export function createInitialState(): PermissionSlipState {
  return freezePermissionSlipState({
    stateVersion: 2,
    status: 'empty',
    draft: {},
    fieldProvenance: {},
    revision: 0,
    optionalDisclosureAuthorizations: { ...EMPTY_OPTIONAL_AUTHORIZATIONS },
    nextStepIntentConfirmed: false,
    contactPermissions: { ...EMPTY_CONTACT_PERMISSIONS },
    inquiryProvenance: { ...DEFAULT_INQUIRY_PROVENANCE },
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
  domainError: DomainError,
  safeFieldNames: IntakeFieldName[] = [],
): OperationResult<T> {
  return {
    ok: false,
    error: domainError,
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

function editingStatus(draft: InquiryDraft): 'empty' | 'draft' {
  return INTAKE_FIELD_NAMES.some((field) => draft[field] !== undefined)
    ? 'draft'
    : 'empty'
}

function invalidatedEditingState(
  state: PermissionSlipState,
  draft: InquiryDraft,
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

function sameDraft(left: InquiryDraft, right: InquiryDraft): boolean {
  return INTAKE_FIELD_NAMES.every((field) => Object.is(left[field], right[field]))
}

function provenanceForAgentReplacement(
  state: PermissionSlipState,
  nextDraft: InquiryDraft,
  suppliedFields: IntakeFieldName[],
  dependencies: DomainDependencies,
): PermissionSlipState['fieldProvenance'] {
  const updatedAt = dependencies.now()
  const provenance: PermissionSlipState['fieldProvenance'] = {}

  for (const field of INTAKE_FIELD_NAMES) {
    if (nextDraft[field] === undefined) continue
    if (suppliedFields.includes(field)) {
      provenance[field] = {
        source: 'assistant_suggested',
        verifiedByHuman: false,
        updatedAt,
      }
    } else if (state.fieldProvenance[field]) {
      provenance[field] = { ...state.fieldProvenance[field] }
    }
  }
  return provenance
}

function unverifiedPopulatedFields(state: PermissionSlipState): IntakeFieldName[] {
  return INTAKE_FIELD_NAMES.filter(
    (field) =>
      state.draft[field] !== undefined &&
      state.fieldProvenance[field]?.verifiedByHuman !== true,
  )
}

function cloneInquiryProvenance(
  provenance: InquiryProvenance,
): InquiryProvenance {
  return { ...provenance }
}

function cloneDisclosedProvenance(
  state: PermissionSlipState,
  disclosedFields: IntakeFieldName[],
): Partial<Record<IntakeFieldName, FieldProvenance>> {
  const result: Partial<Record<IntakeFieldName, FieldProvenance>> = {}
  for (const field of disclosedFields) {
    const provenance = state.fieldProvenance[field]
    if (provenance) result[field] = { ...provenance }
  }
  return result
}

function permissionNames(
  permissions: ContactPermissions,
  granted: boolean,
): ContactPermissionName[] {
  return CONTACT_PERMISSION_NAMES.filter(
    (permission) => permissions[permission] === granted,
  )
}

function buildReviewPayload(
  state: PermissionSlipState,
  snapshot: InquiryReviewPayload['snapshot'],
  disclosedFields: IntakeFieldName[],
): InquiryReviewPayload {
  return {
    snapshot: { ...snapshot },
    optionalDisclosureAuthorizations: {
      ...state.optionalDisclosureAuthorizations,
    },
    contactPermissions: { ...state.contactPermissions },
    nextStepIntentConfirmed: true,
    inquiryProvenance: cloneInquiryProvenance(state.inquiryProvenance),
    fieldProvenance: cloneDisclosedProvenance(state, disclosedFields),
  }
}

function failureReceipt(
  state: PermissionSlipState,
  dependencies: DomainDependencies,
  domainError: DomainError,
  reviewId: string | null,
): FailedSubmissionReceipt {
  return {
    receiptId: dependencies.createId('receipt'),
    submissionId: null,
    submissionTimestamp: dependencies.now(),
    outcome: 'rejected',
    status: 'submission_rejected',
    destination: SIMULATED_INQUIRY_DESTINATION,
    requestedNextStep: state.draft.requestedNextStep ?? null,
    permissionsGranted: permissionNames(state.contactPermissions, true),
    permissionsWithheld: permissionNames(state.contactPermissions, false),
    inquiryProvenance: cloneInquiryProvenance(state.inquiryProvenance),
    reviewId,
    reviewRevision: state.review?.revision ?? null,
    reviewDigest: state.review?.digest ?? null,
    failure: {
      code: domainError.code,
      message: domainError.message,
      retry: domainError.retry,
    },
    noNetworkTransmission: true,
    statement: 'No network transmission occurred.',
  }
}

function rejectedSubmission<T>(
  state: PermissionSlipState,
  dependencies: DomainDependencies,
  actor: 'agent' | 'human',
  domainError: DomainError,
  reviewId: string | null,
): OperationResult<T> {
  const receipt = failureReceipt(state, dependencies, domainError, reviewId)
  const nextState = appendActivity(
    { ...state, receipts: [...state.receipts, receipt] },
    dependencies,
    actor,
    'intake_submitted',
    'rejected',
  )
  return {
    ok: false,
    error: { ...domainError, receiptId: receipt.receiptId },
    failureReceipt: receipt,
    state: freezePermissionSlipState(nextState),
  }
}

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
    nextStepIntentConfirmed: state.nextStepIntentConfirmed,
    contactPermissions: { ...state.contactPermissions },
    unverifiedAssistantFields: unverifiedPopulatedFields(state),
    instructions: INTAKE_REQUIREMENTS_INSTRUCTIONS,
  }
}

/** Agent proposals remain atomic and cannot grant any human permission. */
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
        'The submitted inquiry is locked.',
        'Ask the human to reset before preparing another inquiry.',
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
          'The inquiry included unrecognized properties.',
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
          'The inquiry included optional fields the person has not authorized.',
          'Omit those fields. Only the person can change disclosure permissions.',
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
        'The proposed inquiry did not satisfy the field rules.',
        'Correct every listed field and retry the complete inquiry.',
        { fields: validation.fields, issues: validation.issues },
      ),
      validation.fields.filter((field): field is IntakeFieldName =>
        INTAKE_FIELD_NAMES.includes(field as IntakeFieldName),
      ),
    )
  }

  const nextDraft: InquiryDraft = { ...validation.draft }
  for (const field of OPTIONAL_FIELD_NAMES) {
    if (
      !state.optionalDisclosureAuthorizations[field] &&
      state.draft[field] !== undefined
    ) {
      nextDraft[field] = state.draft[field]
    }
  }

  let nextState = invalidatedEditingState(state, nextDraft)
  nextState = {
    ...nextState,
    nextStepIntentConfirmed: false,
    inquiryProvenance: {
      ...state.inquiryProvenance,
      entrySource: 'webmcp',
    },
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
    nextAction:
      'Ask the person to verify assistant suggestions, confirm the requested next step, and set contact permissions before review.',
  })
}

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
        'The submitted inquiry is locked.',
        'Reset before editing another inquiry.',
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
          ? 'The inquiry update included unrecognized properties.'
          : 'The inquiry update used unsupported values.',
        unknown
          ? 'Use only recognized inquiry fields.'
          : 'Correct the listed fields and retry.',
        { fields: validation.fields, issues: validation.issues },
      ),
    )
  }

  const nextDraft: InquiryDraft = { ...state.draft }
  for (const field of validation.suppliedFields) {
    const value = validation.patch[field]
    if (value === undefined) delete nextDraft[field]
    else nextDraft[field] = value as never
  }

  if (sameDraft(state.draft, nextDraft)) {
    return succeeded(state, {
      changed: false,
      changedFields: [],
      workflowStatus: editingStatus(state.draft),
      revision: state.revision,
    })
  }

  let nextState = invalidatedEditingState(state, nextDraft)
  const updatedAt = dependencies.now()
  const fieldProvenance = { ...state.fieldProvenance }
  for (const field of validation.suppliedFields) {
    if (nextDraft[field] === undefined) delete fieldProvenance[field]
    else {
      fieldProvenance[field] = {
        source: 'person_provided',
        verifiedByHuman: true,
        updatedAt,
        verifiedAt: updatedAt,
      }
    }
  }
  nextState = {
    ...nextState,
    fieldProvenance,
    nextStepIntentConfirmed: validation.suppliedFields.includes(
      'requestedNextStep',
    )
      ? false
      : state.nextStepIntentConfirmed,
  }
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
        'The submitted inquiry is locked.',
        'Reset before changing disclosure decisions.',
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
        'Disclosure updates require one optional field and a boolean decision.',
        'Use a recognized optional field and an explicit decision.',
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

/** Only the human facade should expose this operation. */
export function verifyAssistantSuggestionsFromHuman(
  state: PermissionSlipState,
  dependencies: DomainDependencies,
): OperationResult<AssistantVerificationResult> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      'human',
      'assistant_suggestions_verified',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted inquiry is locked.',
        'Reset before reviewing another inquiry.',
      ),
    )
  }

  const fields = INTAKE_FIELD_NAMES.filter((field) => {
    const provenance = state.fieldProvenance[field]
    return (
      state.draft[field] !== undefined &&
      provenance?.source === 'assistant_suggested' &&
      !provenance.verifiedByHuman
    )
  })
  if (fields.length === 0) {
    return succeeded(state, {
      changed: false,
      verifiedFields: [],
      workflowStatus: editingStatus(state.draft),
      revision: state.revision,
    })
  }

  const verifiedAt = dependencies.now()
  const fieldProvenance = { ...state.fieldProvenance }
  for (const field of fields) {
    const current = fieldProvenance[field]
    if (!current) continue
    fieldProvenance[field] = {
      ...current,
      verifiedByHuman: true,
      verifiedAt,
    }
  }

  let nextState = invalidatedEditingState(state, state.draft)
  nextState = { ...nextState, fieldProvenance }
  nextState = appendActivity(
    nextState,
    dependencies,
    'human',
    'assistant_suggestions_verified',
    'succeeded',
    fields,
  )

  return succeeded(nextState, {
    changed: true,
    verifiedFields: fields,
    workflowStatus: nextState.status as 'empty' | 'draft',
    revision: nextState.revision,
  })
}

/** Explicitly confirms or revokes intent for the currently requested next step. */
export function confirmNextStepIntentFromHuman(
  state: PermissionSlipState,
  confirmedInput: unknown,
  dependencies: DomainDependencies,
): OperationResult<NextStepIntentResult> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      'human',
      'next_step_intent_changed',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted inquiry is locked.',
        'Reset before confirming another next step.',
      ),
    )
  }
  if (typeof confirmedInput !== 'boolean') {
    return rejected(
      state,
      dependencies,
      'human',
      'next_step_intent_changed',
      error(
        'INVALID_INPUT',
        'Next-step confirmation requires an explicit boolean decision.',
        'Confirm or revoke the visible requested next step.',
      ),
    )
  }
  if (
    confirmedInput &&
    (!state.draft.requestedNextStep ||
      !REQUESTED_NEXT_STEPS.includes(state.draft.requestedNextStep))
  ) {
    return rejected(
      state,
      dependencies,
      'human',
      'next_step_intent_changed',
      error(
        'INCOMPLETE_DRAFT',
        'A valid requested next step is required before intent can be confirmed.',
        'Choose a visible next step, then confirm it.',
        { fields: ['requestedNextStep'] },
      ),
      ['requestedNextStep'],
    )
  }
  if (state.nextStepIntentConfirmed === confirmedInput) {
    return succeeded(state, {
      changed: false,
      confirmed: confirmedInput,
      ...(state.draft.requestedNextStep
        ? { requestedNextStep: state.draft.requestedNextStep }
        : {}),
      workflowStatus: editingStatus(state.draft),
      revision: state.revision,
    })
  }

  let nextState = invalidatedEditingState(state, state.draft)
  nextState = { ...nextState, nextStepIntentConfirmed: confirmedInput }
  nextState = appendActivity(
    nextState,
    dependencies,
    'human',
    'next_step_intent_changed',
    'succeeded',
    ['requestedNextStep'],
  )
  return succeeded(nextState, {
    changed: true,
    confirmed: confirmedInput,
    ...(state.draft.requestedNextStep
      ? { requestedNextStep: state.draft.requestedNextStep }
      : {}),
    workflowStatus: nextState.status as 'empty' | 'draft',
    revision: nextState.revision,
  })
}

/** Project response and optional updates remain independent human decisions. */
export function setContactPermissionFromHuman(
  state: PermissionSlipState,
  permissionInput: unknown,
  grantedInput: unknown,
  dependencies: DomainDependencies,
): OperationResult<ContactPermissionResult> {
  if (state.status === 'submitted') {
    return rejected(
      state,
      dependencies,
      'human',
      'contact_permission_changed',
      error(
        'SUBMITTED_TERMINAL',
        'The submitted inquiry is locked.',
        'Reset before changing contact permissions.',
      ),
    )
  }
  if (
    typeof permissionInput !== 'string' ||
    !isContactPermissionName(permissionInput) ||
    typeof grantedInput !== 'boolean'
  ) {
    return rejected(
      state,
      dependencies,
      'human',
      'contact_permission_changed',
      error(
        'INVALID_INPUT',
        'Contact permission requires a recognized permission and boolean decision.',
        'Use one visible contact permission and an explicit decision.',
      ),
    )
  }
  if (state.contactPermissions[permissionInput] === grantedInput) {
    return succeeded(state, {
      changed: false,
      permission: permissionInput,
      granted: grantedInput,
      contactPermissions: { ...state.contactPermissions },
      workflowStatus: editingStatus(state.draft),
      revision: state.revision,
    })
  }

  let nextState = invalidatedEditingState(state, state.draft)
  nextState = {
    ...nextState,
    contactPermissions: {
      ...state.contactPermissions,
      [permissionInput]: grantedInput,
    },
  }
  nextState = appendActivity(
    nextState,
    dependencies,
    'human',
    'contact_permission_changed',
    'succeeded',
  )
  return succeeded(nextState, {
    changed: true,
    permission: permissionInput,
    granted: grantedInput,
    contactPermissions: { ...nextState.contactPermissions },
    workflowStatus: nextState.status as 'empty' | 'draft',
    revision: nextState.revision,
  })
}

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
        'The submitted inquiry is locked.',
        'Ask the human to reset before preparing another review.',
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
        'Every required inquiry field must be valid before review.',
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

  if (!state.nextStepIntentConfirmed) {
    return rejected(
      state,
      dependencies,
      actor,
      'review_prepared',
      error(
        'INTENT_CONFIRMATION_REQUIRED',
        'The person has not confirmed the requested business next step.',
        'Ask the person to confirm the visible requested next step.',
        { fields: ['requestedNextStep'] },
      ),
      ['requestedNextStep'],
    )
  }

  if (!state.contactPermissions.projectResponse) {
    return rejected(
      state,
      dependencies,
      actor,
      'review_prepared',
      error(
        'CONTACT_PERMISSION_REQUIRED',
        'Permission to reply about this project has not been granted.',
        'The person must grant project-response permission separately from optional updates.',
      ),
    )
  }

  const unverifiedFields = unverifiedPopulatedFields(state)
  if (unverifiedFields.length > 0) {
    return rejected(
      state,
      dependencies,
      actor,
      'review_prepared',
      error(
        'HUMAN_VERIFICATION_REQUIRED',
        'Assistant-suggested values still need visible human verification.',
        'Ask the person to verify every assistant suggestion before review.',
        { fields: unverifiedFields },
      ),
      unverifiedFields,
    )
  }

  const details = buildDisclosureSnapshot(
    validation.normalizedDraft,
    state.optionalDisclosureAuthorizations,
  )
  if (
    details.snapshot.preferredResponseMethod === 'phone' &&
    details.snapshot.phone === undefined
  ) {
    return rejected(
      state,
      dependencies,
      actor,
      'review_prepared',
      error(
        'INCOMPLETE_DRAFT',
        'Phone response was selected, but no authorized phone number is included.',
        'Authorize and provide a phone number, or choose another response method.',
        { fields: ['phone', 'preferredResponseMethod'] },
      ),
      ['phone', 'preferredResponseMethod'],
    )
  }

  const payload = buildReviewPayload(
    state,
    details.snapshot,
    details.disclosedFields,
  )
  const canonicalPayload = canonicalSerializeReviewPayload(payload)
  let digest: string
  try {
    digest = await dependencies.digest(canonicalPayload)
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
    payload,
    snapshot: { ...payload.snapshot },
    disclosedFields: [...details.disclosedFields],
    authorizedOptionalFields: [...details.authorizedOptionalFields],
    withheldOptionalFields: [...details.withheldOptionalFields],
    contactPermissions: { ...payload.contactPermissions },
    nextStepIntentConfirmed: true as const,
    inquiryProvenance: cloneInquiryProvenance(payload.inquiryProvenance),
    fieldProvenance: cloneDisclosedProvenance(
      state,
      details.disclosedFields,
    ),
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
      permissionsGranted: permissionNames(review.contactPermissions, true),
      permissionsWithheld: permissionNames(review.contactPermissions, false),
    },
    workflowStatus: 'review_pending',
    humanActionRequired:
      'The person must approve this exact visible review before submission.',
  })
}

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
        'The submitted inquiry is locked.',
        'Reset before approving another inquiry.',
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
        'Approval requires the exact review ID, digest, and revision.',
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
        'The approval does not match the current review and revision.',
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
    nextAction: 'The approved review can now be submitted by its review ID.',
  })
}

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
        'The submitted inquiry is locked.',
        'Reset before starting another inquiry.',
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

/** Executes only the still-current frozen payload and records every outcome. */
export async function submitApprovedIntake(
  state: PermissionSlipState,
  reviewIdInput: unknown,
  actor: 'agent' | 'human',
  dependencies: DomainDependencies,
): Promise<OperationResult<SubmissionResult>> {
  if (typeof reviewIdInput !== 'string' || reviewIdInput.trim().length === 0) {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'INVALID_INPUT',
        'Submission requires a non-empty review ID.',
        'Retry with the review ID returned by prepare_submission_review.',
      ),
      null,
    )
  }

  const priorSuccess = state.receipts.find(
    (receipt): receipt is SuccessfulSubmissionReceipt =>
      receipt.outcome === 'accepted' && receipt.reviewId === reviewIdInput,
  )
  if (priorSuccess) {
    return succeeded(state, {
      receiptId: priorSuccess.receiptId,
      submissionId: priorSuccess.submissionId,
      receipt: priorSuccess,
      workflowStatus: 'submitted',
      confirmation:
        'This exact review was already submitted; the original receipt was returned.',
      idempotentReplay: true,
    })
  }

  if (state.status === 'submitted') {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'SUBMITTED_TERMINAL',
        'A different inquiry review has already been submitted.',
        'Retrieve its receipt, or ask the human to reset.',
      ),
      reviewIdInput,
    )
  }
  if (!state.review) {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'REVIEW_NOT_FOUND',
        'No review exists for this inquiry.',
        'Prepare a review and wait for human approval before submitting.',
      ),
      reviewIdInput,
    )
  }
  if (reviewIdInput !== state.review.reviewId) {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'STALE_REVIEW',
        'The supplied review ID does not match the current review.',
        'Use the current review ID or prepare a fresh review.',
      ),
      reviewIdInput,
    )
  }
  if (!state.approval || state.status !== 'approved') {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'APPROVAL_REQUIRED',
        'The person has not approved this review in the webpage.',
        'Wait for visible human approval of the exact review before retrying.',
      ),
      reviewIdInput,
    )
  }
  if (
    state.revision !== state.review.revision ||
    state.approval.reviewId !== state.review.reviewId ||
    state.approval.revision !== state.review.revision
  ) {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'STALE_REVIEW',
        'The inquiry or approval no longer matches the frozen review.',
        'Prepare a fresh review and obtain new human approval.',
      ),
      reviewIdInput,
    )
  }

  const validation = validateCompleteDraft(state.draft)
  if (!validation.valid || !validation.normalizedDraft) {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'STALE_REVIEW',
        'The current inquiry is no longer complete and valid.',
        'Correct it, prepare a fresh review, and obtain approval again.',
      ),
      reviewIdInput,
    )
  }
  if (
    !state.nextStepIntentConfirmed ||
    !state.contactPermissions.projectResponse ||
    unverifiedPopulatedFields(state).length > 0
  ) {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'STALE_REVIEW',
        'Human intent, verification, or project-response permission changed.',
        'Prepare a fresh review and obtain approval again.',
      ),
      reviewIdInput,
    )
  }

  const currentDetails = buildDisclosureSnapshot(
    validation.normalizedDraft,
    state.optionalDisclosureAuthorizations,
  )
  const currentPayload = buildReviewPayload(
    state,
    currentDetails.snapshot,
    currentDetails.disclosedFields,
  )
  const currentCanonical = canonicalSerializeReviewPayload(currentPayload)
  const reviewedCanonical = canonicalSerializeReviewPayload(state.review.payload)
  if (currentCanonical !== reviewedCanonical) {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'STALE_REVIEW',
        'The executable inquiry differs from the frozen review.',
        'Prepare a fresh review and obtain approval again.',
      ),
      reviewIdInput,
    )
  }

  let currentDigest: string
  try {
    currentDigest = await dependencies.digest(currentCanonical)
  } catch {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'DIGEST_UNAVAILABLE',
        'The browser could not verify the review digest.',
        'Retry in a browser with Web Crypto support.',
      ),
      reviewIdInput,
    )
  }
  if (
    currentDigest !== state.review.digest ||
    state.approval.digest !== state.review.digest
  ) {
    return rejectedSubmission(
      state,
      dependencies,
      actor,
      error(
        'DIGEST_MISMATCH',
        'The current, reviewed, and approved digests do not match.',
        'Prepare a fresh review and obtain approval again.',
      ),
      reviewIdInput,
    )
  }

  const receipt: SuccessfulSubmissionReceipt = {
    receiptId: dependencies.createId('receipt'),
    submissionId: dependencies.createId('submission'),
    submissionTimestamp: dependencies.now(),
    outcome: 'accepted',
    status: 'qualified_inquiry_created',
    destination: SIMULATED_INQUIRY_DESTINATION,
    requestedNextStep: state.review.snapshot.requestedNextStep,
    permissionsGranted: permissionNames(state.review.contactPermissions, true),
    permissionsWithheld: permissionNames(state.review.contactPermissions, false),
    inquiryProvenance: cloneInquiryProvenance(
      state.review.inquiryProvenance,
    ),
    reviewId: state.review.reviewId,
    reviewRevision: state.review.revision,
    reviewDigest: state.review.digest,
    frozenSnapshot: { ...state.review.snapshot },
    fieldsDisclosed: { ...state.review.snapshot },
    disclosedFieldNames: [...state.review.disclosedFields],
    optionalFieldsWithheld: [...state.review.withheldOptionalFields],
    neverCollectedCategories: [...NEVER_COLLECTED_NAMES],
    snapshotDigest: state.review.digest,
    fieldProvenance: cloneDisclosedProvenance(
      state,
      state.review.disclosedFields,
    ),
    contactPermissions: { ...state.review.contactPermissions },
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
    submissionId: receipt.submissionId,
    receipt,
    workflowStatus: 'submitted',
    confirmation:
      'The approved inquiry snapshot was stored locally as a simulated Village Alchemist submission. No network transmission occurred.',
    idempotentReplay: false,
  })
}

export function getDisclosureReceipt(
  state: PermissionSlipState,
  receiptId?: unknown,
): OperationResult<PermissionSlipState['receipts'][number]> {
  if (
    receiptId !== undefined &&
    (typeof receiptId !== 'string' || receiptId.trim().length === 0)
  ) {
    return {
      ok: false,
      error: error(
        'INVALID_INPUT',
        'receiptId must be a non-empty string when supplied.',
        'Omit it for the latest receipt, or use a valid receipt ID.',
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
        'No matching submission receipt exists.',
        'Attempt submission first, or use a known receipt ID.',
      ),
      state,
    }
  }
  return succeeded(state, receipt)
}

export function resetFromHuman(): OperationResult<ResetResult> {
  const state = createInitialState()
  return succeeded(state, { workflowStatus: 'empty', cleared: true })
}

export function rejectStaleAsyncOperation(
  state: PermissionSlipState,
  actor: 'agent' | 'human',
  action: 'review_prepared' | 'intake_submitted',
  dependencies: DomainDependencies,
): OperationResult<never> {
  const domainError = error(
    'STALE_OPERATION',
    'The state changed while this operation was being prepared.',
    'Inspect the current state and retry the operation.',
  )
  return action === 'intake_submitted'
    ? rejectedSubmission(
        state,
        dependencies,
        actor,
        domainError,
        state.review?.reviewId ?? null,
      )
    : rejected(state, dependencies, actor, action, domainError)
}

export function activitySummary(activity: ActivityEntry): string {
  const actor =
    activity.actor === 'human'
      ? 'Human'
      : activity.actor === 'agent'
        ? 'Agent'
        : 'System'
  const result = activity.outcome === 'succeeded' ? 'completed' : 'rejected'
  const actions: Record<ActivityAction, string> = {
    draft_replaced: 'inquiry replacement',
    draft_updated: 'inquiry update',
    disclosure_changed: 'disclosure permission change',
    assistant_suggestions_verified: 'assistant suggestion verification',
    next_step_intent_changed: 'next-step intent change',
    contact_permission_changed: 'contact permission change',
    review_prepared: 'review preparation',
    review_approved: 'review approval',
    returned_to_editing: 'return to editing',
    intake_submitted: 'simulated inquiry submission',
  }
  return `${actor} ${actions[activity.action]} ${result}.`
}
