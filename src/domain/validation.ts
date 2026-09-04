import {
  CONTACT_PERMISSION_NAMES,
  INQUIRY_TYPES,
  INTAKE_FIELD_NAMES,
  OPTIONAL_FIELD_NAMES,
  PREFERRED_RESPONSE_METHODS,
  REQUESTED_NEXT_STEPS,
  REQUIRED_FIELD_NAMES,
  type ContactPermissionName,
  type InquiryDraft,
  type InquirySnapshot,
  type IntakeFieldName,
  type OptionalDisclosureAuthorizations,
  type OptionalFieldName,
  type ValidationIssue,
} from './types'

const FIELD_NAME_SET = new Set<string>(INTAKE_FIELD_NAMES)
const OPTIONAL_FIELD_SET = new Set<string>(OPTIONAL_FIELD_NAMES)
const CONTACT_PERMISSION_SET = new Set<string>(CONTACT_PERMISSION_NAMES)
const INQUIRY_TYPE_SET = new Set<string>(INQUIRY_TYPES)
const RESPONSE_METHOD_SET = new Set<string>(PREFERRED_RESPONSE_METHODS)
const NEXT_STEP_SET = new Set<string>(REQUESTED_NEXT_STEPS)
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9+().\-\s]{7,40}$/

export interface AgentDraftValidationSuccess {
  ok: true
  draft: InquirySnapshot
  suppliedFields: IntakeFieldName[]
}

export interface AgentDraftValidationFailure {
  ok: false
  kind: 'invalid' | 'unauthorized' | 'unknown'
  fields: string[]
  issues: ValidationIssue[]
}

export type AgentDraftValidation =
  | AgentDraftValidationSuccess
  | AgentDraftValidationFailure

export interface CompleteDraftValidation {
  valid: boolean
  normalizedDraft?: InquirySnapshot
  issues: ValidationIssue[]
}

export interface HumanPatchValidationSuccess {
  ok: true
  patch: InquiryDraft
  suppliedFields: IntakeFieldName[]
}

export interface HumanPatchValidationFailure {
  ok: false
  kind: 'invalid' | 'unknown'
  fields: string[]
  issues: ValidationIssue[]
}

export type HumanPatchValidation =
  | HumanPatchValidationSuccess
  | HumanPatchValidationFailure

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function knownFieldNames(value: Record<string, unknown>): IntakeFieldName[] {
  return INTAKE_FIELD_NAMES.filter((field) =>
    Object.prototype.hasOwnProperty.call(value, field),
  )
}

function stringIssue(
  field: IntakeFieldName,
  value: unknown,
  minimum: number,
  maximum: number,
): ValidationIssue | null {
  if (typeof value !== 'string') {
    return { field, code: 'type', message: `${field} must be a string.` }
  }

  const length = value.trim().length
  return length >= minimum && length <= maximum
    ? null
    : {
        field,
        code: 'range',
        message: `${field} must contain between ${minimum} and ${maximum} characters.`,
      }
}

function enumIssue(
  field: IntakeFieldName,
  value: unknown,
  allowed: ReadonlySet<string>,
): ValidationIssue | null {
  if (typeof value !== 'string') {
    return { field, code: 'type', message: `${field} must be a string.` }
  }
  return allowed.has(value.trim())
    ? null
    : {
        field,
        code: 'format',
        message: `${field} must use one of the documented values.`,
      }
}

function validateField(
  field: IntakeFieldName,
  value: unknown,
): ValidationIssue | null {
  switch (field) {
    case 'contactName':
      return stringIssue(field, value, 2, 100)
    case 'email': {
      const issue = stringIssue(field, value, 3, 254)
      if (issue) return issue
      return EMAIL_PATTERN.test((value as string).trim())
        ? null
        : {
            field,
            code: 'format',
            message: 'email must be a valid email address.',
          }
    }
    case 'inquiryType':
      return enumIssue(field, value, INQUIRY_TYPE_SET)
    case 'desiredOutcome':
      return stringIssue(field, value, 10, 1_500)
    case 'relevantBackground':
      return stringIssue(field, value, 10, 2_000)
    case 'timeline':
      return stringIssue(field, value, 2, 200)
    case 'preferredResponseMethod':
      return enumIssue(field, value, RESPONSE_METHOD_SET)
    case 'requestedNextStep':
      return enumIssue(field, value, NEXT_STEP_SET)
    case 'phone': {
      const issue = stringIssue(field, value, 7, 40)
      if (issue) return issue
      return PHONE_PATTERN.test((value as string).trim())
        ? null
        : {
            field,
            code: 'format',
            message: 'phone contains unsupported characters.',
          }
    }
    case 'budgetOrConstraints':
      return stringIssue(field, value, 1, 500)
    case 'organization':
      return stringIssue(field, value, 1, 160)
    case 'additionalContext':
      return stringIssue(field, value, 1, 2_000)
  }
}

function normalizedValue(value: unknown): string {
  return (value as string).trim()
}

/** Atomically validates a complete assistant-proposed replacement. */
export function validateAgentDraftInput(
  input: unknown,
  authorizations: OptionalDisclosureAuthorizations,
): AgentDraftValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      kind: 'invalid',
      fields: [],
      issues: [
        {
          field: '$',
          code: 'type',
          message: 'The inquiry draft must be an object.',
        },
      ],
    }
  }

  const unknownFields = Object.keys(input).filter(
    (field) => !FIELD_NAME_SET.has(field),
  )
  if (unknownFields.length > 0) {
    return {
      ok: false,
      kind: 'unknown',
      fields: unknownFields,
      issues: [],
    }
  }

  const unauthorizedFields = Object.keys(input).filter(
    (field): field is OptionalFieldName =>
      OPTIONAL_FIELD_SET.has(field) &&
      !authorizations[field as OptionalFieldName],
  )
  if (unauthorizedFields.length > 0) {
    return {
      ok: false,
      kind: 'unauthorized',
      fields: unauthorizedFields,
      issues: [],
    }
  }

  const issues: ValidationIssue[] = REQUIRED_FIELD_NAMES.filter(
    (field) => !Object.prototype.hasOwnProperty.call(input, field),
  ).map((field) => ({
    field,
    code: 'missing',
    message: `${field} is required.`,
  }))

  for (const field of knownFieldNames(input)) {
    const issue = validateField(field, input[field])
    if (issue) issues.push(issue)
  }

  if (issues.length > 0) {
    return {
      ok: false,
      kind: 'invalid',
      fields: [...new Set(issues.map((issue) => issue.field))],
      issues,
    }
  }

  const suppliedFields = knownFieldNames(input)
  const draft = Object.fromEntries(
    suppliedFields.map((field) => [field, normalizedValue(input[field])]),
  ) as unknown as InquirySnapshot

  return { ok: true, draft, suppliedFields }
}

/** Revalidates the complete draft at review and execution boundaries. */
export function validateCompleteDraft(
  draft: InquiryDraft,
): CompleteDraftValidation {
  const issues: ValidationIssue[] = []

  for (const field of REQUIRED_FIELD_NAMES) {
    if (draft[field] === undefined) {
      issues.push({
        field,
        code: 'missing',
        message: `${field} is required.`,
      })
    }
  }

  for (const field of INTAKE_FIELD_NAMES) {
    const value = draft[field]
    if (value === undefined) continue
    const issue = validateField(field, value)
    if (issue) issues.push(issue)
  }

  if (issues.length > 0) return { valid: false, issues }

  const normalizedDraft = Object.fromEntries(
    INTAKE_FIELD_NAMES.flatMap((field) => {
      const value = draft[field]
      return value === undefined ? [] : [[field, normalizedValue(value)]]
    }),
  ) as unknown as InquirySnapshot

  return { valid: true, normalizedDraft, issues: [] }
}

/** Human edits may be incomplete, but the patch itself is atomic and bounded. */
export function validateHumanDraftPatch(
  input: unknown,
): HumanPatchValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      kind: 'invalid',
      fields: [],
      issues: [
        {
          field: '$',
          code: 'type',
          message: 'The inquiry update must be an object.',
        },
      ],
    }
  }

  const unknownFields = Object.keys(input).filter(
    (field) => !FIELD_NAME_SET.has(field),
  )
  if (unknownFields.length > 0) {
    return {
      ok: false,
      kind: 'unknown',
      fields: unknownFields,
      issues: [],
    }
  }

  const suppliedFields = knownFieldNames(input)
  const issues: ValidationIssue[] = []
  const patch: InquiryDraft = {}

  for (const field of suppliedFields) {
    const value = input[field]
    if (value === undefined || value === '') {
      patch[field] = undefined
      continue
    }

    if (typeof value !== 'string') {
      issues.push({
        field,
        code: 'type',
        message: `${field} must be a string.`,
      })
    } else if (value.length > 4_000) {
      issues.push({
        field,
        code: 'range',
        message: `${field} is too long to store in this demonstration.`,
      })
    } else {
      patch[field] = value as never
    }
  }

  return issues.length > 0
    ? {
        ok: false,
        kind: 'invalid',
        fields: [...new Set(issues.map((issue) => issue.field))],
        issues,
      }
    : { ok: true, patch, suppliedFields }
}

export function isIntakeFieldName(value: string): value is IntakeFieldName {
  return FIELD_NAME_SET.has(value)
}

export function isOptionalFieldName(value: string): value is OptionalFieldName {
  return OPTIONAL_FIELD_SET.has(value)
}

export function isContactPermissionName(
  value: string,
): value is ContactPermissionName {
  return CONTACT_PERMISSION_SET.has(value)
}
