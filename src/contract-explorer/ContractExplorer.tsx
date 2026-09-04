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
  'Audit the loaded Port Authority manifest. List the WebMCP tools, run the deterministic contract inspection, and inspect propose_contract_revision. If the declared data confirms that its example uses a string where baseRevision requires an integer, stage the smallest bounded revision that changes "1" to 1. Do not infer runtime behavior and do not grant your own clearance.'

const FOLLOW_UP_PROMPT =
  'Reinspect the cleared manifest, report the remaining finding count, and open the four accepted artifact projections. Confirm whether the repaired example now matches its declared schema.'

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

interface ChangedField {
  readonly path: string
  readonly before: unknown
  readonly after: unknown
}

function collectChangedFields(
  before: unknown,
  after: unknown,
  path = '',
): ChangedField[] {
  if (serialize(before) === serialize(after)) return []

  if (Array.isArray(before) && Array.isArray(after)) {
    const length = Math.max(before.length, after.length)
    return Array.from({ length }, (_, index) =>
      collectChangedFields(before[index], after[index], `${path}[${index}]`),
    ).flat()
  }

  const beforeRecord = asRecord(before)
  const afterRecord = asRecord(after)
  if (beforeRecord && afterRecord) {
    return [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])]
      .sort()
      .flatMap((key) =>
        collectChangedFields(
          beforeRecord[key],
          afterRecord[key],
          path ? `${path}.${key}` : key,
        ),
      )
  }

  return [{ path: path || '$', before, after }]
}

function revisionOf(value: unknown): string {
  const revision = asRecord(value)?.revision
  return typeof revision === 'number' ? String(revision) : '—'
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  const record = asRecord(error)
  if (record && typeof record.message === 'string') return record.message
  return 'The operation did not complete.'
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre aria-label="JSON documentation" className="json-block" tabIndex={0}>{serialize(value)}</pre>
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
      return 'port-authority-registration.json'
    case 'contractJson':
      return 'port-authority-manifest.json'
    case 'markdown':
      return 'port-authority-deck-notes.md'
    case 'openApi':
      return 'port-authority-openapi-chart.json'
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
        label: 'Agent channel open',
        detail: `${status.registeredToolCount} berths registered from the accepted manifest`,
        tone: 'success',
      }
    case 'registering':
      return {
        label: 'Opening agent channel',
        detail: 'The visual workbench remains fully available.',
        tone: 'active',
      }
    case 'unsupported':
      return {
        label: 'Harbor desk only',
        detail: 'This browser has no WebMCP support; catalog, audit, and artifacts still work.',
        tone: 'warning',
      }
    case 'error':
      return {
        label: 'Harbor desk only',
        detail: status.error ?? 'Agent tools could not be registered.',
        tone: 'warning',
      }
    default:
      return {
        label: 'Checking agent channel',
        detail: 'Loading the accepted manifest in the browser.',
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
        <span>{extension ? 'Port Authority documentation' : 'Native registerTool field'}</span>
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
    if (!window.confirm('Reset the accepted Port Authority manifest in this browser?')) {
      return
    }
    store.human.resetCatalog()
    setNotice('Browser-local catalog reset.')
  }

  const artifactText = serialize(activeArtifactValue)
  const manifestCleared = !findings.some(
    (finding) =>
      finding.code === 'INVALID_EXAMPLE' &&
      finding.toolName === 'propose_contract_revision',
  )
  const harborPrompt = manifestCleared ? FOLLOW_UP_PROMPT : GOLDEN_PROMPT
  const statusLine = `${String(contracts.length).padStart(2, '0')} BERTHS / ${String(findings.length).padStart(2, '0')} FLAGS / REV ${String(snapshot.acceptedRevision).padStart(2, '0')} / ${webMcpStatus.phase === 'ready' ? 'AGENT CHANNEL OPEN' : 'HARBOR DESK ONLY'}`
  const pendingChanges = pendingRevision
    ? collectChangedFields(pendingRevision.before, pendingRevision.after).filter(
        (change) => change.path !== 'revision',
      )
    : []

  return (
    <div className="workbench-shell">
      <a className="skip-link" href="#harbor-map">
        Skip to harbor map
      </a>

      <header className="workbench-hero">
        <nav className="top-nav" aria-label="Port Authority sections">
          <a className="brand-lockup" href="#top" id="top">
            <span className="brand-mark" aria-hidden="true">PA</span>
            <span className="brand-type">
              <strong>PORT AUTHORITY</strong>
              <small>The harbor master for WebMCP.</small>
            </span>
          </a>
          <div className="top-nav__links">
            <a href="#harbor-map">Harbor map</a>
            <a href="#customs">Customs</a>
            <a href="#dry-dock">Dry dock</a>
            <a href="#ships-papers">Ship’s papers</a>
          </div>
        </nav>

        <p className="harbor-status" aria-label="Current harbor status">{statusLine}</p>

        <div className="hero-layout">
          <div className="hero-statement">
            <p className="kicker">No agent docks on vibes.</p>
            <h1>PORT<br />AUTHORITY</h1>
            <p className="hero-deck">
              The harbor master for WebMCP. Inspect every declared tool contract,
              redline a bounded repair, require human clearance, then export the papers.
            </p>
            <div className="hero-actions">
              <button
                className="action action--primary"
                disabled={busyAction !== null}
                type="button"
                onClick={() => {
                  const customs = document.getElementById('customs')
                  if (typeof customs?.scrollIntoView === 'function') {
                    customs.scrollIntoView({ behavior: 'smooth' })
                  }
                  void runOperation(
                    'audit',
                    (signal) => store.auditToolContracts({ signal }),
                    'Contract inspection complete.',
                  )
                }}
              >
                Inspect the manifest
              </button>
              <CopyAction label="Copy harbor prompt" text={harborPrompt} />
            </div>
          </div>

          <aside className="agent-console" aria-label="Manifest defect and agent channel">
            <div className={`system-status system-status--${webMcp.tone}`} aria-live="polite">
              <span className="system-status__label">{webMcp.label}</span>
              <span>{webMcp.detail}</span>
            </div>
            <div className={`defect-signal ${manifestCleared ? 'defect-signal--cleared' : ''}`}>
              <div className="prompt-block__heading">
                <span>{manifestCleared ? 'Clearance recorded' : 'Concrete defect'}</span>
                <span>{manifestCleared ? '05 flags remain' : 'INVALID_EXAMPLE'}</span>
              </div>
              <code>
                <del>baseRevision: "1"</del>
                <span aria-hidden="true">→</span>
                <ins>baseRevision: 1</ins>
              </code>
              <p>
                {manifestCleared
                  ? 'Accepted revision now matches the declared integer schema.'
                  : 'One declared example contradicts its integer input schema. The agent may stage the redline; only a human may clear it.'}
              </p>
            </div>
          </aside>
        </div>

        <ol className="harbor-route" aria-label="Port Authority route">
          {['Arrive', 'Inspect', 'Redline', 'Clear', 'Export'].map((step, index) => (
            <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>
          ))}
        </ol>
      </header>

      <main>
        <section className="workbench-section catalog-section" id="harbor-map">
          <header className="section-heading">
            <div>
              <p className="section-index">01 / Harbor map</p>
              <h2>Five berths. One accepted manifest.</h2>
            </div>
            <p>
              Each berth is one registered WebMCP tool. Follow the lane from inspection
              to a bounded redline; clearance stays with the human on the dock.
            </p>
          </header>

          <div className="catalog-summary" aria-label="Catalog summary">
            <span><strong>{contracts.length}</strong> occupied berths</span>
            <span><strong>{String(snapshot.acceptedRevision)}</strong> manifest revision</span>
            <span><strong>{findings.length}</strong> declared flags</span>
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
                        {selected ? 'Berth open' : 'Inspect'} <span aria-hidden="true">→</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <div className="empty-state">
              <strong>No accepted contracts are berthed yet.</strong>
              <span>The visible harbor desk remains usable even when WebMCP is unavailable.</span>
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
                Load manifest
              </button>
            </div>
          )}
        </section>

        <section className="workbench-section reference-section" id="registration">
          <header className="section-heading">
            <div>
              <p className="section-index">02 / Registration</p>
              <h2>{selectedContract ? contractTitle(selectedContract) : 'Select a tool to inspect'}</h2>
              {selectedContract ? <code className="selected-tool-name">{selectedContract.name}</code> : null}
            </div>
            <p>
              Live tool metadata is separated from Port Authority documentation extensions,
              so an output schema never masquerades as a native browser field.
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

        <section className="workbench-section audit-section" id="customs">
          <header className="section-heading">
            <div>
              <p className="section-index">03 / Customs inspection</p>
              <h2>Contract audit</h2>
            </div>
            <p className="scope-plate">
              <strong>DECLARED CONTRACT DATA ONLY</strong>
              Cannot prove runtime behavior, side effects, privacy, security, or semantic truth.
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
                  'Contract inspection complete.',
                )
              }
            >
              {busyAction === 'audit' ? 'Inspecting…' : 'Inspect the manifest'}
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
              {busyAction === 'artifacts' ? 'Drafting papers…' : 'Open ship’s papers'}
            </button>
          </div>

          <div className="audit-grid">
            <section className="audit-findings" aria-labelledby="findings-title">
              <header className="subsection-heading">
                <div>
                  <p className="micro-label">Customs inspection</p>
                  <h3 id="findings-title">Contract audit</h3>
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

            <section className="pending-review" id="dry-dock" aria-labelledby="pending-title">
              <header className="subsection-heading">
                <div>
                  <p className="micro-label">04 / Dry dock · Human decision</p>
                  <h3 id="pending-title">Bounded redline</h3>
                </div>
                <span>{pendingRevision ? 'Clearance required' : 'No ship in dry dock'}</span>
              </header>
              {pendingRevision ? (
                <>
                  <div className="pending-summary">
                    <code>{pendingRevision.toolName}</code>
                    <p>{pendingRevision.rationale}</p>
                    <dl>
                      <div>
                        <dt>Base revision</dt>
                        <dd>{revisionOf(pendingRevision.before)}</dd>
                      </div>
                      <div>
                        <dt>Proposed revision</dt>
                        <dd>{revisionOf(pendingRevision.after)}</dd>
                      </div>
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
                  <div className="diff-grid" aria-label="Exact changed fields">
                    <p className="micro-label">Exact changed fields</p>
                    {pendingChanges.length ? (
                      <table className="diff-table">
                        <thead>
                          <tr><th>Field</th><th>Accepted</th><th>Proposed</th></tr>
                        </thead>
                        <tbody>
                          {pendingChanges.map((change) => (
                            <tr key={change.path}>
                              <th><code>{change.path}</code></th>
                              <td><del>{serialize(change.before)}</del></td>
                              <td><ins>{serialize(change.after)}</ins></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>No changed contract fields were detected.</p>
                    )}
                    <details>
                      <summary>Full accepted contract</summary>
                      <JsonBlock value={pendingRevision.before} />
                    </details>
                    <details>
                      <summary>Full proposed contract</summary>
                      <JsonBlock value={pendingRevision.after} />
                    </details>
                  </div>
                  <div className="human-actions" aria-label="Human-only revision decision">
                    <span>Human clearance only</span>
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
                      {busyAction === 'accept' ? 'Granting…' : (
                        <><strong>Grant clearance</strong><small>Accept this exact revision</small></>
                      )}
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
                      {busyAction === 'reject' ? 'Returning…' : (
                        <><strong>Return to shipper</strong><small>Reject without changing registry</small></>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  A valid agent redline will dock here for an exact human decision.
                </div>
              )}
            </section>
          </div>

          <section className="artifact-workbench" id="ships-papers" aria-labelledby="artifact-title">
            <header className="subsection-heading">
              <div>
                <p className="micro-label">05 / Ship’s papers · Accepted source only</p>
                <h3 id="artifact-title">Four synchronized projections</h3>
              </div>
              <span>
                {snapshot.artifactBundle
                  ? manifestCleared ? 'Cleared manifest' : 'Uncleared manifest'
                  : 'Papers not opened'}
              </span>
            </header>

            <div className="artifact-tabs" role="tablist" aria-label="Artifact formats">
              {ARTIFACT_KINDS.map((kind, index) => (
                <button
                  aria-controls="artifact-panel"
                  aria-selected={activeArtifact === kind}
                  className="artifact-tab"
                  id={`artifact-tab-${kind}`}
                  key={kind}
                  role="tab"
                  tabIndex={activeArtifact === kind ? 0 : -1}
                  type="button"
                  onClick={() => store.setActiveArtifact(kind)}
                  onKeyDown={(event) => {
                    let nextIndex: number | null = null
                    if (event.key === 'ArrowRight') nextIndex = (index + 1) % ARTIFACT_KINDS.length
                    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + ARTIFACT_KINDS.length) % ARTIFACT_KINDS.length
                    if (event.key === 'Home') nextIndex = 0
                    if (event.key === 'End') nextIndex = ARTIFACT_KINDS.length - 1
                    if (nextIndex === null) return
                    event.preventDefault()
                    const nextKind = ARTIFACT_KINDS[nextIndex]
                    store.setActiveArtifact(nextKind)
                    window.requestAnimationFrame(() =>
                      document.getElementById(`artifact-tab-${nextKind}`)?.focus(),
                    )
                  }}
                >
                  {kind === 'registration'
                    ? 'REGISTRATION'
                    : kind === 'contractJson'
                      ? 'MANIFEST.JSON'
                      : kind === 'markdown'
                        ? 'DECK NOTES.MD'
                        : 'OPENAPI CHART'}
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
                  Open the ship’s papers to inspect accepted artifacts without downloading them.
                </div>
              ) : (
                <>
                  <div className="artifact-clearance">
                    <strong>{manifestCleared ? 'CLEARED MANIFEST' : 'UNCLEARED MANIFEST'}</strong>
                    <span>
                      {activeArtifact === 'registration'
                        ? 'Live tool metadata'
                        : activeArtifact === 'contractJson'
                          ? 'Canonical contract registry'
                          : activeArtifact === 'markdown'
                            ? 'Human reference'
                            : 'DOCUMENTATION CHART. NO NETWORK ENDPOINT.'}
                    </span>
                  </div>
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
              <strong>MJ / open_sourceress</strong>
              <span>Computing is a medium. This is my red pen.</span>
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
