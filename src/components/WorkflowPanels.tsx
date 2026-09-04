import { FIELD_DEFINITIONS } from '../domain/constants'
import type {
  ActivityEntry,
  ContactPermissions,
  DisclosureReceipt,
  FrozenReview,
  HumanApproval,
  InquiryProvenance,
  IntakeFieldName,
  OptionalFieldName,
} from '../domain/types'
import { SIMULATED_INQUIRY_DESTINATION } from '../domain/types'
import { CopyButton } from './CopyButton'
import { DefinitionList, Panel, SectionHeading } from './Primitives'

export type ContactPermissionsView = ContactPermissions
export type InquiryProvenanceView = InquiryProvenance

const OPTIONAL_COPY: Record<OptionalFieldName, string> = {
  phone: 'Include a contact number in this exact inquiry.',
  budgetOrConstraints: 'Include the planning range or constraints you supplied.',
  organization: 'Include an organization name when it is relevant.',
  additionalContext: 'Include context beyond the core project brief.',
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const VALUE_LABELS: Partial<
  Record<IntakeFieldName, Record<string, string>>
> = {
  inquiryType: {
    prototype: 'Product prototype',
    website: 'Website or digital experience',
    product_strategy: 'Product strategy',
    creative_collaboration: 'Creative technology collaboration',
    other: 'Something else',
  },
  preferredResponseMethod: {
    email: 'Email',
    phone: 'Phone',
    video_call: 'Video call',
  },
  requestedNextStep: {
    discovery_call: '30-minute discovery call',
    written_response: 'Written response',
    project_review: 'Project review',
  },
}

function displayValue(
  field: IntakeFieldName,
  value: string | number | boolean,
): string {
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return VALUE_LABELS[field]?.[value] ?? value
}

function fieldLabel(field: IntakeFieldName): string {
  return FIELD_DEFINITIONS[field].label
}

function permissionsSummary(permissions: ContactPermissionsView): string {
  const granted = [
    permissions.projectResponse ? 'reply about this project' : null,
    permissions.occasionalUpdates ? 'occasional Village Alchemist updates' : null,
  ].filter(Boolean)
  return granted.length ? granted.join('; ') : 'None granted'
}

interface DisclosureToggleProps {
  field: OptionalFieldName
  checked: boolean
  disabled?: boolean
  onChange: (field: OptionalFieldName, checked: boolean) => void
}

export function DisclosureToggle({
  field,
  checked,
  disabled = false,
  onChange,
}: DisclosureToggleProps) {
  const label = FIELD_DEFINITIONS[field].label
  return (
    <div className="disclosure-control">
      <div>
        <span className="disclosure-control__label" id={`${field}-permission`}>
          Include {label.toLowerCase()}
        </span>
        <span className="disclosure-control__copy">{OPTIONAL_COPY[field]}</span>
      </div>
      <button
        aria-checked={checked}
        aria-labelledby={`${field}-permission`}
        className="toggle"
        disabled={disabled}
        role="switch"
        type="button"
        onClick={() => onChange(field, !checked)}
      >
        <span className="sr-only">{checked ? 'Included' : 'Withheld'}</span>
      </button>
    </div>
  )
}

interface ReviewPanelProps {
  review: FrozenReview | null
  approval: HumanApproval | null
  submitted: boolean
  busy: boolean
  onApprove: () => void
  onReturn: () => void
  onSubmit: () => void
}

export function ReviewPanel({
  review,
  approval,
  submitted,
  busy,
  onApprove,
  onReturn,
  onSubmit,
}: ReviewPanelProps) {
  if (!review) return null

  const currentReview = review
  const snapshot = currentReview.payload.snapshot
  const frozenPermissions = currentReview.payload.contactPermissions
  const frozenIntent = currentReview.payload.nextStepIntentConfirmed
  const frozenProvenance = currentReview.payload.inquiryProvenance

  const required = currentReview.disclosedFields.filter(
    (field) => FIELD_DEFINITIONS[field].required,
  )
  const optionalIncluded = currentReview.disclosedFields.filter(
    (field) => !FIELD_DEFINITIONS[field].required,
  )
  const notAuthorized = currentReview.withheldOptionalFields.filter(
    (field) => !currentReview.authorizedOptionalFields.includes(field),
  )

  function renderFields(fields: IntakeFieldName[]) {
    return (
      <dl className="review-list">
        {fields.map((field) => {
          const value = snapshot[field]
          if (value === undefined) return null
          return (
            <div className="review-list__row" key={field}>
              <dt>{fieldLabel(field)}</dt>
              <dd>{displayValue(field, value)}</dd>
            </div>
          )
        })}
      </dl>
    )
  }

  return (
    <Panel tone="violet" id="review">
      <div className="panel__body">
        <SectionHeading
          eyebrow="02 / Exact inquiry review"
          headingId="review-heading"
          title={
            approval ? 'Approved snapshot' : 'Check exactly what will be recorded'
          }
          copy="Approval belongs to this review version and digest only. Returning to the draft—or changing any field or permission—invalidates it."
        />

        <div className="qualification-banner">
          <span className="qualification-banner__mark" aria-hidden="true">
            {frozenIntent ? '✓' : '—'}
          </span>
          <span>
            <strong>
              {frozenIntent
                ? 'Qualified by explicit next-step intent'
                : 'Draft only — no next step confirmed'}
            </strong>
            {frozenIntent
              ? `The person requested: ${displayValue('requestedNextStep', snapshot.requestedNextStep)}`
              : 'No business follow-up can be routed without the person’s confirmation.'}
          </span>
        </div>

        <div className="review-overview">
          <DefinitionList
            items={[
              { label: 'Destination', value: SIMULATED_INQUIRY_DESTINATION },
              {
                label: 'Requested next step',
                value: displayValue(
                  'requestedNextStep',
                  snapshot.requestedNextStep,
                ),
              },
              {
                label: 'Contact permission',
                value: permissionsSummary(frozenPermissions),
              },
              {
                label: 'Entry source',
                value: frozenProvenance.entrySource,
              },
              {
                label: 'Referral / campaign',
                value:
                  [frozenProvenance.referralSource, frozenProvenance.campaign]
                    .filter(Boolean)
                    .join(' · ') || 'None captured',
              },
            ]}
          />
        </div>

        <div className="review-groups">
          <div className="review-group review-group--wide">
            <h3>Exact normalized payload</h3>
            {renderFields([...required, ...optionalIncluded])}
          </div>
          <div className="review-group">
            <h3>Permission granted</h3>
            <ul className="requirements-list">
              <li>
                Project response:{' '}
                {frozenPermissions.projectResponse ? 'Granted' : 'Withheld'}
              </li>
              <li>
                Occasional updates:{' '}
                {frozenPermissions.occasionalUpdates ? 'Granted' : 'Withheld'}
              </li>
            </ul>
          </div>
          <div className="review-group">
            <h3>Optional fields withheld</h3>
            {notAuthorized.length ? (
              <ul className="requirements-list">
                {notAuthorized.map((field) => (
                  <li key={field}>{fieldLabel(field)}</li>
                ))}
              </ul>
            ) : (
              <p className="section-copy">None.</p>
            )}
          </div>
        </div>

        <div className="consequence-note">
          <strong>What approval does</strong>
          It authorizes only this frozen payload for a simulated local submission.
          It does not prove identity, subscribe the person to anything withheld, or
          send a network request.
        </div>

        <div className="digest-block">
          <span className="digest-block__label">
            Review {currentReview.reviewId} · revision {currentReview.revision} ·
            SHA-256 change detector
          </span>
          <code>{currentReview.digest}</code>
        </div>

        {approval ? (
          <div className="approval-stamp">
            <span className="approval-stamp__mark" aria-hidden="true">
              ✓
            </span>
            <span>
              <strong>Human approval recorded</strong>
              {formatTimestamp(approval.approvedAt)} · exact review and digest only
            </span>
          </div>
        ) : null}

        <div className="button-row review-actions">
          {!approval ? (
            <button
              className="button button--approve"
              disabled={busy}
              type="button"
              onClick={onApprove}
            >
              Approve this exact inquiry
            </button>
          ) : null}
          {approval && !submitted ? (
            <button
              className="button button--primary"
              disabled={busy}
              type="button"
              onClick={onSubmit}
            >
              Complete local submission
            </button>
          ) : null}
          {!submitted ? (
            <button
              className="button button--quiet"
              disabled={busy}
              type="button"
              onClick={onReturn}
            >
              Return to editing
            </button>
          ) : null}
        </div>
      </div>
    </Panel>
  )
}

interface ReceiptPanelProps {
  receipt: DisclosureReceipt
}

export function ReceiptPanel({ receipt }: ReceiptPanelProps) {
  const receiptJson = JSON.stringify(receipt, null, 2)

  if (receipt.outcome === 'rejected') {
    return (
      <Panel tone="cream" id="receipt">
        <div className="panel__body">
          <SectionHeading
            eyebrow="Submission attempt receipt"
            headingId="receipt-heading"
            title="The submission was stopped safely"
            copy="This PII-free receipt explains why nothing was finalized and what must happen before a retry."
            action={<CopyButton label="Copy receipt JSON" text={receiptJson} />}
          />
          <span className="receipt-seal receipt-seal--failure">
            × Local submission rejected
          </span>
          <div className="receipt-number">{receipt.receiptId}</div>
          <DefinitionList
            items={[
              { label: 'Outcome', value: 'Rejected' },
              { label: 'Reason', value: receipt.failure.code },
              { label: 'Review', value: receipt.reviewId ?? 'No review bound' },
              {
                label: 'Timestamp',
                value: formatTimestamp(receipt.submissionTimestamp),
              },
              { label: 'Destination', value: receipt.destination },
              { label: 'Recovery', value: receipt.failure.retry },
            ]}
          />
          <div className="local-only">
            <strong>{receipt.failure.message}</strong> {receipt.statement} The
            rejected-attempt receipt contains no inquiry field values.
          </div>
        </div>
      </Panel>
    )
  }

  const frozenPermissions = receipt.contactPermissions
  const frozenProvenance = receipt.inquiryProvenance

  return (
    <Panel tone="cream" id="receipt">
      <div className="panel__body">
        <SectionHeading
          eyebrow="04 / Durable local receipt"
          headingId="receipt-heading"
          title="The outcome is understandable and recoverable"
          copy="This browser keeps a stable record of the frozen payload, destination, permissions, provenance, and approved review binding."
          action={<CopyButton label="Copy receipt JSON" text={receiptJson} />}
        />
        <span className="receipt-seal">✓ Local inquiry recorded</span>
        <div className="receipt-number">{receipt.receiptId}</div>
        <DefinitionList
          items={[
            { label: 'Outcome', value: 'Qualified inquiry recorded locally' },
            { label: 'Submission', value: receipt.submissionId },
            { label: 'Review', value: receipt.reviewId },
            {
              label: 'Timestamp',
              value: formatTimestamp(receipt.submissionTimestamp),
            },
            { label: 'Destination', value: receipt.destination },
            {
              label: 'Requested next step',
              value: displayValue(
                'requestedNextStep',
                receipt.requestedNextStep,
              ),
            },
            {
              label: 'Permissions granted',
              value: permissionsSummary(frozenPermissions),
            },
            {
              label: 'Permissions withheld',
              value: [
                !frozenPermissions.projectResponse ? 'project response' : null,
                !frozenPermissions.occasionalUpdates
                  ? 'occasional updates'
                  : null,
              ]
                .filter(Boolean)
                .join(', ') || 'None',
            },
            {
              label: 'Optional fields withheld',
              value:
                receipt.optionalFieldsWithheld.map(fieldLabel).join(', ') ||
                'None',
            },
            {
              label: 'Entry provenance',
              value:
                [
                  frozenProvenance.entrySource,
                  frozenProvenance.referralSource,
                  frozenProvenance.campaign,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Direct visit',
            },
            {
              label: 'Approved digest',
              value: <code>{receipt.snapshotDigest}</code>,
            },
          ]}
        />
        <div className="local-only">
          <strong>{receipt.statement}</strong> This is a browser-local hackathon
          demonstration. Its receipt survives refresh on this origin, but
          localStorage is not tamper-proof and no real business inquiry is sent.
        </div>
      </div>
    </Panel>
  )
}

interface ActivityPanelProps {
  activity: ActivityEntry[]
}

const ACTION_COPY: Record<string, Record<'succeeded' | 'rejected', string>> = {
  draft_replaced: {
    succeeded: 'Assistant prepared a complete inquiry draft.',
    rejected: 'Draft preparation was rejected.',
  },
  draft_updated: {
    succeeded: 'Person updated inquiry fields.',
    rejected: 'Draft update was rejected.',
  },
  disclosure_changed: {
    succeeded: 'Person changed an optional-field permission.',
    rejected: 'Optional-field permission change was rejected.',
  },
  assistant_suggestions_verified: {
    succeeded: 'Person verified assistant-suggested values.',
    rejected: 'Suggestion verification was rejected.',
  },
  next_step_intent_changed: {
    succeeded: 'Person changed explicit next-step intent.',
    rejected: 'Next-step confirmation was rejected.',
  },
  contact_permission_changed: {
    succeeded: 'Person changed a contact permission.',
    rejected: 'Contact permission change was rejected.',
  },
  review_prepared: {
    succeeded: 'Prepared and froze an exact inquiry review.',
    rejected: 'Review preparation was rejected.',
  },
  review_approved: {
    succeeded: 'Person approved the exact frozen review.',
    rejected: 'Review approval was rejected.',
  },
  returned_to_editing: {
    succeeded: 'Returned to editing and cleared prior approval.',
    rejected: 'Return to editing was rejected.',
  },
  intake_submitted: {
    succeeded: 'Completed the simulated local submission.',
    rejected: 'Local submission was rejected.',
  },
}

export function ActivityPanel({ activity }: ActivityPanelProps) {
  const entries = [...activity].reverse().slice(0, 8)
  return (
    <Panel tone="dark">
      <div className="panel__body">
        <SectionHeading
          eyebrow="Shared activity"
          title="Every handoff stays visible"
          copy="Person and assistant actions use one store. The timeline records field names, never previous personal values."
        />
        {entries.length ? (
          <ol className="timeline">
            {entries.map((entry) => (
              <li
                className={`timeline__item timeline__item--${
                  entry.outcome === 'rejected' ? 'failure' : entry.actor
                }`}
                key={entry.activityId}
              >
                <div className="timeline__meta">
                  <span>
                    {entry.actor} · {entry.outcome}
                  </span>
                  <time dateTime={entry.timestamp}>
                    {formatTimestamp(entry.timestamp)}
                  </time>
                </div>
                <p>
                  {ACTION_COPY[entry.action]?.[entry.outcome] ??
                    `Workflow action ${entry.outcome}.`}
                  {entry.fieldNames.length
                    ? ` ${entry.fieldNames.map(fieldLabel).join(', ')}.`
                    : ''}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">
            Ask the assistant to prepare the fictional project inquiry—or load the
            rehearsal yourself. The shared activity will appear here.
          </div>
        )}
      </div>
    </Panel>
  )
}
