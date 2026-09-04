import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createSecondSurfaceWebMcpController,
  type JsonObject,
  type JsonValue,
  type SecondSurfaceWebMcpAdapter,
  type ToolResult,
  type WebMcpRegistrationStatus,
} from '../webmcp'
import {
  getDefaultWorkbenchStore,
  type WorkbenchStore,
  useWorkbenchStore,
} from '../workbench'

const GOLDEN_PROMPT =
  'Audit the WebMCP catalog currently loaded in Second Surface. Identify only problems supported by the contract data, propose the smallest revision that makes the tools unambiguous and testable, and stage the revision in the workbench. Do not invent behavior or accept your own changes.'

const ARTIFACT_KINDS = [
  'registration',
  'contractJson',
  'markdown',
  'openApi',
] as const

type ArtifactKind = (typeof ARTIFACT_KINDS)[number]
type UnknownRecord = Record<string, unknown>

interface ContractView extends UnknownRecord {
  name: string
  title?: string
  summary?: string
  description?: string
  inputSchema?: unknown
  outputSchema?: unknown
  outputDocumentation?: unknown
  annotations?: unknown
  sideEffect?: unknown
  sideEffects?: unknown
  examples?: unknown
  errors?: unknown
  states?: unknown
  allowedStates?: unknown
  prerequisites?: unknown
  prereqs?: unknown
  humanPrerequisite?: unknown
  privacy?: unknown
  registration?: unknown
  registrationMetadata?: unknown
  lifecycle?: unknown
}

interface FindingView {
  severity: string
  rule?: string
  code?: string
  toolName: string | null
  field: string
  message: string
  recommendation?: string
}

interface PendingRevisionView {
  toolName: string
  rationale: string
  before: unknown
  after: unknown
  currentFindingCount: number
  projectedFindingCount: number
}

interface ContractExplorerProps {
  store?: WorkbenchStore
}

const INITIAL_WEBMCP_STATUS: WebMcpRegistrationStatus = {
  phase: 'idle',
  supported: false,
  registeredToolCount: 0,
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(toJsonValue)

  const record = asRecord(value)
  if (record) {
    const object: JsonObject = {}
    for (const [key, entry] of Object.entries(record)) {
      if (entry !== undefined) object[key] = toJsonValue(entry)
    }
    return object
  }

  throw new TypeError('Workbench tool results must contain JSON-safe values only.')
}

function toJsonObject(value: unknown): JsonObject {
  const record = asRecord(value)
  if (!record) throw new TypeError('Workbench tool results require an object envelope.')

  const object: JsonObject = {}
  for (const [key, entry] of Object.entries(record)) {
    if (entry !== undefined) object[key] = toJsonValue(entry)
  }
  return object
}

function toWebMcpResult(value: unknown): ToolResult<JsonObject> {
  const result = asRecord(value)
  if (result?.ok === true) {
    return { ok: true, data: toJsonObject(result.data) }
  }

  if (result?.ok === false) {
    const error = asRecord(result.error)
    const details = error?.details
    return {
      ok: false,
      error: {
        code:
          typeof error?.code === 'string'
            ? error.code
            : 'WORKBENCH_OPERATION_FAILED',
        message:
          typeof error?.message === 'string'
            ? error.message
            : 'The workbench operation did not complete.',
        retryable: error?.retryable === true,
        ...(details === undefined ? {} : { details: toJsonObject(details) }),
      },
    }
  }

  throw new TypeError('Workbench operations must return a structured result envelope.')
}

function normalizeContracts(value: unknown): ContractView[] {
  const entries = Array.isArray(value)
    ? value
    : Object.values(asRecord(value) ?? {})

  return entries.filter((entry): entry is ContractView => {
    const record = asRecord(entry)
    return typeof record?.name === 'string'
  })
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return 'Not documented in the accepted contract.'
  return JSON.stringify(value, null, 2)
}

function contractTitle(contract: ContractView): string {
  return contract.title ?? contract.name
}

function contractSummary(contract: ContractView): string {
  return contract.summary ?? contract.description ?? 'No summary documented.'
}

function nativeRegistrationMetadata(contract: ContractView): unknown {
  return (
    contract.registrationMetadata ??
    contract.registration ?? {
      name: contract.name,
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputSchema,
      annotations: contract.annotations,
    }
  )
}

function extensionValue(contract: ContractView, ...keys: string[]): unknown {
  for (const key of keys) {
    if (contract[key] !== undefined) return contract[key]
  }

  const lifecycle = asRecord(contract.lifecycle)
  if (lifecycle) {
    for (const key of keys) {
      if (lifecycle[key] !== undefined) return lifecycle[key]
    }
  }

  return undefined
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = asRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return 'The operation did not complete.'
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-block">{serialize(value)}</pre>
}

function CopyAction({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button className="action action--quiet" type="button" onClick={() => void copy()}>
      {copied ? 'Copied' : label}
    </button>
  )
}

function downloadText(
  filename: string,
  text: string,
  type = 'text/plain;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function artifactValue(bundle: unknown, kind: ArtifactKind): unknown {
  const record = asRecord(bundle)
  if (!record) return undefined

  switch (kind) {
    case 'registration':
      return record.registrationJson ?? record.registrationMetadata
    case 'contractJson':
      return record.contractJson ?? record.manifest
    case 'markdown':
      return record.markdown
    case 'openApi':
      return record.openApiJson ?? record.openApi
  }
}

function artifactFilename(kind: ArtifactKind): string {
  switch (kind) {
    case 'registration':
      return 'second-surface-registration.json'
    case 'contractJson':
      return 'second-surface-contracts.json'
    case 'markdown':
      return 'second-surface-reference.md'
    case 'openApi':
      return 'second-surface-openapi.json'
  }
}

function webMcpCopy(status: WebMcpRegistrationStatus): {
  label: string
  detail: string
  tone: 'neutral' | 'active' | 'success' | 'warning'
} {
  switch (status.phase) {
    case 'ready':
      return {
        label: 'Agent tools ready',
        detail: `${status.registeredToolCount} explorer tools registered from accepted revision`,
        tone: 'success',
      }
    case 'registering':
      return {
        label: 'Registering agent tools',
        detail: 'The visual workbench remains fully available.',
        tone: 'active',
      }
    case 'unsupported':
      return {
        label: 'Visual workbench mode',
        detail: 'This browser has no WebMCP support; catalog, audit, and artifacts still work.',
        tone: 'warning',
      }
    case 'error':
      return {
        label: 'Visual workbench mode',
        detail: status.error ?? 'Agent tools could not be registered.',
        tone: 'warning',
      }
    default:
      return {
        label: 'Checking agent tools',
        detail: 'Loading the accepted catalog in the browser.',
        tone: 'neutral',
      }
  }
}

function ReferenceBlock({
  title,
  value,
  extension = false,
}: {
  title: string
  value: unknown
  extension?: boolean
}) {
  return (
    <section className={`reference-block ${extension ? 'reference-block--extension' : ''}`}>
      <header className="reference-block__heading">
        <span>{extension ? 'Second Surface extension' : 'Native registerTool field'}</span>
        <h3>{title}</h3>
      </header>
      <JsonBlock value={value} />
    </section>
  )
}

export function ContractExplorer({ store: suppliedStore }: ContractExplorerProps = {}) {
  const store = useMemo(
    () => suppliedStore ?? getDefaultWorkbenchStore(),
    [suppliedStore],
  )
  const snapshot = useWorkbenchStore(store)
  const contracts = useMemo(
    () => normalizeContracts(snapshot.acceptedContracts),
    [snapshot.acceptedContracts],
  )
  const selectedContract =
    contracts.find((contract) => contract.name === snapshot.selectedToolName) ?? null
  const findings = snapshot.findings as unknown as FindingView[]
  const pendingRevision = snapshot.pendingRevision as unknown as PendingRevisionView | null
  const activeArtifact = ARTIFACT_KINDS.includes(
    snapshot.activeArtifact as ArtifactKind,
  )
    ? (snapshot.activeArtifact as ArtifactKind)
    : 'registration'
  const activeArtifactValue = artifactValue(snapshot.artifactBundle, activeArtifact)
  const [webMcpStatus, setWebMcpStatus] = useState(INITIAL_WEBMCP_STATUS)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const activeController = useRef<AbortController | null>(null)
  const webMcp = webMcpCopy(webMcpStatus)
  const webMcpAdapter = useMemo<SecondSurfaceWebMcpAdapter>(
    () => ({
      getAcceptedContracts: () => store.getAcceptedContracts(),
      listToolContracts: async (context) =>
        toWebMcpResult(await store.listToolContracts(context)),
      getToolContract: async (input, context) =>
        toWebMcpResult(await store.getToolContract(input, context)),
      auditToolContracts: async (context) =>
        toWebMcpResult(await store.auditToolContracts(context)),
      proposeContractRevision: async (input, context) =>
        toWebMcpResult(await store.proposeContractRevision(input, context)),
      previewContractBundle: async (context) =>
        toWebMcpResult(await store.previewContractBundle(context)),
    }),
    [store],
  )

  useEffect(() => {
    const abortController = new AbortController()
    void store.listToolContracts({ signal: abortController.signal }).catch((error: unknown) => {
      if (!abortController.signal.aborted) setNotice(errorMessage(error))
    })
    return () => abortController.abort()
  }, [store])

  useEffect(() => {
    const controller = createSecondSurfaceWebMcpController({
      getAdapter: () => webMcpAdapter,
      onStatusChange: setWebMcpStatus,
    })
    void controller.start()
    return () => controller.stop()
  }, [snapshot.acceptedRevision, webMcpAdapter])

  useEffect(
    () => () => {
      activeController.current?.abort()
    },
    [],
  )

  async function runOperation(
    label: string,
    operation: (signal: AbortSignal) => Promise<unknown>,
    success: string,
  ): Promise<void> {
    activeController.current?.abort()
    const abortController = new AbortController()
    activeController.current = abortController
    setBusyAction(label)
    setNotice(null)

    try {
      const result = await operation(abortController.signal)
      const record = asRecord(result)
      if (record?.ok === false) throw record.error ?? result
      if (!abortController.signal.aborted) setNotice(success)
    } catch (error) {
      if (!abortController.signal.aborted) setNotice(errorMessage(error))
    } finally {
      if (activeController.current === abortController) {
        activeController.current = null
        setBusyAction(null)
      }
    }
  }

  async function runHumanAction(
    label: string,
    operation: () => unknown | Promise<unknown>,
    success: string,
  ): Promise<void> {
    setBusyAction(label)
    setNotice(null)
    try {
      const result = await operation()
      const record = asRecord(result)
      if (record?.ok === false) throw record.error ?? result
      setNotice(success)
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  function resetCatalog(): void {
    if (!window.confirm('Reset the accepted Second Surface catalog in this browser?')) {
      return
    }
    store.human.resetCatalog()
    setNotice('Browser-local catalog reset.')
  }

  const artifactText = serialize(activeArtifactValue)

  return (
    <div className="workbench-shell">
      <a className="skip-link" href="#catalog">
        Skip to catalog
      </a>

      <header className="workbench-hero">
        <nav className="top-nav" aria-label="Second Surface sections">
          <a className="brand-lockup" href="#top" id="top">
            <strong>SECOND SURFACE</strong>
            <span>The self-documenting WebMCP explorer</span>
          </a>
          <div className="top-nav__links">
            <a href="#catalog">Catalog</a>
            <a href="#reference">Living reference</a>
            <a href="#audit">Audit &amp; artifacts</a>
          </div>
        </nav>

        <div className="hero-layout">
          <div className="hero-statement">
            <p className="kicker">Accepted revision {String(snapshot.acceptedRevision)}</p>
            <h1>See the interface your users’ agents see.</h1>
            <p className="hero-deck">
              Inspect the exact registration surface, enrich it with durable documentation,
              audit changes, and export the evidence—without hiding the human decision.
            </p>
          </div>

          <aside className="agent-console" aria-label="Agent tool status and golden prompt">
            <div className={`system-status system-status--${webMcp.tone}`} aria-live="polite">
              <span className="system-status__label">{webMcp.label}</span>
              <span>{webMcp.detail}</span>
            </div>
            <div className="prompt-block">
              <div className="prompt-block__heading">
                <span>Golden prompt</span>
                <span>Human decisions stay in-page</span>
              </div>
              <p>{GOLDEN_PROMPT}</p>
              <CopyAction label="Copy prompt" text={GOLDEN_PROMPT} />
            </div>
          </aside>
        </div>
      </header>

      <main>
        <section className="workbench-section catalog-section" id="catalog">
          <header className="section-heading">
            <div>
              <p className="section-index">01 / Catalog</p>
              <h2>Accepted tool contracts</h2>
            </div>
            <p>
              This is the current browser-local source of truth. Selecting a row opens
              its exact registration fields and Second Surface documentation.
            </p>
          </header>

          <div className="catalog-summary" aria-label="Catalog summary">
            <span><strong>{contracts.length}</strong> accepted tools</span>
            <span><strong>{String(snapshot.acceptedRevision)}</strong> accepted revision</span>
            <span><strong>{findings.length}</strong> current findings</span>
          </div>

          {contracts.length ? (
            <ol className="catalog-list">
              {contracts.map((contract, index) => {
                const selected = contract.name === snapshot.selectedToolName
                return (
                  <li key={contract.name}>
                    <button
                      aria-pressed={selected}
                      className="catalog-row"
                      disabled={busyAction !== null}
                      type="button"
                      onClick={() =>
                        void runOperation(
                          'reference',
                          (signal) => store.getToolContract({ toolName: contract.name }, { signal }),
                          `Opened ${contract.name}.`,
                        )
                      }
                    >
                      <span className="catalog-row__number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="catalog-row__identity">
                        <strong>{contractTitle(contract)}</strong>
                        <code>{contract.name}</code>
                      </span>
                      <span className="catalog-row__summary">{contractSummary(contract)}</span>
                      <span className="catalog-row__action">
                        {selected ? 'Open now' : 'Inspect'} <span aria-hidden="true">→</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="empty-state">
              <strong>No accepted contracts are visible yet.</strong>
              <span>The visual catalog remains usable even when WebMCP is unavailable.</span>
              <button
                className="action action--primary"
                disabled={busyAction !== null}
                type="button"
                onClick={() =>
                  void runOperation(
                    'catalog',
                    (signal) => store.listToolContracts({ signal }),
                    'Catalog loaded.',
                  )
                }
              >
                Load catalog
              </button>
            </div>
          )}
        </section>

        <section className="workbench-section reference-section" id="reference">
          <header className="section-heading">
            <div>
              <p className="section-index">02 / Living reference</p>
              <h2>{selectedContract ? contractTitle(selectedContract) : 'Select a tool to inspect'}</h2>
              {selectedContract ? <code className="selected-tool-name">{selectedContract.name}</code> : null}
            </div>
            <p>
              Native registration metadata is separated from richer lifecycle and output
              documentation so an agent-facing claim never masquerades as a browser field.
            </p>
          </header>

          {selectedContract ? (
            <div className="reference-layout">
              <ReferenceBlock
                title="Exact registration metadata"
                value={nativeRegistrationMetadata(selectedContract)}
              />
              <ReferenceBlock title="Input schema" value={selectedContract.inputSchema} />
              <ReferenceBlock title="Annotations" value={selectedContract.annotations} />
              <ReferenceBlock
                extension
                title="Output schema and result documentation"
                value={selectedContract.outputDocumentation ?? selectedContract.outputSchema}
              />
              <ReferenceBlock
                extension
                title="Side effects"
                value={extensionValue(selectedContract, 'sideEffects', 'sideEffect')}
              />
              <ReferenceBlock
                extension
                title="Examples"
                value={extensionValue(selectedContract, 'examples')}
              />
              <ReferenceBlock
                extension
                title="Errors"
                value={extensionValue(selectedContract, 'errors')}
              />
              <ReferenceBlock
                extension
                title="States"
                value={extensionValue(selectedContract, 'states', 'allowedStates', 'transitions')}
              />
              <ReferenceBlock
                extension
                title="Prerequisites"
                value={extensionValue(
                  selectedContract,
                  'prerequisites',
                  'prereqs',
                  'humanPrerequisite',
                )}
              />
              <ReferenceBlock
                extension
                title="Privacy"
                value={extensionValue(selectedContract, 'privacy')}
              />
            </div>
          ) : (
            <div className="empty-state empty-state--dark">
              Choose an accepted contract above. No agent tooling is required to read it here.
            </div>
          )}
        </section>

        <section className="workbench-section audit-section" id="audit">
          <header className="section-heading">
            <div>
              <p className="section-index">03 / Audit, diff &amp; artifacts</p>
              <h2>Evidence before acceptance</h2>
            </div>
            <p>
              Audits can propose and explain a revision. Only the visible human controls
              below can accept or reject it.
            </p>
          </header>

          <div className="audit-actions">
            <button
              className="action action--primary"
              disabled={busyAction !== null}
              type="button"
              onClick={() =>
                void runOperation(
                  'audit',
                  (signal) => store.auditToolContracts({ signal }),
                  'Audit complete.',
                )
              }
            >
              {busyAction === 'audit' ? 'Auditing…' : 'Run catalog audit'}
            </button>
            <button
              className="action action--quiet"
              disabled={busyAction !== null}
              type="button"
              onClick={() =>
                void runOperation(
                  'artifacts',
                  (signal) => store.previewContractBundle({ signal }),
                  'Artifact preview ready.',
                )
              }
            >
              {busyAction === 'artifacts' ? 'Building preview…' : 'Preview artifact bundle'}
            </button>
          </div>

          <div className="audit-grid">
            <section className="audit-findings" aria-labelledby="findings-title">
              <header className="subsection-heading">
                <div>
                  <p className="micro-label">Audit report</p>
                  <h3 id="findings-title">Findings</h3>
                </div>
                <span>{snapshot.auditHasRun ? `${findings.length} found` : 'Not run'}</span>
              </header>
              {snapshot.auditHasRun ? (
                findings.length ? (
                  <ol className="finding-list">
                    {findings.map((finding, index) => (
                      <li
                        className={`finding finding--${finding.severity.toLowerCase()}`}
                        key={`${finding.rule ?? finding.code ?? 'finding'}-${finding.toolName ?? 'catalog'}-${finding.field}-${index}`}
                      >
                        <div className="finding__meta">
                          <span className="finding__severity">{finding.severity}</span>
                          <code>{finding.rule ?? finding.code ?? 'UNNAMED_RULE'}</code>
                        </div>
                        <p>{finding.message}</p>
                        <span className="finding__location">
                          {finding.toolName ?? 'catalog'} / {finding.field}
                        </span>
                        {finding.recommendation ? (
                          <span className="finding__recommendation">
                            Next: {finding.recommendation}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="empty-state">
                    <strong>No findings.</strong>
                    <span>The accepted catalog passed the current audit rules.</span>
                  </div>
                )
              ) : (
                <div className="empty-state">
                  Run the audit to inspect exact registration and documentation fields.
                </div>
              )}
            </section>

            <section className="pending-review" aria-labelledby="pending-title">
              <header className="subsection-heading">
                <div>
                  <p className="micro-label">Human decision</p>
                  <h3 id="pending-title">Pending revision</h3>
                </div>
                <span>{pendingRevision ? 'Decision required' : 'None pending'}</span>
              </header>
              {pendingRevision ? (
                <>
                  <div className="pending-summary">
                    <code>{pendingRevision.toolName}</code>
                    <p>{pendingRevision.rationale}</p>
                    <dl>
                      <div>
                        <dt>Current findings</dt>
                        <dd>{pendingRevision.currentFindingCount}</dd>
                      </div>
                      <div>
                        <dt>Projected findings</dt>
                        <dd>{pendingRevision.projectedFindingCount}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="diff-grid" aria-label="Pending contract diff">
                    <div>
                      <p className="micro-label">Before / accepted</p>
                      <JsonBlock value={pendingRevision.before} />
                    </div>
                    <div>
                      <p className="micro-label">After / proposed</p>
                      <JsonBlock value={pendingRevision.after} />
                    </div>
                  </div>
                  <div className="human-actions" aria-label="Human-only revision decision">
                    <span>Only you can decide</span>
                    <button
                      className="action action--accept"
                      disabled={busyAction !== null}
                      type="button"
                      onClick={() =>
                        void runHumanAction(
                          'accept',
                          () => store.human.acceptPendingRevision(),
                          'Pending revision accepted. The accepted catalog and revision changed.',
                        )
                      }
                    >
                      {busyAction === 'accept' ? 'Accepting…' : 'Accept this revision'}
                    </button>
                    <button
                      className="action action--reject"
                      disabled={busyAction !== null}
                      type="button"
                      onClick={() =>
                        void runHumanAction(
                          'reject',
                          () => store.human.rejectPendingRevision(),
                          'Pending revision rejected; accepted catalog unchanged.',
                        )
                      }
                    >
                      {busyAction === 'reject' ? 'Rejecting…' : 'Reject this revision'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  Audit proposals appear here with their real before-and-after contracts.
                </div>
              )}
            </section>
          </div>

          <section className="artifact-workbench" aria-labelledby="artifact-title">
            <header className="subsection-heading">
              <div>
                <p className="micro-label">Generated from accepted revision</p>
                <h3 id="artifact-title">Artifact bundle</h3>
              </div>
              <span>{snapshot.artifactBundle ? 'Preview ready' : 'No preview yet'}</span>
            </header>

            <div className="artifact-tabs" role="tablist" aria-label="Artifact formats">
              {ARTIFACT_KINDS.map((kind) => (
                <button
                  aria-controls="artifact-panel"
                  aria-selected={activeArtifact === kind}
                  className="artifact-tab"
                  id={`artifact-tab-${kind}`}
                  key={kind}
                  role="tab"
                  type="button"
                  onClick={() => store.setActiveArtifact(kind)}
                >
                  {kind === 'contractJson'
                    ? 'Contract JSON'
                    : kind === 'openApi'
                      ? 'OpenAPI'
                      : kind[0].toUpperCase() + kind.slice(1)}
                </button>
              ))}
            </div>

            <div
              aria-labelledby={`artifact-tab-${activeArtifact}`}
              className="artifact-panel"
              id="artifact-panel"
              role="tabpanel"
              tabIndex={0}
            >
              {activeArtifactValue === undefined ? (
                <div className="empty-state empty-state--dark">
                  Preview the bundle to inspect this artifact without downloading it.
                </div>
              ) : (
                <>
                  <div className="artifact-actions">
                    <CopyAction label="Copy artifact" text={artifactText} />
                    <button
                      className="action action--quiet"
                      type="button"
                      onClick={() =>
                        downloadText(
                          artifactFilename(activeArtifact),
                          artifactText,
                          activeArtifact === 'markdown'
                            ? 'text/markdown;charset=utf-8'
                            : 'application/json;charset=utf-8',
                        )
                      }
                    >
                      Download artifact
                    </button>
                  </div>
                  <pre className="artifact-code">{artifactText}</pre>
                </>
              )}
            </div>
          </section>

          <footer className="workbench-footer">
            <p>
              Browser-local catalog. Audits may propose; agents may inspect; only the
              visible human interface can accept a revision.
            </p>
            <button className="reset-action" type="button" onClick={resetCatalog}>
              Reset local catalog
            </button>
          </footer>
        </section>
      </main>

      {notice ? (
        <div className="notice" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
    </div>
  )
}
