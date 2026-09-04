import { useEffect, useMemo, useState } from 'react'
import {
  OPTIONAL_FIELD_DEFINITIONS,
  validateCompleteDraft,
  type IntakeDraft,
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
  type ContactPermissionsView,
  type InquiryProvenanceView,
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
  'Help me prepare a Village Alchemist project inquiry. My name is Maya Chen and my email is maya.chen@example.com. I want to turn a rough product idea into a working prototype in eight weeks, with a $15,000–$25,000 constraint. The concept and core audience are defined, but the product flow and technical approach still need shaping. I am requesting a 30-minute discovery call and prefer a reply by email. Use the budget only if I enable its visible inclusion control; otherwise omit it. Draft the inquiry for my review, but do not verify my facts, grant permissions, approve it, or submit it for me.'

const FICTIONAL_DRAFT = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  inquiryType: 'prototype',
  desiredOutcome:
    'Turn a rough product idea into a tested, working prototype that is clear enough to demonstrate to partners.',
  relevantBackground:
    'The concept and core audience are defined, but the product flow and technical approach still need to be shaped.',
  timeline: 'Eight weeks, with a flexible start date',
  preferredResponseMethod: 'email',
  requestedNextStep: 'discovery_call',
  budgetOrConstraints: '$15,000–$25,000 total project constraint',
} as const

const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  empty: 'Ready for a project brief',
  draft: 'Inquiry draft in progress',
  review_pending: 'Exact review ready',
  approved: 'Human approved',
  submitted: 'Receipt recorded',
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

const EMPTY_CONTACT_PERMISSIONS: ContactPermissionsView = {
  projectResponse: false,
  occasionalUpdates: false,
}

const DEFAULT_INQUIRY_PROVENANCE: InquiryProvenanceView = {
  entrySource: 'direct',
  referralSource: null,
  campaign: null,
}

function webMcpPresentation(status: WebMcpRegistrationStatus): {
  label: string
  detail: string
  tone: 'neutral' | 'active' | 'success' | 'warning'
} {
  switch (status.phase) {
    case 'ready':
      return {
        label: 'Assistant tools ready',
        detail: `${status.registeredToolCount} site tools can prepare and inspect the inquiry`,
        tone: 'success',
      }
    case 'registering':
      return {
        label: 'Connecting site tools',
        detail: 'The human form remains available while tools register',
        tone: 'active',
      }
    case 'error':
      return {
        label: 'Form-only mode',
        detail: status.error ?? 'Site tools did not register; the human path still works',
        tone: 'warning',
      }
    case 'unsupported':
      return {
        label: 'Form-only mode',
        detail: 'This browser has no WebMCP support; every human control still works',
        tone: 'warning',
      }
    default:
      return {
        label: 'Checking site tools',
        detail: 'You can begin the inquiry immediately',
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

type FocusTarget =
  | 'draft-heading'
  | 'first-invalid-field'
  | 'receipt-heading'
  | 'review-heading'

interface FocusRequest {
  sequence: number
  target: FocusTarget
}

type HumanResult = ReturnType<PermissionSlipStore['human']['updateDraft']>

interface InquiryHumanActions {
  verifyAssistantSuggestions?: () => HumanResult
  setNextStepIntent?: (confirmed: boolean) => HumanResult
  setContactPermission?: (
    permission: keyof ContactPermissionsView,
    granted: boolean,
  ) => HumanResult
}

interface InquiryStateAdditions {
  nextStepIntentConfirmed?: boolean
  contactPermissions?: ContactPermissionsView
  inquiryProvenance?: InquiryProvenanceView
}

export function App({ store: suppliedStore }: AppProps = {}) {
  const store = useMemo(
    () => suppliedStore ?? getDefaultPermissionSlipStore(),
    [suppliedStore],
  )
  const state = usePermissionSlipStore(store)
  const inquiryState = state as typeof state & InquiryStateAdditions
  const inquiryHuman = store.human as typeof store.human & InquiryHumanActions
  const webMcpAdapter = useMemo(() => createStoreWebMcpAdapter(store), [store])
  const [webMcpStatus, setWebMcpStatus] = useState(EMPTY_WEBMCP_STATUS)
  const [busy, setBusy] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)

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

  useEffect(() => {
    if (!focusRequest) return

    const target =
      focusRequest.target === 'first-invalid-field'
        ? (document.querySelector<HTMLElement>(
            '[aria-invalid="true"]:not(:disabled)',
          ) ?? document.getElementById('draft-heading'))
        : document.getElementById(focusRequest.target)

    target?.focus({ preventScroll: true })
    target?.scrollIntoView?.({
      block:
        focusRequest.target === 'first-invalid-field' ? 'center' : 'start',
    })
  }, [focusRequest])

  const validation = validateCompleteDraft(state.draft)
  const validationErrors = Object.fromEntries(
    (showValidation ? validation.issues : []).map((issue) => [
      issue.field,
      issue.message,
    ]),
  ) as Partial<Record<IntakeFieldName, string>>
  const provenance = state.fieldProvenance as unknown as FieldProvenance
  const latestReceipt = state.receipts.at(-1)
  const webMcp = webMcpPresentation(webMcpStatus)
  const currentStep = STEP_INDEX[state.status]
  const submitted = state.status === 'submitted'
  const locked =
    submitted || state.status === 'review_pending' || state.status === 'approved'
  const nextStepIntentConfirmed =
    inquiryState.nextStepIntentConfirmed ?? false
  const contactPermissions =
    inquiryState.contactPermissions ?? EMPTY_CONTACT_PERMISSIONS
  const inquiryProvenance =
    inquiryState.inquiryProvenance ?? DEFAULT_INQUIRY_PROVENANCE
  const unverifiedSuggestionCount = Object.values(provenance).filter(
    (entry) =>
      entry?.source === 'assistant_suggested' && !entry.verifiedByHuman,
  ).length

  function requestFocus(target: FocusTarget): void {
    setFocusRequest((current) => ({
      sequence: (current?.sequence ?? 0) + 1,
      target,
    }))
  }

  function updateField(
    field: IntakeFieldName,
    value: string | undefined,
  ): void {
    const result = store.human.updateDraft({ [field]: value })
    if (!result.ok) setNotice(result.error.message)
  }

  function setDisclosure(field: OptionalFieldName, authorized: boolean): void {
    const result = store.human.setOptionalDisclosure(field, authorized)
    setNotice(
      resultMessage(
        result,
        `${authorized ? 'Included' : 'Withheld'} ${
          OPTIONAL_FIELD_DEFINITIONS.find((item) => item.name === field)?.label ??
          field
        }. Any older review or approval was cleared.`,
      ),
    )
  }

  function setNextStepIntent(confirmed: boolean): void {
    if (!inquiryHuman.setNextStepIntent) return
    const result = inquiryHuman.setNextStepIntent(confirmed)
    setNotice(
      resultMessage(
        result,
        confirmed
          ? 'You confirmed that this inquiry requests the stated next step.'
          : 'Next-step intent cleared. The draft is not a qualified inquiry.',
      ),
    )
  }

  function setContactPermission(
    permission: keyof ContactPermissionsView,
    granted: boolean,
  ): void {
    if (!inquiryHuman.setContactPermission) return
    const result = inquiryHuman.setContactPermission(permission, granted)
    setNotice(
      resultMessage(
        result,
        permission === 'projectResponse'
          ? granted
            ? 'A reply about this project is permitted.'
            : 'Project-response permission withheld.'
          : granted
            ? 'Occasional updates permitted separately.'
            : 'Occasional updates withheld.',
      ),
    )
  }

  function verifyAssistantSuggestions(): void {
    if (!inquiryHuman.verifyAssistantSuggestions) return
    const result = inquiryHuman.verifyAssistantSuggestions()
    setNotice(
      resultMessage(
        result,
        'You verified the assistant-suggested values currently in the draft.',
      ),
    )
  }

  function loadFictionalExample(): void {
    const result = store.human.updateDraft(
      FICTIONAL_DRAFT as unknown as Partial<IntakeDraft>,
    )
    setShowValidation(false)
    setNotice(
      resultMessage(
        result,
        'Fictional rehearsal loaded. Inclusion, follow-up, and approval choices remain yours.',
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
      requestFocus('first-invalid-field')
      return
    }
    setShowValidation(false)
    setNotice('Exact inquiry frozen. Only the visible human UI can approve it.')
    requestFocus('review-heading')
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
      resultMessage(result, 'Human approval bound to this exact snapshot.'),
    )
    if (result.ok) requestFocus('review-heading')
  }

  function returnToEditing(): void {
    const result = store.human.returnToEditing()
    setNotice(
      resultMessage(
        result,
        'Review and approval cleared. The draft is editable again.',
      ),
    )
    if (result.ok) requestFocus('draft-heading')
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
        'Local receipt recorded. No business inquiry or network request was sent.',
      ),
    )
    if (result.ok) requestFocus('receipt-heading')
  }

  function resetDemo(): void {
    if (!window.confirm('Clear this browser’s fictional Permission Slip demo?')) {
      return
    }
    store.human.reset()
    setShowValidation(false)
    setNotice('Fictional local demo cleared.')
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__brand">
          <p className="eyebrow">Village Alchemist · Project inquiry concierge</p>
          <h1>Permission Slip</h1>
          <p className="tagline">
            Turn a rough idea into a clear project inquiry—without giving the
            assistant permission to act for you.
          </p>
        </div>
        <div className="site-header__status" aria-live="polite">
          <StatusPill label={webMcp.label} tone={webMcp.tone} />
          <StatusPill
            label={WORKFLOW_LABELS[state.status]}
            tone={
              submitted
                ? 'success'
                : state.status === 'empty'
                  ? 'neutral'
                  : 'active'
            }
          />
          <p className="tool-count">{webMcp.detail}</p>
        </div>
      </header>

      <nav className="progress-rail" aria-label="Project inquiry progress">
        {['Brief', 'Review', 'Approve', 'Receipt'].map((step, index) => (
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
            <p className="eyebrow">The useful transaction</p>
            <h2>A real project ask, ready for a human decision.</h2>
            <p>
              The assistant can structure the brief, surface missing facts, and
              prepare the exact payload. Only the person can verify suggestions,
              permit follow-up, approve, or reset.
            </p>
          </div>
          <div className="scenario__prompt">
            <div>
              <div className="prompt-label">
                <span>60–90 second demo prompt</span>
                <span>Fictional data</span>
              </div>
              <blockquote className="prompt-copy">“{DEMO_PROMPT}”</blockquote>
            </div>
            <div className="button-row">
              <CopyButton label="Copy ChatGPT prompt" text={DEMO_PROMPT} />
              <button
                className="button button--quiet"
                disabled={submitted}
                type="button"
                onClick={loadFictionalExample}
              >
                Load fictional rehearsal
              </button>
            </div>
          </div>
        </Panel>

        <div className="main-grid">
          <div className="main-column">
            <Panel tone="cream" id="draft">
              <div className="panel__body">
                <SectionHeading
                  eyebrow="01 / Shared inquiry brief"
                  headingId="draft-heading"
                  title="Shape the project before asking for a response"
                  copy="The page and assistant use the same inquiry operations and store. Missing facts remain missing; labels show where populated values came from."
                  action={
                    <StatusPill
                      label={`Revision ${state.revision}`}
                      tone={state.revision > 0 ? 'active' : 'neutral'}
                    />
                  }
                />

                <div className="provenance-strip" aria-label="Inquiry provenance">
                  <span className="provenance provenance--automatic">
                    Auto-captured
                  </span>
                  <span>{inquiryProvenance.entrySource}</span>
                  {inquiryProvenance.referralSource ? (
                    <span>Referral: {inquiryProvenance.referralSource}</span>
                  ) : null}
                  {inquiryProvenance.campaign ? (
                    <span>Campaign: {inquiryProvenance.campaign}</span>
                  ) : null}
                  <span>No inferred identity or enrichment</span>
                </div>

                {unverifiedSuggestionCount > 0 ? (
                  <div className="verification-callout">
                    <div>
                      <span className="provenance provenance--assistant">
                        Assistant suggestion
                      </span>
                      <strong>
                        {unverifiedSuggestionCount} suggested{' '}
                        {unverifiedSuggestionCount === 1 ? 'value needs' : 'values need'}
                        {' '}your check
                      </strong>
                      <p>
                        Verification means “this draft reflects what I mean.” It
                        is not approval to submit.
                      </p>
                    </div>
                    <button
                      className="button button--quiet"
                      disabled={locked}
                      type="button"
                      onClick={verifyAssistantSuggestions}
                    >
                      Verify current suggestions
                    </button>
                  </div>
                ) : null}

                <div className="inclusion-controls">
                  <div className="inclusion-controls__heading">
                    <div>
                      <p className="eyebrow">Human-only inclusion</p>
                      <h3>Choose any optional context before it can be disclosed</h3>
                    </div>
                    <span>All start withheld</span>
                  </div>
                  <div className="disclosure-list">
                    {OPTIONAL_FIELD_DEFINITIONS.map((field) => (
                      <DisclosureToggle
                        checked={
                          state.optionalDisclosureAuthorizations[field.name]
                        }
                        disabled={locked}
                        field={field.name}
                        key={field.name}
                        onChange={setDisclosure}
                      />
                    ))}
                  </div>
                </div>

                <IntakeForm
                  authorizations={state.optionalDisclosureAuthorizations}
                  disabled={locked}
                  draft={state.draft}
                  errors={validationErrors}
                  provenance={provenance}
                  onChange={updateField}
                />

                <section className="authority-section" aria-labelledby="authority-title">
                  <div className="authority-section__heading">
                    <p className="eyebrow">Human authority</p>
                    <h3 id="authority-title">Confirm intent and follow-up separately</h3>
                    <p>
                      These choices are not available to the assistant. Changing
                      one after review clears the review and any approval.
                    </p>
                  </div>

                  <label className="permission-card permission-card--intent">
                    <input
                      checked={nextStepIntentConfirmed}
                      disabled={locked}
                      type="checkbox"
                      onChange={(event) =>
                        setNextStepIntent(event.currentTarget.checked)
                      }
                    />
                    <span>
                      <strong>I am requesting the next step written above</strong>
                      This explicit confirmation—not a draft or chat message—is
                      what makes the inquiry eligible to route.
                    </span>
                  </label>

                  <div className="permission-grid">
                    <label className="permission-card">
                      <input
                        checked={contactPermissions.projectResponse}
                        disabled={locked}
                        type="checkbox"
                        onChange={(event) =>
                          setContactPermission(
                            'projectResponse',
                            event.currentTarget.checked,
                          )
                        }
                      />
                      <span>
                        <strong>Reply about this project</strong>
                        Allow Village Alchemist to respond to this inquiry using
                        the preferred method above.
                      </span>
                    </label>

                    <label className="permission-card">
                      <input
                        checked={contactPermissions.occasionalUpdates}
                        disabled={locked}
                        type="checkbox"
                        onChange={(event) =>
                          setContactPermission(
                            'occasionalUpdates',
                            event.currentTarget.checked,
                          )
                        }
                      />
                      <span>
                        <strong>Occasional updates</strong>
                        Optional and unbundled. Withholding this never blocks a
                        project response.
                      </span>
                    </label>
                  </div>
                </section>

                <div className="form-footer">
                  <p>
                    Preparing a review freezes the normalized payload, permissions,
                    intent, destination, provenance, version, and digest. It does
                    not approve or submit anything.
                  </p>
                  <button
                    className="button button--primary button--large"
                    disabled={busy || locked}
                    type="button"
                    onClick={() => void prepareReview()}
                  >
                    {busy ? 'Preparing exact review…' : 'Prepare exact review'}
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

            {latestReceipt ? (
              <ReceiptPanel receipt={latestReceipt} />
            ) : null}
          </div>

          <aside className="side-column" aria-label="Inquiry workflow detail">
            <Panel tone="dark" className="promise-panel">
              <div className="panel__body">
                <p className="eyebrow">Permission Slip promise</p>
                <h2>The agent can prepare the inquiry. It cannot give itself permission to send it.</h2>
                <ul className="promise-list">
                  <li>One shared operation model for page and assistant</li>
                  <li>Explicit next-step intent before qualification</li>
                  <li>Approval bound to one frozen review version</li>
                  <li>Edits invalidate approval automatically</li>
                  <li>Retries resolve to one receipt</li>
                </ul>
              </div>
            </Panel>

            <ActivityPanel activity={state.activity} />

            <Panel tone="dark">
              <div className="panel__body control-desk">
                <div>
                  <p className="eyebrow">Demo boundary</p>
                  <h2>Durable here. Not transmitted.</h2>
                  <p>
                    The simulated result and receipt persist in versioned browser
                    storage for this origin. There is no backend, analytics,
                    telemetry, or submission-time network request.
                  </p>
                </div>
                <hr className="control-desk__rule" />
                <button
                  className="button button--danger"
                  type="button"
                  onClick={resetDemo}
                >
                  Reset fictional rehearsal
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
