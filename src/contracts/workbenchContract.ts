/** JSON-compatible values used by workbench contracts and generated artifacts. */
export type WorkbenchJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly WorkbenchJsonValue[]
  | { readonly [key: string]: WorkbenchJsonValue }

/** Deliberately small JSON Schema surface documented by Second Surface. */
export type WorkbenchJsonSchema = Readonly<
  Record<string, WorkbenchJsonValue>
>

/** Native registration hints currently understood by the target WebMCP surface. */
export interface WorkbenchContractAnnotations {
  readonly readOnlyHint?: boolean
  readonly untrustedContentHint?: boolean
}

/** Visible local effects produced by Second Surface's own five tools. */
export type WorkbenchSideEffect =
  | 'none'
  | 'populates-audit-panel'
  | 'stages-revision'
  | 'opens-artifact-preview'

/** One documented example checked against the declared input and output schemas. */
export interface WorkbenchContractExample {
  readonly title: string
  readonly description?: string
  readonly input: WorkbenchJsonValue
  readonly output: WorkbenchJsonValue
}

/** A recoverable failure documented by a workbench tool contract. */
export interface WorkbenchContractError {
  readonly code: string
  readonly summary: string
  readonly recovery?: string
}

/** Provenance note for content returned by the tool. */
export interface WorkbenchContractPrivacy {
  readonly outputSource: 'system' | 'developer' | 'external'
  readonly note: string
}

/**
 * Canonical documented contract for one of Second Surface's fixed executors.
 * A revision may change metadata, but never the executor-bound tool name.
 */
export interface WorkbenchToolContract<Name extends string = string> {
  readonly name: Name
  readonly title: string
  readonly summary: string
  readonly description: string
  readonly revision: number
  readonly inputSchema: WorkbenchJsonSchema
  readonly outputSchema: WorkbenchJsonSchema
  readonly annotations: WorkbenchContractAnnotations
  readonly sideEffect: WorkbenchSideEffect
  readonly examples: readonly WorkbenchContractExample[]
  readonly errors: readonly WorkbenchContractError[]
  readonly states: readonly string[]
  readonly prerequisites: readonly string[]
  readonly privacy: WorkbenchContractPrivacy
}

export type WorkbenchContractChanges = Partial<
  Pick<
    WorkbenchToolContract,
    | 'title'
    | 'summary'
    | 'description'
    | 'outputSchema'
    | 'annotations'
    | 'sideEffect'
    | 'examples'
    | 'errors'
    | 'states'
    | 'prerequisites'
    | 'privacy'
  >
>

/** Closed, optimistic-concurrency patch staged by the propose tool. */
export interface ContractRevisionPatch {
  readonly toolName: string
  readonly baseRevision: number
  readonly rationale: string
  readonly changes: WorkbenchContractChanges
}

export type ContractRevisionErrorCode =
  | 'EMPTY_PATCH'
  | 'INVALID_CONTRACT'
  | 'INVALID_PATCH'
  | 'INVALID_SCHEMA'
  | 'STALE_REVISION'
  | 'UNKNOWN_TOOL'

export interface ContractRevisionError {
  readonly code: ContractRevisionErrorCode
  readonly message: string
  readonly fields?: readonly string[]
}

export type ContractRevisionResult =
  | {
      readonly ok: true
      readonly contracts: readonly WorkbenchToolContract[]
    }
  | {
      readonly ok: false
      readonly error: ContractRevisionError
    }

export interface RegistrationMetadata {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: WorkbenchJsonSchema
  readonly annotations?: WorkbenchContractAnnotations
}

/** Every generated view of one accepted registry revision. */
export interface ContractArtifactBundle {
  readonly registrationMetadata: readonly RegistrationMetadata[]
  readonly registrationJson: string
  readonly manifest: Readonly<Record<string, unknown>>
  readonly contractJson: string
  readonly markdown: string
  readonly openApi: Readonly<Record<string, unknown>>
  readonly openApiJson: string
}

export interface AuditConsistencyEvidence {
  readonly registrationMetadata?: unknown
  readonly artifactBundle?: Partial<ContractArtifactBundle>
}

export type AuditSeverity = 'error' | 'warning'

export type AuditFindingCode =
  | 'ARTIFACT_DISAGREEMENT'
  | 'DUPLICATE_TOOL_NAME'
  | 'INVALID_EXAMPLE'
  | 'INVALID_TOOL_NAME'
  | 'MISSING_CONTRACT_FIELD'
  | 'MISSING_ERROR_RECOVERY'
  | 'MISSING_INPUT_SCHEMA'
  | 'MISSING_PARAMETER_DESCRIPTION'
  | 'OPEN_INPUT_SCHEMA'
  | 'READ_ONLY_SIDE_EFFECT_CONFLICT'
  | 'REGISTRATION_DISAGREEMENT'
  | 'REQUIRED_PROPERTY_NOT_DECLARED'
  | 'UNTRUSTED_OUTPUT_ANNOTATION_MISSING'
  | 'VAGUE_DESCRIPTION'

/** Deterministic, contract-data-supported issue shown in the audit panel. */
export interface AuditFinding {
  readonly id: string
  readonly code: AuditFindingCode
  readonly severity: AuditSeverity
  readonly toolName: string | null
  readonly field: string
  readonly message: string
  readonly recommendation: string
}

export interface AuditResult {
  readonly findings: readonly AuditFinding[]
  readonly findingCount: number
  readonly errorCount: number
  readonly warningCount: number
  readonly passed: boolean
}

const CONTRACT_CHANGE_KEYS = [
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
] as const satisfies readonly (keyof WorkbenchContractChanges)[]

const SIDE_EFFECTS = new Set<WorkbenchSideEffect>([
  'none',
  'populates-audit-panel',
  'stages-revision',
  'opens-artifact-preview',
])

const SCHEMA_TYPES = new Set([
  'array',
  'boolean',
  'integer',
  'null',
  'number',
  'object',
  'string',
])

const SCHEMA_KEYWORDS = new Set([
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

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isJsonValue(
  value: unknown,
  seen = new Set<object>(),
  depth = 0,
): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (depth >= 32) return false
  if (seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen, depth + 1))
    : isRecord(value) &&
      Object.values(value).every((item) =>
        isJsonValue(item, seen, depth + 1),
      )
  seen.delete(value)
  return valid
}

function jsonIdentity(value: WorkbenchJsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => jsonIdentity(item)).join(',')}]`
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${jsonIdentity(value[key] as WorkbenchJsonValue)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function hasUniqueJsonValues(value: readonly WorkbenchJsonValue[]): boolean {
  const identities = value.map((item) => jsonIdentity(item))
  return new Set(identities).size === identities.length
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

interface SchemaValidationOptions {
  allowPattern: boolean
}

function isSchema(
  value: unknown,
  options: SchemaValidationOptions = { allowPattern: true },
  ancestors = new Set<object>(),
  depth = 0,
): value is WorkbenchJsonSchema {
  if (
    !isRecord(value) ||
    !isJsonValue(value) ||
    depth >= 32 ||
    ancestors.has(value) ||
    Object.keys(value).some((key) => !SCHEMA_KEYWORDS.has(key))
  ) {
    return false
  }

  ancestors.add(value)
  const nestedSchema = (schema: unknown): boolean =>
    isSchema(schema, options, ancestors, depth + 1)

  const valid =
    (value.type === undefined ||
      (typeof value.type === 'string' && SCHEMA_TYPES.has(value.type))) &&
    (value.description === undefined ||
      typeof value.description === 'string') &&
    (value.properties === undefined ||
      (isRecord(value.properties) &&
        Object.values(value.properties).every(nestedSchema))) &&
    (value.required === undefined ||
      (isStringArray(value.required) &&
        new Set(value.required).size === value.required.length)) &&
    (value.items === undefined || nestedSchema(value.items)) &&
    (value.additionalProperties === undefined ||
      typeof value.additionalProperties === 'boolean' ||
      nestedSchema(value.additionalProperties)) &&
    (value.minimum === undefined ||
      (typeof value.minimum === 'number' && Number.isFinite(value.minimum))) &&
    (value.maximum === undefined ||
      (typeof value.maximum === 'number' && Number.isFinite(value.maximum))) &&
    (value.minimum === undefined ||
      value.maximum === undefined ||
      Number(value.minimum) <= Number(value.maximum)) &&
    (value.minLength === undefined || isNonNegativeInteger(value.minLength)) &&
    (value.maxLength === undefined || isNonNegativeInteger(value.maxLength)) &&
    (value.minLength === undefined ||
      value.maxLength === undefined ||
      Number(value.minLength) <= Number(value.maxLength)) &&
    (value.minItems === undefined || isNonNegativeInteger(value.minItems)) &&
    (value.maxItems === undefined || isNonNegativeInteger(value.maxItems)) &&
    (value.minItems === undefined ||
      value.maxItems === undefined ||
      Number(value.minItems) <= Number(value.maxItems)) &&
    (value.uniqueItems === undefined ||
      typeof value.uniqueItems === 'boolean') &&
    (value.enum === undefined ||
      (Array.isArray(value.enum) &&
        value.enum.length > 0 &&
        hasUniqueJsonValues(value.enum as readonly WorkbenchJsonValue[]))) &&
    (value.pattern === undefined ||
      (options.allowPattern && typeof value.pattern === 'string')) &&
    (['allOf', 'anyOf', 'oneOf'] as const).every((keyword) => {
      const schemas = value[keyword]
      return (
        schemas === undefined ||
        (Array.isArray(schemas) &&
          schemas.length > 0 &&
          schemas.every(nestedSchema))
      )
    })

  ancestors.delete(value)
  return valid
}

function isAnnotations(value: unknown): value is WorkbenchContractAnnotations {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  return (
    keys.every(
      (key) => key === 'readOnlyHint' || key === 'untrustedContentHint',
    ) &&
    Object.values(value).every((entry) => typeof entry === 'boolean')
  )
}

function isExamples(value: unknown): value is readonly WorkbenchContractExample[] {
  return (
    Array.isArray(value) &&
    value.every(
      (example) =>
        isRecord(example) &&
        Object.keys(example).every((key) =>
          ['title', 'description', 'input', 'output'].includes(key),
        ) &&
        isNonEmptyString(example.title) &&
        (example.description === undefined ||
          typeof example.description === 'string') &&
        isJsonValue(example.input) &&
        isJsonValue(example.output),
    )
  )
}

function isErrors(value: unknown): value is readonly WorkbenchContractError[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        Object.keys(entry).every((key) =>
          ['code', 'summary', 'recovery'].includes(key),
        ) &&
        isNonEmptyString(entry.code) &&
        isNonEmptyString(entry.summary) &&
        (entry.recovery === undefined || typeof entry.recovery === 'string'),
    )
  )
}

function isPrivacy(value: unknown): value is WorkbenchContractPrivacy {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === 'outputSource' || key === 'note') &&
    (value.outputSource === 'system' ||
      value.outputSource === 'developer' ||
      value.outputSource === 'external') &&
    isNonEmptyString(value.note)
  )
}

function validateContractShape(contract: unknown): string[] {
  if (!isRecord(contract)) return ['contract']
  const invalid: string[] = []
  if (!isNonEmptyString(contract.name)) invalid.push('name')
  if (!isNonEmptyString(contract.title)) invalid.push('title')
  if (!isNonEmptyString(contract.summary)) invalid.push('summary')
  if (typeof contract.description !== 'string') invalid.push('description')
  if (!Number.isInteger(contract.revision) || Number(contract.revision) < 1) {
    invalid.push('revision')
  }
  if (!isSchema(contract.inputSchema) || contract.inputSchema.type !== 'object') {
    invalid.push('inputSchema')
  }
  if (!isSchema(contract.outputSchema)) invalid.push('outputSchema')
  if (!isAnnotations(contract.annotations)) invalid.push('annotations')
  if (!SIDE_EFFECTS.has(contract.sideEffect as WorkbenchSideEffect)) {
    invalid.push('sideEffect')
  }
  if (!isExamples(contract.examples)) invalid.push('examples')
  if (!isErrors(contract.errors)) invalid.push('errors')
  if (!isStringArray(contract.states)) invalid.push('states')
  if (!isStringArray(contract.prerequisites)) invalid.push('prerequisites')
  if (!isPrivacy(contract.privacy)) invalid.push('privacy')
  return invalid
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
    ) as T
  }
  return value
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const item of Object.values(value)) deepFreeze(item)
  return value
}

/** Returns a detached, recursively frozen accepted registry snapshot. */
export function cloneContracts<const T extends readonly WorkbenchToolContract[]>(
  contracts: T,
): T {
  return deepFreeze(cloneValue(contracts))
}

function revisionFailure(
  code: ContractRevisionErrorCode,
  message: string,
  fields?: readonly string[],
): ContractRevisionResult {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(fields?.length ? { fields: [...fields] } : {}),
    },
  }
}

/**
 * Applies one fixed-name revision atomically. It never mutates the accepted
 * registry and never turns metadata into a new executable tool.
 */
export function applyContractRevisionPatch(
  contracts: readonly WorkbenchToolContract[],
  patch: ContractRevisionPatch,
): ContractRevisionResult {
  if (!isRecord(patch)) {
    return revisionFailure('INVALID_PATCH', 'The revision patch must be an object.')
  }
  const patchKeys = Object.keys(patch)
  const allowedPatchKeys = new Set([
    'toolName',
    'baseRevision',
    'rationale',
    'changes',
  ])
  const unknownPatchKeys = patchKeys.filter((key) => !allowedPatchKeys.has(key))
  if (unknownPatchKeys.length) {
    return revisionFailure(
      'INVALID_PATCH',
      'The revision patch contains unknown fields.',
      unknownPatchKeys.sort(),
    )
  }
  if (
    !isNonEmptyString(patch.toolName) ||
    !Number.isInteger(patch.baseRevision) ||
    patch.baseRevision < 1 ||
    !isNonEmptyString(patch.rationale) ||
    !isRecord(patch.changes)
  ) {
    return revisionFailure(
      'INVALID_PATCH',
      'The revision patch requires a tool name, positive base revision, rationale, and changes object.',
    )
  }

  const allowedChangeKeys = new Set<string>(CONTRACT_CHANGE_KEYS)
  const unknownChanges = Object.keys(patch.changes).filter(
    (key) => !allowedChangeKeys.has(key),
  )
  if (unknownChanges.length) {
    return revisionFailure(
      'INVALID_PATCH',
      'Contract names and revisions cannot be patched, and unknown change fields are rejected.',
      unknownChanges.sort(),
    )
  }
  if (Object.keys(patch.changes).length === 0) {
    return revisionFailure('EMPTY_PATCH', 'The revision patch makes no changes.')
  }

  const index = contracts.findIndex(
    (contract) => contract.name === patch.toolName,
  )
  if (index < 0) {
    return revisionFailure(
      'UNKNOWN_TOOL',
      `No accepted tool contract is named ${patch.toolName}.`,
      ['toolName'],
    )
  }
  const current = contracts[index]
  if (current.revision !== patch.baseRevision) {
    return revisionFailure(
      'STALE_REVISION',
      `The accepted ${current.name} contract is at revision ${current.revision}, not ${patch.baseRevision}.`,
      ['baseRevision'],
    )
  }

  if (
    'outputSchema' in patch.changes &&
    !isSchema(patch.changes.outputSchema, { allowPattern: false })
  ) {
    return revisionFailure(
      'INVALID_SCHEMA',
      'Changed output schemas must use only the supported, non-executable JSON Schema subset.',
      ['changes.outputSchema'],
    )
  }

  const candidate = {
    ...current,
    ...cloneValue(patch.changes),
    name: current.name,
    revision: current.revision + 1,
  }
  const invalidFields = validateContractShape(candidate)
  if (invalidFields.length) {
    return revisionFailure(
      'INVALID_CONTRACT',
      'The proposed revision does not form a valid workbench contract.',
      invalidFields.map((field) => `changes.${field}`).sort(),
    )
  }

  const next = contracts.map((contract, contractIndex) =>
    contractIndex === index ? candidate : contract,
  ) as readonly WorkbenchToolContract[]
  return { ok: true, contracts: cloneContracts(next) }
}
