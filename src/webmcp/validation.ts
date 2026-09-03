import {
  OPTIONAL_INTAKE_FIELDS,
  REQUIRED_INTAKE_FIELDS,
  type DraftIntakeInput,
  type GetDisclosureReceiptInput,
  type JsonObject,
  type SubmitApprovedIntakeInput,
  type ToolFailure,
} from './types'

export interface ValidationIssue {
  path: string
  code:
    | 'invalid_type'
    | 'missing_property'
    | 'unknown_property'
    | 'invalid_format'
    | 'out_of_range'
  message: string
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] }

const draftFields = new Set<string>([
  ...REQUIRED_INTAKE_FIELDS,
  ...OPTIONAL_INTAKE_FIELDS,
])

const identifierPattern = /^[A-Za-z0-9._-]+$/
const phonePattern = /^[0-9+().\-\s]+$/
const simpleEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objectOrIssue(input: unknown): ValidationResult<Record<string, unknown>> {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path: '$',
          code: 'invalid_type',
          message: 'Input must be a JSON object.',
        },
      ],
    }
  }

  return { ok: true, value: input }
}

function unknownPropertyIssues(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): ValidationIssue[] {
  return Object.keys(input)
    .filter((key) => !allowed.has(key))
    .map((key) => ({
      path: key,
      code: 'unknown_property' as const,
      message: `Property "${key}" is not allowed.`,
    }))
}

function validateString(
  input: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  options: {
    required?: boolean
    minLength?: number
    maxLength: number
    pattern?: RegExp
    formatMessage?: string
  },
): void {
  const value = input[key]

  if (value === undefined) {
    if (options.required) {
      issues.push({
        path: key,
        code: 'missing_property',
        message: `Property "${key}" is required.`,
      })
    }
    return
  }

  if (typeof value !== 'string') {
    issues.push({
      path: key,
      code: 'invalid_type',
      message: `Property "${key}" must be a string.`,
    })
    return
  }

  const minimum = options.minLength ?? 1
  const normalizedValue = value.trim()
  if (
    normalizedValue.length < minimum ||
    normalizedValue.length > options.maxLength
  ) {
    issues.push({
      path: key,
      code: 'out_of_range',
      message: `Property "${key}" must contain ${minimum}-${options.maxLength} characters.`,
    })
  }

  if (options.pattern && !options.pattern.test(normalizedValue)) {
    issues.push({
      path: key,
      code: 'invalid_format',
      message:
        options.formatMessage ?? `Property "${key}" has an invalid format.`,
    })
  }
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function validateEmptyObject(input: unknown): ValidationResult<JsonObject> {
  const objectResult = objectOrIssue(input)
  if (!objectResult.ok) return objectResult

  const issues = unknownPropertyIssues(objectResult.value, new Set())
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: {} }
}

export function validateDraftIntake(
  input: unknown,
): ValidationResult<DraftIntakeInput> {
  const objectResult = objectOrIssue(input)
  if (!objectResult.ok) return objectResult

  const value = objectResult.value
  const issues = unknownPropertyIssues(value, draftFields)

  validateString(value, 'contactName', issues, {
    required: true,
    minLength: 2,
    maxLength: 100,
  })
  validateString(value, 'email', issues, {
    required: true,
    minLength: 3,
    maxLength: 254,
    pattern: simpleEmailPattern,
    formatMessage: 'Property "email" must be a plausible email address.',
  })
  validateString(value, 'eventType', issues, {
    required: true,
    minLength: 3,
    maxLength: 160,
  })
  validateString(value, 'preferredDate', issues, {
    required: true,
    maxLength: 10,
  })
  if (
    typeof value.preferredDate === 'string' &&
    !isIsoCalendarDate(value.preferredDate.trim())
  ) {
    issues.push({
      path: 'preferredDate',
      code: 'invalid_format',
      message: 'Property "preferredDate" must be a real date in YYYY-MM-DD format.',
    })
  }
  validateString(value, 'eventGoal', issues, {
    required: true,
    minLength: 10,
    maxLength: 1_000,
  })

  if (value.estimatedAttendeeCount === undefined) {
    issues.push({
      path: 'estimatedAttendeeCount',
      code: 'missing_property',
      message: 'Property "estimatedAttendeeCount" is required.',
    })
  } else if (!Number.isInteger(value.estimatedAttendeeCount)) {
    issues.push({
      path: 'estimatedAttendeeCount',
      code: 'invalid_type',
      message: 'Property "estimatedAttendeeCount" must be an integer.',
    })
  } else if (
    (value.estimatedAttendeeCount as number) < 1 ||
    (value.estimatedAttendeeCount as number) > 1_000
  ) {
    issues.push({
      path: 'estimatedAttendeeCount',
      code: 'out_of_range',
      message: 'Property "estimatedAttendeeCount" must be between 1 and 1,000.',
    })
  }

  validateString(value, 'phone', issues, {
    minLength: 7,
    maxLength: 40,
    pattern: phonePattern,
    formatMessage:
      'Property "phone" may contain digits, spaces, parentheses, periods, plus signs, and hyphens.',
  })
  validateString(value, 'budgetRange', issues, { maxLength: 120 })
  validateString(value, 'socialHandle', issues, { maxLength: 100 })
  validateString(value, 'additionalNotes', issues, { maxLength: 2_000 })

  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, value: value as unknown as DraftIntakeInput }
}

function validateIdentifier(
  input: Record<string, unknown>,
  key: 'reviewId' | 'receiptId',
  required: boolean,
  issues: ValidationIssue[],
): void {
  validateString(input, key, issues, {
    required,
    maxLength: 128,
    pattern: identifierPattern,
    formatMessage: `Property "${key}" must use only letters, numbers, periods, underscores, and hyphens.`,
  })

  const value = input[key]
  if (typeof value === 'string' && value !== value.trim()) {
    issues.push({
      path: key,
      code: 'invalid_format',
      message: `Property "${key}" must not contain leading or trailing whitespace.`,
    })
  }
}

export function validateSubmitApprovedIntake(
  input: unknown,
): ValidationResult<SubmitApprovedIntakeInput> {
  const objectResult = objectOrIssue(input)
  if (!objectResult.ok) return objectResult
  const issues = unknownPropertyIssues(
    objectResult.value,
    new Set(['reviewId']),
  )
  validateIdentifier(objectResult.value, 'reviewId', true, issues)
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        value: { reviewId: objectResult.value.reviewId as string },
      }
}

export function validateGetDisclosureReceipt(
  input: unknown,
): ValidationResult<GetDisclosureReceiptInput> {
  const objectResult = objectOrIssue(input)
  if (!objectResult.ok) return objectResult
  const issues = unknownPropertyIssues(
    objectResult.value,
    new Set(['receiptId']),
  )
  validateIdentifier(objectResult.value, 'receiptId', false, issues)
  return issues.length > 0
    ? { ok: false, issues }
    : objectResult.value.receiptId === undefined
      ? { ok: true, value: {} }
      : {
          ok: true,
          value: { receiptId: objectResult.value.receiptId as string },
        }
}

export function invalidInputFailure(issues: ValidationIssue[]): ToolFailure {
  return {
    ok: false,
    error: {
      code: 'INVALID_INPUT',
      message:
        'The tool input did not match its contract. Correct every listed issue and retry the complete call.',
      retryable: true,
      details: {
        issues: issues.map((issue) => ({ ...issue })),
      },
    },
  }
}
