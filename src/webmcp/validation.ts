import { SECOND_SURFACE_TOOL_NAMES } from '../contracts'
import type {
  GetToolContractInput,
  JsonObject,
  ProposeContractRevisionInput,
  SecondSurfaceToolName,
  ToolFailure,
} from './types'

export interface ValidationIssue {
  path: string
  code:
    | 'invalid_type'
    | 'missing_property'
    | 'unknown_property'
    | 'invalid_value'
    | 'out_of_range'
  message: string
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] }

const TOOL_NAMES = new Set<string>(SECOND_SURFACE_TOOL_NAMES)
const PROPOSAL_FIELDS = new Set([
  'toolName',
  'baseRevision',
  'rationale',
  'changes',
])
const CHANGE_FIELDS = new Set([
  'title',
  'summary',
  'description',
  'outputSchema',
  'annotations',
  'sideEffect',
  'examples',
  'errors',
  'states',
  'prerequisites',
  'privacy',
])
const ANNOTATION_FIELDS = new Set([
  'readOnlyHint',
  'untrustedContentHint',
])
const EXAMPLE_FIELDS = new Set(['title', 'description', 'input', 'output'])
const ERROR_FIELDS = new Set(['code', 'summary', 'recovery'])
const PRIVACY_FIELDS = new Set(['outputSource', 'note'])
const SIDE_EFFECTS = new Set([
  'none',
  'populates-audit-panel',
  'stages-revision',
  'opens-artifact-preview',
])
const OUTPUT_SOURCES = new Set(['system', 'developer', 'external'])

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function childPath(parent: string, key: string): string {
  return parent === '$' ? key : `${parent}.${key}`
}

function objectOrIssue(
  input: unknown,
  path = '$',
): ValidationResult<Record<string, unknown>> {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          path,
          code: 'invalid_type',
          message: `${path === '$' ? 'Input' : `Property "${path}"`} must be a JSON object.`,
        },
      ],
    }
  }
  return { ok: true, value: input }
}

function unknownPropertyIssues(
  input: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path = '$',
): ValidationIssue[] {
  return Object.keys(input)
    .filter((key) => !allowed.has(key))
    .map((key) => ({
      path: childPath(path, key),
      code: 'unknown_property' as const,
      message: `Property "${childPath(path, key)}" is not allowed.`,
    }))
}

function requireProperty(
  input: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  path = '$',
): boolean {
  if (Object.hasOwn(input, key)) return true
  issues.push({
    path: childPath(path, key),
    code: 'missing_property',
    message: `Property "${childPath(path, key)}" is required.`,
  })
  return false
}

function validateStringValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options: { minLength?: number; maxLength?: number } = {},
): value is string {
  if (typeof value !== 'string') {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must be a string.`,
    })
    return false
  }

  const minimum = options.minLength ?? 1
  const maximum = options.maxLength ?? 4_000
  const length = value.trim().length
  if (length < minimum || length > maximum) {
    issues.push({
      path,
      code: 'out_of_range',
      message: `Property "${path}" must contain ${minimum}-${maximum} characters.`,
    })
    return false
  }
  return true
}

function validateToolName(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is SecondSurfaceToolName {
  if (!validateStringValue(value, path, issues, { maxLength: 128 })) {
    return false
  }
  if (!TOOL_NAMES.has(value)) {
    issues.push({
      path,
      code: 'invalid_value',
      message: `Property "${path}" must name one of the five registered Second Surface tools.`,
    })
    return false
  }
  return true
}

function validateJsonValue(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  ancestors = new WeakSet<object>(),
  depth = 0,
): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issues.push({
        path,
        code: 'invalid_value',
        message: `Property "${path}" must contain a finite JSON number.`,
      })
    }
    return
  }
  if (depth >= 32) {
    issues.push({
      path,
      code: 'out_of_range',
      message: `Property "${path}" exceeds the maximum JSON nesting depth.`,
    })
    return
  }
  if (typeof value !== 'object' || value === undefined) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must contain only JSON values.`,
    })
    return
  }
  if (ancestors.has(value)) {
    issues.push({
      path,
      code: 'invalid_value',
      message: `Property "${path}" must not contain a circular reference.`,
    })
    return
  }

  ancestors.add(value)
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateJsonValue(item, `${path}[${index}]`, issues, ancestors, depth + 1),
    )
    ancestors.delete(value)
    return
  }
  if (!isRecord(value)) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must contain only plain JSON objects.`,
    })
    ancestors.delete(value)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    validateJsonValue(
      child,
      childPath(path, key),
      issues,
      ancestors,
      depth + 1,
    )
  }
  ancestors.delete(value)
}

const JSON_SCHEMA_TYPES = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
])

const JSON_SCHEMA_FIELDS = new Set([
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'description',
  'enum',
  'items',
  'maximum',
  'maxItems',
  'maxLength',
  'minimum',
  'minItems',
  'minLength',
  'oneOf',
  'pattern',
  'properties',
  'required',
  'type',
  'uniqueItems',
])

function jsonIdentity(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => jsonIdentity(item)).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${jsonIdentity(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? `${typeof value}:${String(value)}`
}

function validateFiniteNumberKeyword(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is number {
  if (typeof value === 'number' && Number.isFinite(value)) return true
  issues.push({
    path,
    code: 'invalid_type',
    message: `Property "${path}" must be a finite number.`,
  })
  return false
}

function validateNonNegativeIntegerKeyword(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is number {
  if (Number.isInteger(value) && Number(value) >= 0) return true
  issues.push({
    path,
    code: 'invalid_type',
    message: `Property "${path}" must be a non-negative integer.`,
  })
  return false
}

function validateJsonSchema(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  ancestors = new WeakSet<object>(),
  depth = 0,
): void {
  if (!isRecord(value)) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must be a JSON Schema object.`,
    })
    return
  }
  if (depth >= 32) {
    issues.push({
      path,
      code: 'out_of_range',
      message: `Property "${path}" exceeds the maximum schema nesting depth.`,
    })
    return
  }
  if (ancestors.has(value)) {
    issues.push({
      path,
      code: 'invalid_value',
      message: `Property "${path}" must not contain a circular schema reference.`,
    })
    return
  }
  ancestors.add(value)
  validateJsonValue(value, path, issues)
  issues.push(...unknownPropertyIssues(value, JSON_SCHEMA_FIELDS, path))

  if (Object.hasOwn(value, 'type')) {
    if (typeof value.type !== 'string') {
      issues.push({
        path: childPath(path, 'type'),
        code: 'invalid_type',
        message: `Property "${childPath(path, 'type')}" must be a string.`,
      })
    } else if (!JSON_SCHEMA_TYPES.has(value.type)) {
      issues.push({
        path: childPath(path, 'type'),
        code: 'invalid_value',
        message: `Property "${childPath(path, 'type')}" has an unsupported JSON Schema type.`,
      })
    }
  }

  if (
    Object.hasOwn(value, 'description') &&
    typeof value.description !== 'string'
  ) {
    issues.push({
      path: childPath(path, 'description'),
      code: 'invalid_type',
      message: `Property "${childPath(path, 'description')}" must be a string.`,
    })
  }

  if (Object.hasOwn(value, 'pattern')) {
    issues.push({
      path: childPath(path, 'pattern'),
      code: 'invalid_value',
      message:
        'Agent-authored pattern schemas are not accepted because they would require executing untrusted regular expressions.',
    })
  }

  if (Object.hasOwn(value, 'enum')) {
    if (!Array.isArray(value.enum)) {
      issues.push({
        path: childPath(path, 'enum'),
        code: 'invalid_type',
        message: `Property "${childPath(path, 'enum')}" must be a non-empty array of unique JSON values.`,
      })
    } else if (value.enum.length === 0) {
      issues.push({
        path: childPath(path, 'enum'),
        code: 'out_of_range',
        message: `Property "${childPath(path, 'enum')}" must not be empty.`,
      })
    } else {
      const identities = value.enum.map((entry) => jsonIdentity(entry))
      if (new Set(identities).size !== identities.length) {
        issues.push({
          path: childPath(path, 'enum'),
          code: 'invalid_value',
          message: `Property "${childPath(path, 'enum')}" must contain unique JSON values.`,
        })
      }
    }
  }

  let minimum: number | undefined
  let maximum: number | undefined
  if (
    Object.hasOwn(value, 'minimum') &&
    validateFiniteNumberKeyword(
      value.minimum,
      childPath(path, 'minimum'),
      issues,
    )
  ) {
    minimum = value.minimum
  }
  if (
    Object.hasOwn(value, 'maximum') &&
    validateFiniteNumberKeyword(
      value.maximum,
      childPath(path, 'maximum'),
      issues,
    )
  ) {
    maximum = value.maximum
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    issues.push({
      path,
      code: 'invalid_value',
      message: `Property "${path}" must not set minimum above maximum.`,
    })
  }

  for (const [minimumKey, maximumKey] of [
    ['minLength', 'maxLength'],
    ['minItems', 'maxItems'],
  ] as const) {
    let minimumValue: number | undefined
    let maximumValue: number | undefined
    if (
      Object.hasOwn(value, minimumKey) &&
      validateNonNegativeIntegerKeyword(
        value[minimumKey],
        childPath(path, minimumKey),
        issues,
      )
    ) {
      minimumValue = value[minimumKey] as number
    }
    if (
      Object.hasOwn(value, maximumKey) &&
      validateNonNegativeIntegerKeyword(
        value[maximumKey],
        childPath(path, maximumKey),
        issues,
      )
    ) {
      maximumValue = value[maximumKey] as number
    }
    if (
      minimumValue !== undefined &&
      maximumValue !== undefined &&
      minimumValue > maximumValue
    ) {
      issues.push({
        path,
        code: 'invalid_value',
        message: `Property "${path}" must not set ${minimumKey} above ${maximumKey}.`,
      })
    }
  }

  if (
    Object.hasOwn(value, 'uniqueItems') &&
    typeof value.uniqueItems !== 'boolean'
  ) {
    issues.push({
      path: childPath(path, 'uniqueItems'),
      code: 'invalid_type',
      message: `Property "${childPath(path, 'uniqueItems')}" must be a boolean.`,
    })
  }

  if (Object.hasOwn(value, 'properties')) {
    if (!isRecord(value.properties)) {
      issues.push({
        path: childPath(path, 'properties'),
        code: 'invalid_type',
        message: `Property "${childPath(path, 'properties')}" must be an object of schemas.`,
      })
    } else {
      for (const [key, schema] of Object.entries(value.properties)) {
        validateJsonSchema(
          schema,
          childPath(childPath(path, 'properties'), key),
          issues,
          ancestors,
          depth + 1,
        )
      }
    }
  }
  if (
    Object.hasOwn(value, 'required') &&
    (!Array.isArray(value.required) ||
      !value.required.every((entry) => typeof entry === 'string'))
  ) {
    issues.push({
      path: childPath(path, 'required'),
      code: 'invalid_type',
      message: `Property "${childPath(path, 'required')}" must be an array of strings.`,
    })
  } else if (
    Array.isArray(value.required) &&
    new Set(value.required).size !== value.required.length
  ) {
    issues.push({
      path: childPath(path, 'required'),
      code: 'invalid_value',
      message: `Property "${childPath(path, 'required')}" must contain unique property names.`,
    })
  }
  if (Object.hasOwn(value, 'items')) {
    validateJsonSchema(
      value.items,
      childPath(path, 'items'),
      issues,
      ancestors,
      depth + 1,
    )
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const schemas = value[keyword]
    if (!Object.hasOwn(value, keyword)) continue
    if (!Array.isArray(schemas)) {
      issues.push({
        path: childPath(path, keyword),
        code: 'invalid_type',
        message: `Property "${childPath(path, keyword)}" must be an array of schemas.`,
      })
      continue
    }
    if (schemas.length === 0) {
      issues.push({
        path: childPath(path, keyword),
        code: 'out_of_range',
        message: `Property "${childPath(path, keyword)}" must contain at least one schema.`,
      })
      continue
    }
    schemas.forEach((schema, index) =>
      validateJsonSchema(
        schema,
        `${childPath(path, keyword)}[${index}]`,
        issues,
        ancestors,
        depth + 1,
      ),
    )
  }
  if (
    Object.hasOwn(value, 'additionalProperties') &&
    typeof value.additionalProperties !== 'boolean'
  ) {
    validateJsonSchema(
      value.additionalProperties,
      childPath(path, 'additionalProperties'),
      issues,
      ancestors,
      depth + 1,
    )
  }
  ancestors.delete(value)
}

function validateAnnotations(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must be an object.`,
    })
    return
  }
  issues.push(...unknownPropertyIssues(value, ANNOTATION_FIELDS, path))
  for (const field of ANNOTATION_FIELDS) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      issues.push({
        path: childPath(path, field),
        code: 'invalid_type',
        message: `Property "${childPath(path, field)}" must be a boolean.`,
      })
    }
  }
}

function validateExamples(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must be an array.`,
    })
    return
  }
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      issues.push({
        path: itemPath,
        code: 'invalid_type',
        message: `Property "${itemPath}" must be an object.`,
      })
      return
    }
    issues.push(...unknownPropertyIssues(item, EXAMPLE_FIELDS, itemPath))
    for (const field of ['title', 'input', 'output']) {
      requireProperty(item, field, issues, itemPath)
    }
    if (item.title !== undefined) {
      validateStringValue(item.title, childPath(itemPath, 'title'), issues, {
        maxLength: 200,
      })
    }
    if (item.description !== undefined) {
      validateStringValue(
        item.description,
        childPath(itemPath, 'description'),
        issues,
        { maxLength: 2_000 },
      )
    }
    if (item.input !== undefined) {
      validateJsonValue(item.input, childPath(itemPath, 'input'), issues)
    }
    if (item.output !== undefined) {
      validateJsonValue(item.output, childPath(itemPath, 'output'), issues)
    }
  })
}

function validateErrors(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must be an array.`,
    })
    return
  }
  const codes = new Set<string>()
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      issues.push({
        path: itemPath,
        code: 'invalid_type',
        message: `Property "${itemPath}" must be an object.`,
      })
      return
    }
    issues.push(...unknownPropertyIssues(item, ERROR_FIELDS, itemPath))
    requireProperty(item, 'code', issues, itemPath)
    requireProperty(item, 'summary', issues, itemPath)
    if (
      item.code !== undefined &&
      validateStringValue(item.code, childPath(itemPath, 'code'), issues, {
        maxLength: 128,
      })
    ) {
      if (codes.has(item.code)) {
        issues.push({
          path: childPath(itemPath, 'code'),
          code: 'invalid_value',
          message: `Property "${path}" must not contain duplicate error codes.`,
        })
      }
      codes.add(item.code)
    }
    if (item.summary !== undefined) {
      validateStringValue(item.summary, childPath(itemPath, 'summary'), issues, {
        maxLength: 1_000,
      })
    }
    if (item.recovery !== undefined) {
      validateStringValue(
        item.recovery,
        childPath(itemPath, 'recovery'),
        issues,
        { maxLength: 2_000 },
      )
    }
  })
}

function validateStringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must be an array.`,
    })
    return
  }
  const seen = new Set<string>()
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (validateStringValue(item, itemPath, issues, { maxLength: 500 })) {
      if (seen.has(item)) {
        issues.push({
          path: itemPath,
          code: 'invalid_value',
          message: `Property "${path}" must not contain duplicate values.`,
        })
      }
      seen.add(item)
    }
  })
}

function validatePrivacy(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must be an object.`,
    })
    return
  }
  issues.push(...unknownPropertyIssues(value, PRIVACY_FIELDS, path))
  requireProperty(value, 'outputSource', issues, path)
  requireProperty(value, 'note', issues, path)
  if (
    value.outputSource !== undefined &&
    validateStringValue(
      value.outputSource,
      childPath(path, 'outputSource'),
      issues,
      { maxLength: 20 },
    ) &&
    !OUTPUT_SOURCES.has(value.outputSource)
  ) {
    issues.push({
      path: childPath(path, 'outputSource'),
      code: 'invalid_value',
      message: `Property "${childPath(path, 'outputSource')}" must be system, developer, or external.`,
    })
  }
  if (value.note !== undefined) {
    validateStringValue(value.note, childPath(path, 'note'), issues, {
      maxLength: 2_000,
    })
  }
}

function validateChanges(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({
      path,
      code: 'invalid_type',
      message: `Property "${path}" must be an object.`,
    })
    return
  }
  issues.push(...unknownPropertyIssues(value, CHANGE_FIELDS, path))
  if (!Object.keys(value).some((key) => CHANGE_FIELDS.has(key))) {
    issues.push({
      path,
      code: 'missing_property',
      message: `Property "${path}" must include at least one allowed contract change.`,
    })
  }

  if (value.title !== undefined) {
    validateStringValue(value.title, childPath(path, 'title'), issues, {
      maxLength: 200,
    })
  }
  if (value.summary !== undefined) {
    validateStringValue(value.summary, childPath(path, 'summary'), issues, {
      maxLength: 1_000,
    })
  }
  if (value.description !== undefined) {
    validateStringValue(value.description, childPath(path, 'description'), issues, {
      minLength: 0,
      maxLength: 4_000,
    })
  }
  if (value.outputSchema !== undefined) {
    validateJsonSchema(
      value.outputSchema,
      childPath(path, 'outputSchema'),
      issues,
    )
  }
  if (value.annotations !== undefined) {
    validateAnnotations(value.annotations, childPath(path, 'annotations'), issues)
  }
  if (
    value.sideEffect !== undefined &&
    validateStringValue(value.sideEffect, childPath(path, 'sideEffect'), issues, {
      maxLength: 64,
    }) &&
    !SIDE_EFFECTS.has(value.sideEffect)
  ) {
    issues.push({
      path: childPath(path, 'sideEffect'),
      code: 'invalid_value',
      message: `Property "${childPath(path, 'sideEffect')}" has an unsupported side-effect class.`,
    })
  }
  if (value.examples !== undefined) {
    validateExamples(value.examples, childPath(path, 'examples'), issues)
  }
  if (value.errors !== undefined) {
    validateErrors(value.errors, childPath(path, 'errors'), issues)
  }
  if (value.states !== undefined) {
    validateStringArray(value.states, childPath(path, 'states'), issues)
  }
  if (value.prerequisites !== undefined) {
    validateStringArray(
      value.prerequisites,
      childPath(path, 'prerequisites'),
      issues,
    )
  }
  if (value.privacy !== undefined) {
    validatePrivacy(value.privacy, childPath(path, 'privacy'), issues)
  }
}

export function validateEmptyObject(
  input: unknown,
): ValidationResult<JsonObject> {
  const objectResult = objectOrIssue(input)
  if (!objectResult.ok) return objectResult
  const issues = unknownPropertyIssues(objectResult.value, new Set())
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: {} }
}

export function validateGetToolContract(
  input: unknown,
): ValidationResult<GetToolContractInput> {
  const objectResult = objectOrIssue(input)
  if (!objectResult.ok) return objectResult
  const value = objectResult.value
  const issues = unknownPropertyIssues(value, new Set(['toolName']))
  validateJsonValue(value, '$', issues)
  requireProperty(value, 'toolName', issues)
  if (Object.hasOwn(value, 'toolName')) {
    validateToolName(value.toolName, 'toolName', issues)
  }
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        value: { toolName: value.toolName as SecondSurfaceToolName },
      }
}

export function validateProposeContractRevision(
  input: unknown,
): ValidationResult<ProposeContractRevisionInput> {
  const objectResult = objectOrIssue(input)
  if (!objectResult.ok) return objectResult
  const value = objectResult.value
  const issues = unknownPropertyIssues(value, PROPOSAL_FIELDS)
  validateJsonValue(value, '$', issues)
  for (const field of PROPOSAL_FIELDS) requireProperty(value, field, issues)
  if (Object.hasOwn(value, 'toolName')) {
    validateToolName(value.toolName, 'toolName', issues)
  }
  if (Object.hasOwn(value, 'baseRevision')) {
    if (!Number.isInteger(value.baseRevision)) {
      issues.push({
        path: 'baseRevision',
        code: 'invalid_type',
        message: 'Property "baseRevision" must be an integer.',
      })
    } else if ((value.baseRevision as number) < 1) {
      issues.push({
        path: 'baseRevision',
        code: 'out_of_range',
        message: 'Property "baseRevision" must be at least 1.',
      })
    }
  }
  if (Object.hasOwn(value, 'rationale')) {
    validateStringValue(value.rationale, 'rationale', issues, {
      minLength: 8,
      maxLength: 2_000,
    })
  }
  if (Object.hasOwn(value, 'changes')) {
    validateChanges(value.changes, 'changes', issues)
  }
  return issues.length > 0
    ? { ok: false, issues }
    : {
        ok: true,
        value: {
          toolName: value.toolName as SecondSurfaceToolName,
          baseRevision: value.baseRevision as number,
          rationale: value.rationale as string,
          changes: value.changes as ProposeContractRevisionInput['changes'],
        },
      }
}

export function invalidInputFailure(
  issues: ValidationIssue[],
): ToolFailure {
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
