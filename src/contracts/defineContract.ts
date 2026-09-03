import type { WorkflowStatus } from '../domain'

/** JSON Schema fragment used by registrations and generated documentation. */
export type JsonSchema = Readonly<Record<string, unknown>>

/** Failures raised by browser/tool plumbing rather than a domain transition. */
export type BoundaryErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_TOOL_RESULT'
  | 'TOOL_EXECUTION_FAILED'

/** Every structured failure code a documented tool can return. */
export type ContractErrorCode =
  | import('../domain').DomainErrorCode
  | BoundaryErrorCode

/** Local side-effect classes used by the current browser-only product. */
export type ToolSideEffect =
  | 'none'
  | 'local-draft-replacement'
  | 'local-review-freeze'
  | 'local-finalization'

/** A state change caused by one successful tool invocation. */
export interface ContractTransition {
  from: WorkflowStatus
  to: WorkflowStatus
  condition: string
}

/** One fictional, executable-looking contract example. */
export interface ContractExample {
  title: string
  description: string
  input: Readonly<Record<string, unknown>>
  result: Readonly<Record<string, unknown>>
}

/** Registration hints currently exposed by the WebMCP browser surface. */
export interface ContractAnnotations {
  readOnlyHint?: boolean
  untrustedContentHint?: boolean
}

/** Privacy facts an integrator must understand before invoking a tool. */
export interface ContractPrivacy {
  dataDisclosed: string
  dataPersisted: string
  networkTransmission: false
  resultContainsHumanAuthoredValues: boolean
  securityNote: string
}

/**
 * Canonical description of one Permission Slip WebMCP tool. Runtime
 * registration and every documentation projection consume this structure.
 */
export interface ToolContract<Name extends string = string> {
  name: Name
  title: string
  summary: string
  description: string
  inputSchema: JsonSchema
  outputSchema: JsonSchema
  examples: readonly ContractExample[]
  errors: readonly ContractErrorCode[]
  readOnly: boolean
  sideEffect: ToolSideEffect
  allowedStates: readonly WorkflowStatus[]
  transitions: readonly ContractTransition[]
  humanApprovalRequired: boolean
  humanPrerequisite: string | null
  privacy: ContractPrivacy
  relatedOperations: readonly string[]
  annotations?: ContractAnnotations
}

/** Preserves literal tool names while checking a registry entry's shape. */
export function defineToolContract<const Name extends string>(
  contract: ToolContract<Name>,
): ToolContract<Name> {
  return Object.freeze(contract)
}
