import {
  SECOND_SURFACE_TOOL_CONTRACTS,
  SECOND_SURFACE_TOOL_NAMES,
  applyContractRevisionPatch,
  auditToolContracts,
  buildContractBundle,
  cloneContracts,
  type AuditFinding,
  type ContractArtifactBundle,
  type ContractRevisionPatch,
  type SecondSurfaceToolName,
  type WorkbenchToolContract,
} from '../contracts'

export type ArtifactKind =
  | 'registration'
  | 'contractJson'
  | 'markdown'
  | 'openApi'

export interface PendingContractRevision {
  readonly stageId: string
  readonly toolName: SecondSurfaceToolName
  readonly rationale: string
  readonly before: WorkbenchToolContract
  readonly after: WorkbenchToolContract
  readonly candidateContracts: readonly WorkbenchToolContract[]
  readonly currentFindingCount: number
  readonly projectedFindingCount: number
}

export interface WorkbenchState {
  readonly acceptedContracts: readonly WorkbenchToolContract[]
  readonly acceptedRevision: number
  readonly selectedToolName: SecondSurfaceToolName
  readonly findings: readonly AuditFinding[]
  readonly auditHasRun: boolean
  readonly pendingRevision: PendingContractRevision | null
  readonly artifactBundle: ContractArtifactBundle | null
  readonly activeArtifact: ArtifactKind
}

export interface WorkbenchExecutionContext {
  readonly signal: AbortSignal
}

export type WorkbenchListener = () => void

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}

function success<T>(data: T) {
  return { ok: true as const, data }
}

function failure(
  code: string,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
) {
  return {
    ok: false as const,
    error: {
      code,
      message,
      retryable,
      ...(details ? { details } : {}),
    },
  }
}

function findingCountFor(
  findings: readonly AuditFinding[],
  toolName: string,
): number {
  return findings.filter((finding) => finding.toolName === toolName).length
}

function isToolName(value: string): value is SecondSurfaceToolName {
  return (SECOND_SURFACE_TOOL_NAMES as readonly string[]).includes(value)
}

function currentTool(
  contracts: readonly WorkbenchToolContract[],
  toolName: string,
): WorkbenchToolContract | undefined {
  return contracts.find((contract) => contract.name === toolName)
}

/**
 * One browser-local state boundary shared by the visible workbench and all five
 * WebMCP handlers. Agent operations may inspect, audit, stage, and preview;
 * acceptance, rejection, and reset remain visible human actions.
 */
export class WorkbenchStore {
  private listeners = new Set<WorkbenchListener>()
  private state: WorkbenchState

  readonly human = {
    acceptPendingRevision: () => this.acceptPendingRevision(),
    rejectPendingRevision: () => this.rejectPendingRevision(),
    resetCatalog: () => this.resetCatalog(),
  }

  constructor(seed = SECOND_SURFACE_TOOL_CONTRACTS) {
    const acceptedContracts = cloneContracts(seed)
    const audit = auditToolContracts(acceptedContracts)
    this.state = {
      acceptedContracts,
      acceptedRevision: 1,
      selectedToolName: SECOND_SURFACE_TOOL_NAMES[0],
      findings: audit.findings,
      auditHasRun: false,
      pendingRevision: null,
      artifactBundle: null,
      activeArtifact: 'registration',
    }
  }

  subscribe = (listener: WorkbenchListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): WorkbenchState => this.state

  getAcceptedContracts = (): readonly WorkbenchToolContract[] =>
    this.state.acceptedContracts

  private publish(next: WorkbenchState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  setActiveArtifact(kind: ArtifactKind): void {
    if (this.state.activeArtifact === kind) return
    this.publish({ ...this.state, activeArtifact: kind })
  }

  async listToolContracts(context: WorkbenchExecutionContext) {
    throwIfAborted(context.signal)
    const tools = this.state.acceptedContracts.map((contract) => ({
      name: contract.name,
      summary: contract.summary,
      revision: contract.revision,
      readOnly: contract.annotations.readOnlyHint === true,
      annotations: contract.annotations,
      sideEffect: contract.sideEffect,
      findingCount: findingCountFor(this.state.findings, contract.name),
    }))
    return success({ tools, acceptedRevision: this.state.acceptedRevision })
  }

  async getToolContract(
    input: { readonly toolName: string },
    context: WorkbenchExecutionContext,
  ) {
    throwIfAborted(context.signal)
    const contract = currentTool(
      this.state.acceptedContracts,
      input.toolName,
    )
    if (!contract || !isToolName(input.toolName)) {
      return failure(
        'TOOL_NOT_FOUND',
        `No accepted tool contract is named ${input.toolName}.`,
        true,
        { availableToolNames: [...SECOND_SURFACE_TOOL_NAMES] },
      )
    }
    this.publish({ ...this.state, selectedToolName: input.toolName })
    return success({
      contract,
      findings: this.state.findings.filter(
        (finding) => finding.toolName === input.toolName,
      ),
      registrationMetadata: {
        name: contract.name,
        title: contract.title,
        description: contract.description,
        inputSchema: contract.inputSchema,
        annotations: contract.annotations,
      },
      documentationExtensions: [
        'outputSchema',
        'examples',
        'errors',
        'states',
        'prerequisites',
        'privacy',
        'sideEffect',
      ],
    })
  }

  async auditToolContracts(context: WorkbenchExecutionContext) {
    throwIfAborted(context.signal)
    const audit = auditToolContracts(this.state.acceptedContracts)
    this.publish({
      ...this.state,
      findings: audit.findings,
      auditHasRun: true,
    })
    return success(audit)
  }

  async proposeContractRevision(
    patch: ContractRevisionPatch,
    context: WorkbenchExecutionContext,
  ) {
    throwIfAborted(context.signal)
    const current = currentTool(
      this.state.acceptedContracts,
      patch.toolName,
    )
    const revision = applyContractRevisionPatch(
      this.state.acceptedContracts,
      patch,
    )
    if (!revision.ok || !current || !isToolName(patch.toolName)) {
      const error = revision.ok
        ? {
            code: 'UNKNOWN_TOOL',
            message: `No accepted tool contract is named ${patch.toolName}.`,
            fields: ['toolName'],
          }
        : revision.error
      return failure(error.code, error.message, true, {
        fields: error.fields ? [...error.fields] : [],
      })
    }

    const candidate = currentTool(revision.contracts, patch.toolName)
    if (!candidate) {
      return failure(
        'INVALID_PATCH',
        'The proposed revision did not produce the targeted contract.',
        false,
      )
    }

    const currentAudit = auditToolContracts(this.state.acceptedContracts)
    const projectedAudit = auditToolContracts(revision.contracts)
    const pendingRevision: PendingContractRevision = {
      stageId: `stage-${patch.toolName}-${patch.baseRevision}-${candidate.revision}`,
      toolName: patch.toolName,
      rationale: patch.rationale,
      before: current,
      after: candidate,
      candidateContracts: revision.contracts,
      currentFindingCount: currentAudit.findingCount,
      projectedFindingCount: projectedAudit.findingCount,
    }

    this.publish({
      ...this.state,
      selectedToolName: patch.toolName,
      findings: currentAudit.findings,
      auditHasRun: true,
      pendingRevision,
    })

    return success({
      staged: true,
      stageId: pendingRevision.stageId,
      toolName: patch.toolName,
      baseRevision: patch.baseRevision,
      proposedRevision: candidate.revision,
      findingCountBefore: pendingRevision.currentFindingCount,
      findingCountAfter: pendingRevision.projectedFindingCount,
      humanReviewRequired:
        'A developer must accept or reject this exact staged revision in the visible workbench.',
    })
  }

  async previewContractBundle(context: WorkbenchExecutionContext) {
    throwIfAborted(context.signal)
    const artifactBundle = buildContractBundle(this.state.acceptedContracts)
    this.publish({
      ...this.state,
      artifactBundle,
      activeArtifact: 'registration',
    })
    return success({
      formats: ['registration', 'contract-json', 'markdown', 'openapi'],
      opened: true,
      acceptedRevision: this.state.acceptedRevision,
      note: 'The OpenAPI 3.1 file is a documentation projection only and creates no HTTP endpoint.',
    })
  }

  private acceptPendingRevision() {
    const pending = this.state.pendingRevision
    if (!pending) {
      return failure(
        'NO_PENDING_REVISION',
        'There is no staged revision to accept.',
        true,
      )
    }
    const current = currentTool(
      this.state.acceptedContracts,
      pending.toolName,
    )
    if (!current || current.revision !== pending.before.revision) {
      return failure(
        'STALE_REVISION',
        'The accepted registry changed after this revision was staged.',
        true,
      )
    }

    const acceptedContracts = cloneContracts(pending.candidateContracts)
    const audit = auditToolContracts(acceptedContracts)
    this.publish({
      ...this.state,
      acceptedContracts,
      acceptedRevision: this.state.acceptedRevision + 1,
      selectedToolName: pending.toolName,
      findings: audit.findings,
      auditHasRun: true,
      pendingRevision: null,
      artifactBundle: null,
      activeArtifact: 'registration',
    })
    return success({
      accepted: true,
      toolName: pending.toolName,
      revision: pending.after.revision,
      findingCount: audit.findingCount,
    })
  }

  private rejectPendingRevision() {
    const pending = this.state.pendingRevision
    if (!pending) {
      return failure(
        'NO_PENDING_REVISION',
        'There is no staged revision to reject.',
        true,
      )
    }
    this.publish({ ...this.state, pendingRevision: null })
    return success({
      rejected: true,
      acceptedRegistryChanged: false,
      toolName: pending.toolName,
    })
  }

  private resetCatalog() {
    const acceptedContracts = cloneContracts(SECOND_SURFACE_TOOL_CONTRACTS)
    const audit = auditToolContracts(acceptedContracts)
    this.publish({
      acceptedContracts,
      acceptedRevision: 1,
      selectedToolName: SECOND_SURFACE_TOOL_NAMES[0],
      findings: audit.findings,
      auditHasRun: false,
      pendingRevision: null,
      artifactBundle: null,
      activeArtifact: 'registration',
    })
    return success({ reset: true })
  }
}

let defaultStore: WorkbenchStore | null = null

export function getDefaultWorkbenchStore(): WorkbenchStore {
  defaultStore ??= new WorkbenchStore()
  return defaultStore
}
