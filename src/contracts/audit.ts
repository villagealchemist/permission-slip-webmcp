import {
  buildArtifactBundle,
  buildRegistrationMetadata,
  stableStringify,
} from './projections'
import type {
  AuditConsistencyEvidence,
  AuditFinding,
  AuditFindingCode,
  AuditResult,
  AuditSeverity,
  WorkbenchJsonSchema,
  WorkbenchToolContract,
} from './workbenchContract'

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/
const ACTION_VERB_PATTERN =
  /\b(audit|check|compare|create|generate|get|inspect|list|open|preview|propose|read|replace|return|show|stage|update|validate)\b/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function sameValue(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right)
}

function matchesType(value: unknown, type: unknown): boolean {
  switch (type) {
    case undefined:
      return true
    case 'array':
      return Array.isArray(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'null':
      return value === null
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'object':
      return isRecord(value)
    case 'string':
      return typeof value === 'string'
    default:
      return false
  }
}

/** Lightweight, browser-safe validation for the schema keywords documented here. */
function exampleMatchesSchema(value: unknown, schema: WorkbenchJsonSchema): boolean {
  if ('const' in schema && !sameValue(value, schema.const)) return false
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => sameValue(value, candidate))
  ) {
    return false
  }

  const oneOf = schema.oneOf
  if (
    Array.isArray(oneOf) &&
    oneOf.filter(
      (candidate) =>
        isRecord(candidate) &&
        exampleMatchesSchema(value, candidate as WorkbenchJsonSchema),
    ).length !== 1
  ) {
    return false
  }
  const anyOf = schema.anyOf
  if (
    Array.isArray(anyOf) &&
    !anyOf.some(
      (candidate) =>
        isRecord(candidate) &&
        exampleMatchesSchema(value, candidate as WorkbenchJsonSchema),
    )
  ) {
    return false
  }
  const allOf = schema.allOf
  if (
    Array.isArray(allOf) &&
    !allOf.every(
      (candidate) =>
        isRecord(candidate) &&
        exampleMatchesSchema(value, candidate as WorkbenchJsonSchema),
    )
  ) {
    return false
  }

  if (!matchesType(value, schema.type)) return false

  if (typeof value === 'string') {
    if (
      typeof schema.minLength === 'number' &&
      value.length < schema.minLength
    ) {
      return false
    }
    if (
      typeof schema.maxLength === 'number' &&
      value.length > schema.maxLength
    ) {
      return false
    }
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) return false
      } catch {
        return false
      }
    }
    if (schema.format === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return false
    }
    if (schema.format === 'date-time' && !Number.isFinite(Date.parse(value))) {
      return false
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return false
    if (typeof schema.maximum === 'number' && value > schema.maximum) return false
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      return false
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      return false
    }
    if (
      schema.uniqueItems === true &&
      new Set(value.map((item) => stableStringify(item))).size !== value.length
    ) {
      return false
    }
    if (
      isRecord(schema.items) &&
      !value.every((item) =>
        exampleMatchesSchema(item, schema.items as WorkbenchJsonSchema),
      )
    ) {
      return false
    }
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : []
    if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
      return false
    }
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[key]
      if (isRecord(propertySchema)) {
        if (
          !exampleMatchesSchema(
            propertyValue,
            propertySchema as WorkbenchJsonSchema,
          )
        ) {
          return false
        }
        continue
      }
      if (schema.additionalProperties === false) return false
      if (
        isRecord(schema.additionalProperties) &&
        !exampleMatchesSchema(
          propertyValue,
          schema.additionalProperties as WorkbenchJsonSchema,
        )
      ) {
        return false
      }
    }
  }

  return true
}

function finding(
  code: AuditFindingCode,
  severity: AuditSeverity,
  toolName: string | null,
  field: string,
  message: string,
  recommendation: string,
): AuditFinding {
  const identity = `${toolName ?? '$registry'}:${field}:${code}`
  return {
    id: identity,
    code,
    severity,
    toolName,
    field,
    message,
    recommendation,
  }
}

function compareFinding(left: AuditFinding, right: AuditFinding): number {
  return (
    (left.toolName ?? '').localeCompare(right.toolName ?? '') ||
    left.field.localeCompare(right.field) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  )
}

function artifactEvidenceFindings(
  contracts: readonly WorkbenchToolContract[],
  evidence: AuditConsistencyEvidence,
): AuditFinding[] {
  const findings: AuditFinding[] = []
  if (
    evidence.registrationMetadata !== undefined &&
    !sameValue(
      evidence.registrationMetadata,
      buildRegistrationMetadata(contracts),
    )
  ) {
    findings.push(
      finding(
        'REGISTRATION_DISAGREEMENT',
        'error',
        null,
        '$registry.registrationMetadata',
        'Observed registration metadata disagrees with the accepted canonical registry.',
        'Re-register the fixed tools from buildRegistrationMetadata(acceptedContracts).',
      ),
    )
  }

  if (evidence.artifactBundle) {
    const expected = buildArtifactBundle(contracts)
    const mismatches = Object.entries(evidence.artifactBundle)
      .filter(([key, value]) =>
        value === undefined
          ? false
          : !sameValue(
              value,
              expected[key as keyof typeof expected],
            ),
      )
      .map(([key]) => key)
      .sort()
    for (const key of mismatches) {
      findings.push(
        finding(
          'ARTIFACT_DISAGREEMENT',
          'error',
          null,
          `$registry.artifacts.${key}`,
          `The ${key} artifact disagrees with the accepted canonical registry.`,
          'Regenerate this projection from buildArtifactBundle(acceptedContracts).',
        ),
      )
    }
  }
  return findings
}

/**
 * Runs only deterministic checks supported by contract data. Findings make no
 * claim about actual runtime side effects, security, privacy, or semantic truth.
 */
export function auditToolContracts(
  contracts: readonly WorkbenchToolContract[],
  evidence: AuditConsistencyEvidence = {},
): AuditResult {
  const findings: AuditFinding[] = []
  const nameCounts = new Map<string, number>()
  for (const contract of contracts) {
    nameCounts.set(contract.name, (nameCounts.get(contract.name) ?? 0) + 1)
  }
  for (const [name, count] of [...nameCounts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (count <= 1) continue
    findings.push(
      finding(
        'DUPLICATE_TOOL_NAME',
        'error',
        name,
        'name',
        `The accepted registry contains ${count} contracts named ${name}.`,
        'Keep exactly one fixed executor-bound contract for this name.',
      ),
    )
  }

  for (const contract of contracts) {
    for (const [field, value] of [
      ['name', contract.name],
      ['title', contract.title],
      ['description', contract.description],
    ] as const) {
      if (value.trim().length > 0) continue
      findings.push(
        finding(
          'MISSING_CONTRACT_FIELD',
          'error',
          contract.name || null,
          field,
          `The tool contract has no usable ${field}.`,
          `Add a concise, truthful ${field} supported by the fixed executor.`,
        ),
      )
    }

    if (contract.name && !TOOL_NAME_PATTERN.test(contract.name)) {
      findings.push(
        finding(
          'INVALID_TOOL_NAME',
          'error',
          contract.name,
          'name',
          'The tool name is not lower-case snake_case beginning with a letter.',
          'Use a fixed lower-case snake_case name that matches the registered executor.',
        ),
      )
    }

    const description = contract.description.trim()
    if (
      description &&
      (description.length < 48 || !ACTION_VERB_PATTERN.test(description))
    ) {
      findings.push(
        finding(
          'VAGUE_DESCRIPTION',
          'warning',
          contract.name,
          'description',
          'The description is too vague or insufficiently action-oriented to make invocation behavior testable.',
          'Describe the observable operation, output, and important boundary without inventing runtime semantics.',
        ),
      )
    }

    const inputSchema = contract.inputSchema
    if (inputSchema.type !== 'object' || !isRecord(inputSchema.properties)) {
      findings.push(
        finding(
          'MISSING_INPUT_SCHEMA',
          'error',
          contract.name,
          'inputSchema',
          'The documented input is not an object schema with declared properties.',
          'Declare an object input schema, including an empty properties object for tools with no parameters.',
        ),
      )
    } else {
      if (inputSchema.additionalProperties !== false) {
        findings.push(
          finding(
            'OPEN_INPUT_SCHEMA',
            'warning',
            contract.name,
            'inputSchema.additionalProperties',
            'The input schema does not explicitly reject unexpected properties.',
            'Set additionalProperties to false so unknown input is rejected atomically.',
          ),
        )
      }
      for (const [parameter, parameterSchema] of Object.entries(
        inputSchema.properties,
      ).sort(([left], [right]) => left.localeCompare(right))) {
        if (
          isRecord(parameterSchema) &&
          typeof parameterSchema.description === 'string' &&
          parameterSchema.description.trim().length > 0
        ) {
          continue
        }
        findings.push(
          finding(
            'MISSING_PARAMETER_DESCRIPTION',
            'warning',
            contract.name,
            `inputSchema.properties.${parameter}.description`,
            `The ${parameter} input parameter has no description.`,
            'Document what the parameter identifies or changes without adding unsupported semantics.',
          ),
        )
      }
      if (Array.isArray(inputSchema.required)) {
        for (const required of inputSchema.required) {
          if (
            typeof required !== 'string' ||
            Object.prototype.hasOwnProperty.call(inputSchema.properties, required)
          ) {
            continue
          }
          findings.push(
            finding(
              'REQUIRED_PROPERTY_NOT_DECLARED',
              'error',
              contract.name,
              `inputSchema.required.${required}`,
              `The required input property ${required} is absent from properties.`,
              'Declare the required property schema or remove the unsupported requirement.',
            ),
          )
        }
      }
    }

    contract.examples.forEach((example, index) => {
      if (!exampleMatchesSchema(example.input, contract.inputSchema)) {
        findings.push(
          finding(
            'INVALID_EXAMPLE',
            'error',
            contract.name,
            `examples[${index}].input`,
            `The input for example “${example.title}” does not validate against the documented input schema.`,
            'Correct the example or the schema so they describe the same accepted input.',
          ),
        )
      }
      if (!exampleMatchesSchema(example.output, contract.outputSchema)) {
        findings.push(
          finding(
            'INVALID_EXAMPLE',
            'error',
            contract.name,
            `examples[${index}].output`,
            `The output for example “${example.title}” does not validate against the documented output schema.`,
            'Correct the example or the schema so they describe the same documented output.',
          ),
        )
      }
    })

    if (
      contract.sideEffect !== 'none' &&
      contract.annotations.readOnlyHint === true
    ) {
      findings.push(
        finding(
          'READ_ONLY_SIDE_EFFECT_CONFLICT',
          'error',
          contract.name,
          'annotations.readOnlyHint',
          `The contract declares the ${contract.sideEffect} side effect while marking the tool read-only.`,
          'Remove the read-only hint or correct the side-effect declaration after developer review.',
        ),
      )
    }

    if (
      contract.privacy.outputSource !== 'system' &&
      contract.annotations.untrustedContentHint !== true
    ) {
      findings.push(
        finding(
          'UNTRUSTED_OUTPUT_ANNOTATION_MISSING',
          'warning',
          contract.name,
          'annotations.untrustedContentHint',
          `${contract.privacy.outputSource} content may appear in tool output without an untrusted-content annotation.`,
          'Set untrustedContentHint when the documented output can include developer-authored or external content.',
        ),
      )
    }

    contract.errors.forEach((error, index) => {
      if (error.recovery?.trim()) return
      findings.push(
        finding(
          'MISSING_ERROR_RECOVERY',
          'warning',
          contract.name,
          `errors[${index}].recovery`,
          `The ${error.code} error has no documented recovery guidance.`,
          'Add a constrained recovery step supported by the contract.',
        ),
      )
    })
  }

  findings.push(...artifactEvidenceFindings(contracts, evidence))
  findings.sort(compareFinding)
  const frozenFindings = Object.freeze(findings.map((entry) => Object.freeze(entry)))
  const errorCount = frozenFindings.filter(
    (entry) => entry.severity === 'error',
  ).length
  const warningCount = frozenFindings.length - errorCount
  return Object.freeze({
    findings: frozenFindings,
    findingCount: frozenFindings.length,
    errorCount,
    warningCount,
    passed: frozenFindings.length === 0,
  })
}
