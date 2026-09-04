import {
  SECOND_SURFACE_TOOL_NAMES,
  type ContractRevisionPatch,
  type WorkbenchToolContract,
} from '../contracts'

/** Exact names exposed by the Second Surface browser workbench. */
export type SecondSurfaceToolName =
  (typeof SECOND_SURFACE_TOOL_NAMES)[number]

/** JSON-only boundary prevents tool results from leaking browser objects. */
export type JsonPrimitive = string | number | boolean | null
/** Recursive value accepted in structured tool results and error details. */
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[]
/** Structured JSON object accepted by the WebMCP result contract. */
export interface JsonObject {
  [key: string]: JsonValue
}

/** Closed lookup input for one accepted workbench tool contract. */
export interface GetToolContractInput {
  toolName: SecondSurfaceToolName
}

/** Bounded revision proposal accepted by the staging tool. */
export type ProposeContractRevisionInput = ContractRevisionPatch

/** Per-invocation cancellation propagated into application operations. */
export interface ToolExecutionContext {
  signal: AbortSignal
}

/** Agent-readable rejection with constrained retry guidance. */
export interface ToolFailure {
  ok: false
  error: {
    code: string
    message: string
    retryable: boolean
    details?: JsonObject
  }
}

/** Structured success envelope used consistently by all five tools. */
export interface ToolSuccess<T> {
  ok: true
  data: T
}

/** Discriminated result that keeps expected rejections out of exceptions. */
export type ToolResult<T> = ToolSuccess<T> | ToolFailure

/** Allows adapters to keep pure reads synchronous without constraining writes. */
export type MaybePromise<T> = T | Promise<T>

/** JSON-safe data envelope returned by the workbench adapter methods. */
export type SecondSurfaceToolData = JsonObject

/**
 * Application-facing boundary for Second Surface WebMCP tools. Registration
 * metadata comes from the accepted canonical contracts at factory creation,
 * while every invocation resolves this adapter again to reach live state.
 */
export interface SecondSurfaceWebMcpAdapter {
  getAcceptedContracts(): readonly WorkbenchToolContract[]
  listToolContracts(
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<SecondSurfaceToolData>>
  getToolContract(
    input: GetToolContractInput,
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<SecondSurfaceToolData>>
  auditToolContracts(
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<SecondSurfaceToolData>>
  proposeContractRevision(
    input: ProposeContractRevisionInput,
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<SecondSurfaceToolData>>
  previewContractBundle(
    context: ToolExecutionContext,
  ): MaybePromise<ToolResult<SecondSurfaceToolData>>
}

/** Resolves the adapter at invocation time so tools always reach live state. */
export type SecondSurfaceWebMcpAdapterProvider =
  () => SecondSurfaceWebMcpAdapter

export type { ContractRevisionPatch, WorkbenchToolContract }
