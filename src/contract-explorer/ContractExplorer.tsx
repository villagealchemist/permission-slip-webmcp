import {
  DISCLOSURE_MODEL,
  HUMAN_ONLY_CAPABILITIES,
  WEBMCP_TOOL_CONTRACTS,
  WORKFLOW_INVARIANTS,
} from '../contracts'

export function ContractExplorer() {
  return (
    <div className="explorer-shell">
      <header className="explorer-hero">
        <nav className="top-nav" aria-label="Inquiry tool reference">
          <a className="wordmark" href="./">
            Permission Slip
          </a>
          <div>
            <a href="#tools">Tools</a>
            <a href="#human-only">Human authority</a>
            <a href="#privacy">Privacy</a>
            <a href="https://github.com/villagealchemist/permission-slip-webmcp">
              Source
            </a>
          </div>
        </nav>

        <div className="hero-grid">
          <div>
            <p className="kicker">Village Alchemist inquiry · judge reference</p>
            <h1>Five useful tools.<br />One human decision.</h1>
          </div>
          <div className="hero-copy">
            <p>
              This page describes only the five in-page operations used by the
              Permission Slip project-inquiry demo and the decisions intentionally
              reserved for its visible interface.
            </p>
            <div className="hero-facts" aria-label="Inquiry reference facts">
              <span><strong>5</strong> site tools</span>
              <span><strong>{HUMAN_ONLY_CAPABILITIES.length}</strong> human-only actions</span>
              <span><strong>0</strong> submission requests</span>
            </div>
          </div>
        </div>

        <div className="projection-note">
          <span aria-hidden="true">i</span>
          <p>
            The tools register only on the top-level page through{' '}
            <code>document.modelContext</code>. They progressively enhance the
            ordinary form and do not create an HTTP API.
          </p>
        </div>
      </header>

      <main>
        <section className="section" id="tools">
          <div className="section-heading">
            <div>
              <p className="section-index">01 / Inquiry tools</p>
              <h2>The complete agent surface</h2>
            </div>
            <p>
              Each operation is specific to this single fictional inquiry flow.
              None can verify a person’s facts, grant permission, or approve.
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
                        {contract.readOnly ? 'Read' : 'Local state change'}
                      </span>
                      <span className="badge">No submission request</span>
                    </div>
                    <h3>{contract.title}</h3>
                    <code className="tool-name">{contract.name}</code>
                    <p>{contract.description}</p>
                  </div>
                </div>

                <div className="contract-grid">
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
                  <div>
                    <p className="micro-heading">Network behavior</p>
                    <p>No inquiry is transmitted. Changes remain in this browser.</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section section--ink" id="human-only">
          <div className="section-heading">
            <div>
              <p className="section-index">02 / Human authority</p>
              <h2>Intentionally absent from the tool list</h2>
            </div>
            <p>
              These actions remain visible and clickable only in the human
              interface. That is the product boundary judges can test directly.
            </p>
          </div>
          <div className="human-grid">
            {HUMAN_ONLY_CAPABILITIES.map((capability, index) => (
              <article key={capability.name}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{capability.title}</h3>
                <p>{capability.reason}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="workflow">
          <div className="section-heading">
            <div>
              <p className="section-index">03 / Review binding</p>
              <h2>Approval applies to one frozen inquiry</h2>
            </div>
            <p>
              Review ID, revision, and digest bind approval to exact content.
              Editing any disclosed value or permission invalidates that review.
            </p>
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
              <h2>Only information needed for this inquiry</h2>
            </div>
            <p>
              Required fields make a response possible. Optional fields stay
              unavailable until the person enables each one in the page.
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
              <p className="disclosure-label">Optional by visible choice</p>
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
      </main>

      <footer>
        <a href="./">Open the demo</a>
        <p>Fictional data only · Browser-only · No submission network request</p>
      </footer>
    </div>
  )
}
