import { useEffect, useMemo, useState } from 'react'
import {
  NEVER_COLLECTED_DEFINITIONS,
  OPTIONAL_FIELD_DEFINITIONS,
  REQUIRED_FIELD_DEFINITIONS,
  validateCompleteDraft,
  type IntakeFieldName,
  type OptionalFieldName,
  type WorkflowStatus,
} from './domain'
import { CopyButton } from './components/CopyButton'
import { IntakeForm, type FieldProvenance } from './components/IntakeForm'
import { Panel, SectionHeading, StatusPill } from './components/Primitives'
import {
  ActivityPanel,
  DisclosureToggle,
  ReceiptPanel,
  ReviewPanel,
} from './components/WorkflowPanels'
import {
  getDefaultPermissionSlipStore,
  type PermissionSlipStore,
  usePermissionSlipStore,
} from './store'
import {
  createPermissionSlipWebMcpController,
  createStoreWebMcpAdapter,
  type WebMcpRegistrationStatus,
} from './webmcp'

const DEMO_PROMPT =
  'Help me prepare an inquiry for a 20-person creative coding and mentorship workshop on October 10, 2026. My name is Maya Chen and my email is maya.chen@example.com. The goal is to pair early-career developers with local mentors for a collaborative workshop. My phone is 215-555-0134, but use only information the site says is required or currently authorized. Prepare the inquiry for my review, but do not submit it until I approve the exact disclosure in the page.'

const FICTIONAL_DRAFT = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  eventType: 'Creative coding and mentorship workshop',
  preferredDate: '2026-10-10',
  estimatedAttendeeCount: 20,
  eventGoal:
    'Pair early-career developers with local mentors for a collaborative workshop',
} as const

const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  empty: 'Empty',
  draft: 'Draft in progress',
  review_pending: 'Awaiting human review',
  approved: 'Human approved',
  submitted: 'Submitted locally',
}

const STEP_INDEX: Record<WorkflowStatus, number> = {
  empty: 0,
  draft: 0,
  review_pending: 1,
  approved: 2,
  submitted: 3,
}

const EMPTY_WEBMCP_STATUS: WebMcpRegistrationStatus = {
  phase: 'idle',
  supported: false,
  registeredToolCount: 0,
}

function webMcpPresentation(status: WebMcpRegistrationStatus): {
  label: string
  detail: string
  tone: 'neutral' | 'active' | 'success' | 'warning'
} {
  switch (status.phase) {
    case 'ready':
      return {
        label: 'WebMCP ready',
        detail: `${status.registeredToolCount} of 5 site tools registered`,
        tone: 'success',
      }
    case 'registering':
      return {
        label: 'Registering tools',
        detail: 'Imperative top-level registration in progress',
        tone: 'active',
      }
    case 'error':
      return {
        label: 'WebMCP error',
        detail: status.error ?? 'Registration was not completed',
        tone: 'warning',
      }
    case 'unsupported':
      return {
        label: 'Form-only mode',
        detail: 'WebMCP is unavailable; every human control still works',
        tone: 'warning',
      }
    default:
      return {
        label: 'Checking WebMCP',
        detail: 'The form remains usable in every browser',
        tone: 'neutral',
      }
  }
}

function resultMessage(
  result: { ok: true } | { ok: false; error: { message: string } },
  success: string,
): string {
  return result.ok ? success : result.error.message
}

interface AppProps {
  store?: PermissionSlipStore
}

export function App({ store: suppliedStore }: AppProps = {}) {
  const store = useMemo(
    () => suppliedStore ?? getDefaultPermissionSlipStore(),
    [suppliedStore],
  )
  const state = usePermissionSlipStore(store)
  const webMcpAdapter = useMemo(() => createStoreWebMcpAdapter(store), [store])
  const [webMcpStatus, setWebMcpStatus] = useState(EMPTY_WEBMCP_STATUS)
  const [busy, setBusy] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const controller = createPermissionSlipWebMcpController({
      getAdapter: () => webMcpAdapter,
      onStatusChange: setWebMcpStatus,
    })
    void controller.start()
    return () => controller.stop()
  }, [webMcpAdapter])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const validation = validateCompleteDraft(state.draft)
  const validationErrors = Object.fromEntries(
    (showValidation ? validation.issues : []).map((issue) => [
      issue.field,
      issue.message,
    ]),
  ) as Partial<Record<IntakeFieldName, string>>
  const provenance = Object.fromEntries(
    Object.entries(state.fieldProvenance).map(([field, value]) => [
      field,
      value?.actor,
    ]),
  ) as FieldProvenance
  const latestReceipt = state.receipts.at(-1)
  const webMcp = webMcpPresentation(webMcpStatus)
  const currentStep = STEP_INDEX[state.status]
  const submitted = state.status === 'submitted'

  function updateField(
    field: IntakeFieldName,
    value: string | number | undefined,
  ): void {
    const result = store.human.updateDraft({ [field]: value })
    if (!result.ok) setNotice(result.error.message)
  }

  function setDisclosure(field: OptionalFieldName, authorized: boolean): void {
    const result = store.human.setOptionalDisclosure(field, authorized)
    setNotice(
      resultMessage(
        result,
        `${authorized ? 'Authorized' : 'Withheld'} ${
          OPTIONAL_FIELD_DEFINITIONS.find((item) => item.name === field)?.label ??
          field
        }. Any older review or approval was cleared.`,
      ),
    )
  }

  function loadFictionalExample(): void {
    const result = store.human.updateDraft(FICTIONAL_DRAFT)
    setShowValidation(false)
    setNotice(
      resultMessage(
        result,
        'Loaded the fictional required fields. Phone remains unauthorized and withheld.',
      ),
    )
  }

  async function prepareReview(): Promise<void> {
    setBusy(true)
    const result = await store.human.prepareSubmissionReview()
    setBusy(false)
    if (!result.ok) {
      setShowValidation(true)
      setNotice(result.error.message)
      return
    }
    setShowValidation(false)
    setNotice('Exact disclosure frozen. Human approval is now required.')
    document.getElementById('review')?.scrollIntoView?.({ block: 'start' })
  }

  function approveReview(): void {
    const review = store.getSnapshot().review
    if (!review) return
    const result = store.human.approveReview({
      reviewId: review.reviewId,
      digest: review.digest,
      revision: review.revision,
    })
    setNotice(
      resultMessage(result, 'Approval recorded for this exact snapshot only.'),
    )
  }

  function returnToEditing(): void {
    const result = store.human.returnToEditing()
    setNotice(
      resultMessage(
        result,
        'Review and approval cleared. The draft is editable again.',
      ),
    )
    document.getElementById('draft')?.scrollIntoView?.({ block: 'start' })
  }

  async function submitLocally(): Promise<void> {
    const review = store.getSnapshot().review
    if (!review) return
    setBusy(true)
    const result = await store.human.submitApprovedIntake(review.reviewId)
    setBusy(false)
    setNotice(
      resultMessage(
        result,
        'Submitted to local storage only. No network transmission occurred.',
      ),
    )
    if (result.ok) {
      document.getElementById('receipt')?.scrollIntoView?.({ block: 'start' })
    }
  }

  function resetDemo(): void {
    if (!window.confirm('Clear this browser’s Permission Slip demo state?')) return
    store.human.reset()
    setShowValidation(false)
    setNotice('Local demo state cleared.')
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <p className="eyebrow">A human-approved WebMCP workflow</p>
          <h1>Permission Slip</h1>
          <p className="tagline">Let the agent help. Keep the final say.</p>
        </div>
        <div className="site-header__status" aria-live="polite">
          <StatusPill label={webMcp.label} tone={webMcp.tone} />
          <StatusPill
            label={WORKFLOW_LABELS[state.status]}
            tone={submitted ? 'success' : state.status === 'empty' ? 'neutral' : 'active'}
          />
          <p className="tool-count">{webMcp.detail}</p>
        </div>
      </header>

      <nav className="progress-rail" aria-label="Permission Slip progress">
        {['Draft', 'Review', 'Approve', 'Receipt'].map((step, index) => (
          <span
            className={`progress-rail__step ${
              index === currentStep
                ? 'is-current'
                : index < currentStep
                  ? 'is-complete'
                  : ''
            }`}
            key={step}
            aria-current={index === currentStep ? 'step' : undefined}
          >
            {String(index + 1).padStart(2, '0')} · {step}
          </span>
        ))}
      </nav>

      <main>
        <Panel tone="dark" className="scenario">
          <div className="scenario__intro">
            <p className="eyebrow">Safe fictional scenario</p>
            <h2>A workshop inquiry, with boundaries.</h2>
            <p>
              Ask an agent to prepare Maya Chen’s fictional event request. The
              phone number starts unauthorized, giving the workflow a privacy
              decision to enforce.
            </p>
          </div>
          <div className="scenario__prompt">
            <div>
              <div className="prompt-label">
                <span>Demo prompt</span>
                <span>Fictional data only</span>
              </div>
              <blockquote className="prompt-copy">“{DEMO_PROMPT}”</blockquote>
            </div>
            <div className="button-row">
              <CopyButton label="Copy agent prompt" text={DEMO_PROMPT} />
              <button
                className="button button--quiet"
                disabled={submitted}
                type="button"
                onClick={loadFictionalExample}
              >
                Load required fields manually
              </button>
            </div>
          </div>
        </Panel>

        <Panel tone="cream">
          <div className="panel__body">
            <SectionHeading
              eyebrow="The boundary"
              title="Required. Optional. Never collected."
              copy="The site—not the agent—defines the smallest useful intake. Optional information needs a separate human decision."
            />
          </div>
          <div className="requirements-grid">
            <div className="requirement-group">
              <h3>
                <span className="requirement-group__mark">R</span> Required
              </h3>
              <ul className="requirements-list">
                {REQUIRED_FIELD_DEFINITIONS.map((field) => (
                  <li key={field.name}>{field.label}</li>
                ))}
              </ul>
            </div>
            <div className="requirement-group">
              <h3>
                <span className="requirement-group__mark">O</span> Human-optional
              </h3>
              <ul className="requirements-list">
                {OPTIONAL_FIELD_DEFINITIONS.map((field) => (
                  <li key={field.name}>{field.label}</li>
                ))}
              </ul>
            </div>
            <div className="requirement-group">
              <h3>
                <span className="requirement-group__mark">×</span> Never collected
              </h3>
              <ul className="requirements-list">
                {NEVER_COLLECTED_DEFINITIONS.map((field) => (
                  <li key={field.name}>{field.label}</li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel tone="cream">
          <div className="panel__body">
            <SectionHeading
              eyebrow="Human-only permissions"
              title="Choose what may be disclosed."
              copy="These switches are deliberately absent from the WebMCP tool surface. An agent can read the decision, but cannot make it."
            />
            <div className="disclosure-list">
              {OPTIONAL_FIELD_DEFINITIONS.map((field) => (
                <DisclosureToggle
                  checked={state.optionalDisclosureAuthorizations[field.name]}
                  disabled={submitted}
                  field={field.name}
                  key={field.name}
                  onChange={setDisclosure}
                />
              ))}
            </div>
            <p className="privacy-note">
              <span className="privacy-note__mark" aria-hidden="true">
                i
              </span>
              Unauthorized optional data causes an agent draft to be rejected as
              one atomic operation. Required fields are not partially applied.
            </p>
          </div>
        </Panel>

        <div className="main-grid">
          <div className="main-column">
            <Panel tone="cream" id="draft">
              <div className="panel__body">
                <SectionHeading
                  eyebrow="01 / Live intake"
                  title="One draft, shared visibly."
                  copy="Edit it yourself or let a site tool draft it. Labels show who last changed each populated field."
                  action={
                    <StatusPill
                      label={`Revision ${state.revision}`}
                      tone={state.revision > 0 ? 'active' : 'neutral'}
                    />
                  }
                />
                <IntakeForm
                  authorizations={state.optionalDisclosureAuthorizations}
                  disabled={submitted || state.status === 'review_pending' || state.status === 'approved'}
                  draft={state.draft}
                  errors={validationErrors}
                  key={`draft-${state.revision}`}
                  provenance={provenance}
                  onChange={updateField}
                />
                <div className="form-footer">
                  <p>
                    Preparing a review computes a digest in your browser. It does
                    not approve or submit anything.
                  </p>
                  <button
                    className="button button--primary"
                    disabled={busy || submitted || state.status === 'review_pending' || state.status === 'approved'}
                    type="button"
                    onClick={() => void prepareReview()}
                  >
                    {busy ? 'Preparing…' : 'Prepare exact review'}
                  </button>
                </div>
              </div>
            </Panel>

            <ReviewPanel
              approval={state.approval}
              busy={busy}
              review={state.review}
              submitted={submitted}
              onApprove={approveReview}
              onReturn={returnToEditing}
              onSubmit={() => void submitLocally()}
            />

            {latestReceipt ? <ReceiptPanel receipt={latestReceipt} /> : null}
          </div>

          <aside className="side-column" aria-label="Workflow detail">
            <ActivityPanel activity={state.activity} />
            <Panel tone="dark">
              <div className="panel__body control-desk">
                <div>
                  <p className="eyebrow">Local control desk</p>
                  <h2>Nothing leaves on submit.</h2>
                  <p>
                    The simulated result and receipt are saved only in this
                    origin’s versioned local storage. No backend, analytics, or
                    submission request exists.
                  </p>
                </div>
                <hr className="control-desk__rule" />
                <button
                  className="button button--danger"
                  type="button"
                  onClick={resetDemo}
                >
                  Reset local demo
                </button>
              </div>
            </Panel>
          </aside>
        </div>
      </main>

      {notice ? (
        <div className="toast" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
    </div>
  )
}
