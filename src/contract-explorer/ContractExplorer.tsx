import {
  CONTRACT_ERRORS,
  DISCLOSURE_MODEL,
  DOMAIN_MODEL,
  HUMAN_ONLY_CAPABILITIES,
  WEBMCP_TOOL_CONTRACTS,
  WORKFLOW_INVARIANTS,
  WORKFLOW_STATES,
  type ContractErrorCode,
  type JsonSchema,
} from '../contracts'

function JsonBlock({ value }: { value: JsonSchema | object }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>
}

function ErrorList({ codes }: { codes: readonly ContractErrorCode[] }) {
  return (
    <ul className="error-list">
      {codes.map((code) => (
        <li key={code}>
          <code>{code}</code>
          <span>{CONTRACT_ERRORS[code].summary}</span>
        </li>
      ))}
    </ul>
  )
}

export function ContractExplorer() {
  return (
    <div className="explorer-shell">
      <header className="explorer-hero">
        <nav className="top-nav" aria-label="Contract Explorer">
          <a className="wordmark" href="./">
            Permission Slip
          </a>
          <div>
            <a href="#tools">Tools</a>
            <a href="#workflow">Workflow</a>
            <a href="#privacy">Privacy</a>
            <a href="https://github.com/villagealchemist/permission-slip-webmcp">
              Source
            </a>
          </div>
        </nav>

        <div className="hero-grid">
          <div>
            <p className="kicker">Canonical contract registry · v0.1</p>
            <h1>Every capability.<br />Every boundary.</h1>
          </div>
          <div className="hero-copy">
            <p>
              A human-readable view of the same metadata and JSON Schemas used
              to register Permission Slip’s five browser tools.
            </p>
            <div className="hero-facts" aria-label="Contract facts">
              <span><strong>5</strong> site tools</span>
              <span><strong>4</strong> human-only controls</span>
              <span><strong>0</strong> network endpoints</span>
            </div>
          </div>
        </div>

        <div className="projection-note">
          <span aria-hidden="true">i</span>
          <p>
            This explorer documents in-page WebMCP operations registered through{' '}
            <code>document.modelContext</code>. The OpenAPI artifact is a
            documentation projection, not an HTTP API.
          </p>
        </div>
      </header>

      <main>
        <section className="section" id="tools">
          <div className="section-heading">
            <div>
              <p className="section-index">01 / Tool surface</p>
              <h2>Five narrow operations</h2>
            </div>
            <p>
              Registration metadata, inputs, outputs, examples, errors, state
              transitions, and privacy notes come from one TypeScript registry.
            </p>
          </div>

          <div className="tool-index" aria-label="Tool index">
            {WEBMCP_TOOL_CONTRACTS.map((contract, index) => (
              <a href={`#tool-${contract.name}`} key={contract.name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <code>{contract.name}</code>
              </a>
            ))}
          </div>

          <div className="tool-stack">
            {WEBMCP_TOOL_CONTRACTS.map((contract, index) => (
              <article
                className="tool-card"
                id={`tool-${contract.name}`}
                key={contract.name}
              >
                <div className="tool-card__header">
                  <div className="tool-number">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="tool-title">
                    <div className="badge-row">
                      <span className={`badge ${contract.readOnly ? 'is-read' : 'is-write'}`}>
                        {contract.readOnly ? 'Read' : 'Local write'}
                      </span>
                      <span className="badge">{contract.sideEffect}</span>
                      {contract.humanApprovalRequired ? (
                        <span className="badge is-approval">Human approval required</span>
                      ) : null}
                      <span className="badge">No network</span>
                    </div>
                    <p className="tool-summary">{contract.summary}</p>
                    <h3>{contract.title}</h3>
                    <code className="tool-name">{contract.name}</code>
                    <p>{contract.description}</p>
                  </div>
                </div>

                <div className="contract-grid">
                  <div>
                    <p className="micro-heading">Successful states</p>
                    <div className="state-list">
                      {contract.allowedStates.map((state) => (
                        <code key={state}>{state}</code>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="micro-heading">Human prerequisite</p>
                    <p>{contract.humanPrerequisite ?? 'None before invocation.'}</p>
                  </div>
                  <div>
                    <p className="micro-heading">Data disclosed</p>
                    <p>{contract.privacy.dataDisclosed}</p>
                  </div>
                  <div>
                    <p className="micro-heading">Local persistence</p>
                    <p>{contract.privacy.dataPersisted}</p>
                  </div>
                </div>

                <div className="transition-row">
                  {contract.transitions.map((transition) => (
                    <div
                      className="transition"
                      key={`${transition.from}-${transition.to}`}
                      title={transition.condition}
                    >
                      <code>{transition.from}</code>
                      <span aria-hidden="true">→</span>
                      <code>{transition.to}</code>
                    </div>
                  ))}
                </div>

                <div className="details-grid">
                  <details>
                    <summary>Input schema</summary>
                    <JsonBlock value={contract.inputSchema} />
                  </details>
                  <details>
                    <summary>Result schema</summary>
                    <JsonBlock value={contract.outputSchema} />
                  </details>
                  <details>
                    <summary>Examples ({contract.examples.length})</summary>
                    {contract.examples.map((example) => (
                      <div className="example" key={example.title}>
                        <h4>{example.title}</h4>
                        <p>{example.description}</p>
                        <p className="code-label">Input</p>
                        <JsonBlock value={example.input} />
                        <p className="code-label">Result</p>
                        <JsonBlock value={example.result} />
                      </div>
                    ))}
                  </details>
                  <details>
                    <summary>Errors ({contract.errors.length})</summary>
                    <ErrorList codes={contract.errors} />
                  </details>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section section--ink" id="human-only">
          <div className="section-heading">
            <div>
              <p className="section-index">02 / Authority boundary</p>
              <h2>Intentionally not tools</h2>
            </div>
            <p>
              These actions stay in the visible human interface. Their absence
              from the registry is part of the product contract.
            </p>
          </div>
          <div className="human-grid">
            {HUMAN_ONLY_CAPABILITIES.map((capability, index) => (
              <article key={capability.name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{capability.title}</h3>
                <code>{capability.name}</code>
                <p>{capability.reason}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="workflow">
          <div className="section-heading">
            <div>
              <p className="section-index">03 / Workflow</p>
              <h2>Consent as a state machine</h2>
            </div>
            <p>
              An approval is a narrow binding to one frozen snapshot—not a
              reusable permission to submit future edits.
            </p>
          </div>
          <div className="workflow-track" aria-label="Workflow states">
            {WORKFLOW_STATES.map((state, index) => (
              <div key={state}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <code>{state}</code>
              </div>
            ))}
          </div>
          <ol className="invariant-list">
            {WORKFLOW_INVARIANTS.map((invariant) => (
              <li key={invariant}>{invariant}</li>
            ))}
          </ol>
        </section>

        <section className="section section--tint" id="privacy">
          <div className="section-heading">
            <div>
              <p className="section-index">04 / Disclosure</p>
              <h2>A deliberately small data model</h2>
            </div>
            <p>
              Required fields serve the inquiry. Optional fields need separate
              authorization. Unrelated categories never enter the model.
            </p>
          </div>
          <div className="disclosure-grid">
            <div>
              <p className="disclosure-label">Required</p>
              {DISCLOSURE_MODEL.required.map((field) => (
                <article key={field.name}>
                  <code>{field.name}</code>
                  <p>{field.description}</p>
                </article>
              ))}
            </div>
            <div>
              <p className="disclosure-label">Human-optional</p>
              {DISCLOSURE_MODEL.optional.map((field) => (
                <article key={field.name}>
                  <code>{field.name}</code>
                  <p>{field.description}</p>
                </article>
              ))}
            </div>
            <div>
              <p className="disclosure-label">Never collected</p>
              {DISCLOSURE_MODEL.neverCollected.map((field) => (
                <article key={field.name}>
                  <code>{field.name}</code>
                  <p>{field.reason}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="errors">
          <div className="section-heading">
            <div>
              <p className="section-index">05 / Failure contract</p>
              <h2>Errors explain recovery</h2>
            </div>
            <p>
              Rejections remain distinguishable from success and provide a
              constrained next step. Cancellation is surfaced separately as an
              abort rather than a structured failure.
            </p>
          </div>
          <div className="taxonomy">
            {Object.values(CONTRACT_ERRORS).map((error) => (
              <article key={error.code}>
                <div>
                  <code>{error.code}</code>
                  <span>{error.source}</span>
                </div>
                <p>{error.summary}</p>
                <small>{error.recovery}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="section section--domain" id="domain">
          <div className="section-heading">
            <div>
              <p className="section-index">06 / Domain model</p>
              <h2>The types behind the boundary</h2>
            </div>
            <p>
              These framework-neutral concepts let the UI and WebMCP adapter
              invoke one state engine without duplicating consent rules.
            </p>
          </div>
          <div className="domain-grid">
            {DOMAIN_MODEL.map((item) => (
              <article key={item.name}>
                <code>{item.name}</code>
                <p>{item.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section section--architecture" id="architecture">
          <div className="section-heading">
            <div>
              <p className="section-index">07 / Architecture</p>
              <h2>One engine, two callers</h2>
            </div>
            <p>
              React and WebMCP share the same live store and domain operations.
              The contract registry describes the tool boundary without gaining
              authority over approval.
            </p>
          </div>
          <div className="architecture-flow">
            <div><span>Human</span><strong>React UI</strong></div>
            <div><span>Agent</span><strong>WebMCP adapter</strong></div>
            <b aria-hidden="true">↓</b>
            <div className="is-wide"><span>Shared</span><strong>Permission Slip store</strong></div>
            <b aria-hidden="true">↓</b>
            <div className="is-wide"><span>Authoritative</span><strong>Domain state machine</strong></div>
            <b aria-hidden="true">↓</b>
            <div className="is-wide"><span>Browser-local</span><strong>Versioned localStorage</strong></div>
          </div>
          <p className="architecture-coda">
            The SHA-256 digest detects snapshot changes. It does not prove human
            identity, and localStorage is not tamper-proof.
          </p>
        </section>
      </main>

      <footer>
        <a href="./">Open the demo</a>
        <p>Fictional data only · Browser-only · No submission network request</p>
      </footer>
    </div>
  )
}
