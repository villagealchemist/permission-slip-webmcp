import {
  INTAKE_FIELD_NAMES,
  OPTIONAL_FIELD_NAMES,
  REQUIRED_FIELD_NAMES,
  type DisclosureSnapshot,
  type IntakeDraft,
  type IntakeFieldName,
  type OptionalDisclosureAuthorizations,
  type OptionalFieldName,
  type ValidationIssue,
} from './types'

const FIELD_NAME_SET = new Set<string>(INTAKE_FIELD_NAMES)
const OPTIONAL_FIELD_SET = new Set<string>(OPTIONAL_FIELD_NAMES)
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9+().\-\s]{7,40}$/

/** Fully normalized agent proposal accepted as one atomic replacement. */
export interface AgentDraftValidationSuccess {
  ok: true
  draft: DisclosureSnapshot
  suppliedFields: IntakeFieldName[]
}

/** Rejection classification used to distinguish consent from shape failures. */
export interface AgentDraftValidationFailure {
  ok: false
  kind: 'invalid' | 'unauthorized' | 'unknown'
  fields: string[]
  issues: ValidationIssue[]
}

/** Agent validation never returns a partially accepted draft. */
export type AgentDraftValidation =
  | AgentDraftValidationSuccess
  | AgentDraftValidationFailure

/** Completeness result used at both review creation and submission revalidation. */
export interface CompleteDraftValidation {
  valid: boolean
  normalizedDraft?: DisclosureSnapshot
  issues: ValidationIssue[]
}

/** Type-safe incremental patch accepted from the human form. */
export interface HumanPatchValidationSuccess {
  ok: true
  patch: IntakeDraft
  suppliedFields: IntakeFieldName[]
}

/** Human patch rejection leaves the existing draft untouched. */
export interface HumanPatchValidationFailure {
  ok: false
  kind: 'invalid' | 'unknown'
  fields: string[]
  issues: ValidationIssue[]
}

/** Human edits may be partial, but each supplied property is accepted atomically. */
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

function validateDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  )
}

function stringIssue(
  field: IntakeFieldName,
  value: unknown,
  minimum: number,
  maximum: number,
): ValidationIssue | null {
  if (typeof value !== 'string') {
    return {
      field,
      code: 'type',
      message: `${field} must be a string.`,
    }
  }

  const length = value.trim().length
  if (length < minimum || length > maximum) {
    return {
      field,
      code: 'range',
      message: `${field} must contain between ${minimum} and ${maximum} characters.`,
    }
  }

  return null
}

function validateField(field: IntakeFieldName, value: unknown): ValidationIssue | null {
  switch (field) {
    case 'contactName':
      return stringIssue(field, value, 2, 100)
    case 'email': {
      const issue = stringIssue(field, value, 3, 254)
      if (issue) return issue
      return EMAIL_PATTERN.test((value as string).trim())
        ? null
        : { field, code: 'format', message: 'email must be a valid email address.' }
    }
    case 'eventType':
      return stringIssue(field, value, 3, 160)
    case 'preferredDate': {
      const issue = stringIssue(field, value, 10, 10)
      if (issue) return issue
      return validateDate((value as string).trim())
        ? null
        : { field, code: 'format', message: 'preferredDate must use a valid YYYY-MM-DD date.' }
    }
    case 'estimatedAttendeeCount':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        return {
          field,
          code: 'type',
          message: 'estimatedAttendeeCount must be a whole number.',
        }
      }
      return value >= 1 && value <= 1_000
        ? null
        : {
            field,
            code: 'range',
            message: 'estimatedAttendeeCount must be between 1 and 1,000.',
          }
    case 'eventGoal':
      return stringIssue(field, value, 10, 1_000)
    case 'phone': {
      const issue = stringIssue(field, value, 7, 40)
      if (issue) return issue
      return PHONE_PATTERN.test((value as string).trim())
        ? null
        : { field, code: 'format', message: 'phone contains unsupported characters.' }
    }
    case 'budgetRange':
      return stringIssue(field, value, 1, 120)
    case 'socialHandle':
      return stringIssue(field, value, 1, 100)
    case 'additionalNotes':
      return stringIssue(field, value, 1, 2_000)
  }
}

function normalizedValue(field: IntakeFieldName, value: unknown): string | number {
  return field === 'estimatedAttendeeCount'
    ? (value as number)
    : (value as string).trim()
}

/**
 * Validates an agent's complete replacement before any state mutation. Unknown
 * or unauthorized optional fields reject the entire proposal so a caller
 * cannot turn a consent violation into a silently accepted subset.
 */
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
          message: 'The draft input must be an object.',
        },
      ],
    }
  }

  const unknownFields = Object.keys(input).filter((field) => !FIELD_NAME_SET.has(field))
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
      OPTIONAL_FIELD_SET.has(field) && !authorizations[field as OptionalFieldName],
  )
  if (unauthorizedFields.length > 0) {
    return {
      ok: false,
      kind: 'unauthorized',
      fields: unauthorizedFields,
      issues: [],
    }
  }

  const missingFields = REQUIRED_FIELD_NAMES.filter(
    (field) => !Object.prototype.hasOwnProperty.call(input, field),
  )
  const issues: ValidationIssue[] = missingFields.map((field) => ({
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

  const draft = Object.fromEntries(
    knownFieldNames(input).map((field) => [field, normalizedValue(field, input[field])]),
  ) as unknown as DisclosureSnapshot

  return {
    ok: true,
    draft,
    suppliedFields: knownFieldNames(input),
  }
}

/**
 * Revalidates and normalizes the whole draft at trust boundaries. This keeps a
 * persisted or incrementally edited value from bypassing review requirements.
 */
export function validateCompleteDraft(draft: IntakeDraft): CompleteDraftValidation {
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

  if (issues.length > 0) {
    return { valid: false, issues }
  }

  const normalizedDraft = Object.fromEntries(
    INTAKE_FIELD_NAMES.flatMap((field) => {
      const value = draft[field]
      return value === undefined ? [] : [[field, normalizedValue(field, value)]]
    }),
  ) as unknown as DisclosureSnapshot

  return { valid: true, normalizedDraft, issues: [] }
}

/**
 * Validates human editing types while allowing temporary incompleteness; an
 * empty or undefined supplied value intentionally clears that field.
 */
export function validateHumanDraftPatch(input: unknown): HumanPatchValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      kind: 'invalid',
      fields: [],
      issues: [
        {
          field: '$',
          code: 'type',
          message: 'The draft update must be an object.',
        },
      ],
    }
  }

  const unknownFields = Object.keys(input).filter((field) => !FIELD_NAME_SET.has(field))
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
  const patch: IntakeDraft = {}

  for (const field of suppliedFields) {
    const value = input[field]
    if (value === undefined || value === '') {
      patch[field] = undefined
      continue
    }

    if (field === 'estimatedAttendeeCount') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({
          field,
          code: 'type',
          message: 'estimatedAttendeeCount must be a number while editing.',
        })
      } else {
        patch[field] = value
      }
      continue
    }

    if (typeof value !== 'string') {
      issues.push({ field, code: 'type', message: `${field} must be a string.` })
    } else if (value.length > 4_000) {
      issues.push({
        field,
        code: 'range',
        message: `${field} is too long to store in this demonstration.`,
      })
    } else {
      patch[field] = value
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

/** Runtime guard for values crossing storage and tool boundaries. */
export function isIntakeFieldName(value: string): value is IntakeFieldName {
  return FIELD_NAME_SET.has(value)
}

/** Runtime guard for fields governed by explicit disclosure authorization. */
export function isOptionalFieldName(value: string): value is OptionalFieldName {
  return OPTIONAL_FIELD_SET.has(value)
}
