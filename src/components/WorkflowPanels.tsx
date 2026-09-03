import { FIELD_DEFINITIONS } from '../domain/constants'
import type {
  ActivityEntry,
  DisclosureReceipt,
  FrozenReview,
  HumanApproval,
  IntakeFieldName,
  OptionalFieldName,
} from '../domain/types'
import { CopyButton } from './CopyButton'
import { DefinitionList, Panel, SectionHeading } from './Primitives'

const OPTIONAL_COPY: Record<OptionalFieldName, string> = {
  phone: 'Allow the draft to include a contact number.',
  budgetRange: 'Allow a high-level planning range.',
  socialHandle: 'Allow one public social account handle.',
  additionalNotes: 'Allow extra context beyond the required goal.',
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function displayValue(value: string | number): string {
  return typeof value === 'number' ? value.toLocaleString() : value
}

function fieldLabel(field: IntakeFieldName): string {
  return FIELD_DEFINITIONS[field].label
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
          {label}
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
        <span className="sr-only">{checked ? 'Authorized' : 'Withheld'}</span>
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

  const required = currentReview.disclosedFields.filter(
    (field) => FIELD_DEFINITIONS[field].required,
  )
  const optionalIncluded = currentReview.disclosedFields.filter(
    (field) => !FIELD_DEFINITIONS[field].required,
  )
  const authorizedWithoutValue = currentReview.authorizedOptionalFields.filter(
    (field) => !optionalIncluded.includes(field),
  )
  const notAuthorized = currentReview.withheldOptionalFields.filter(
    (field) => !currentReview.authorizedOptionalFields.includes(field),
  )

  function renderFields(fields: IntakeFieldName[]) {
    return (
      <dl className="review-list">
        {fields.map((field) => {
          const value = currentReview.snapshot[field]
          if (value === undefined) return null
          return (
            <div className="review-list__row" key={field}>
              <dt>{fieldLabel(field)}</dt>
              <dd>{displayValue(value)}</dd>
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
          eyebrow="02 / Exact disclosure"
          headingId="review-heading"
          title={approval ? 'Approved snapshot' : 'Ready for your review'}
          copy="This frozen version—not a future edit—is the only version this approval can cover."
        />
        <div className="review-banner">
          Review <strong>{currentReview.reviewId}</strong> was frozen at revision{' '}
          {currentReview.revision}. Any return to editing cancels it.
        </div>
        <div className="review-groups">
          <div className="review-group review-group--wide">
            <h3>Required information</h3>
            {renderFields(required)}
          </div>
          <div className="review-group">
            <h3>Authorized and included</h3>
            {optionalIncluded.length ? (
              renderFields(optionalIncluded)
            ) : (
              <p className="section-copy">
                No optional values are included in this snapshot.
              </p>
            )}
          </div>
          <div className="review-group">
            <h3>Authorized, no value</h3>
            {authorizedWithoutValue.length ? (
              <ul className="requirements-list">
                {authorizedWithoutValue.map((field) => (
                  <li key={field}>{fieldLabel(field)}</li>
                ))}
              </ul>
            ) : (
              <p className="section-copy">None.</p>
            )}
          </div>
          <div className="review-group review-group--wide">
            <h3>Withheld — not authorized</h3>
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
        <div className="digest-block">
          <span className="digest-block__label">SHA-256 snapshot digest</span>
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
        <div className="button-row">
          {!approval ? (
            <button
              className="button button--approve"
              disabled={busy}
              type="button"
              onClick={onApprove}
            >
              Approve this exact disclosure
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
  return (
    <Panel tone="cream" id="receipt">
      <div className="panel__body">
        <SectionHeading
          eyebrow="03 / Disclosure receipt"
          headingId="receipt-heading"
          title="A precise local record"
          copy="The receipt names what was disclosed, what stayed private, and the exact approved digest."
          action={<CopyButton label="Copy JSON" text={receiptJson} />}
        />
        <span className="receipt-seal">✓ Local submission complete</span>
        <div className="receipt-number">{receipt.receiptId}</div>
        <DefinitionList
          items={[
            { label: 'Review', value: receipt.reviewId },
            {
              label: 'Submitted',
              value: formatTimestamp(receipt.submissionTimestamp),
            },
            { label: 'Destination', value: receipt.destination },
            {
              label: 'Disclosed',
              value: receipt.disclosedFieldNames.map(fieldLabel).join(', '),
            },
            {
              label: 'Withheld',
              value:
                receipt.optionalFieldsWithheld.map(fieldLabel).join(', ') || 'None',
            },
            { label: 'Digest', value: <code>{receipt.snapshotDigest}</code> },
          ]}
        />
        <div className="local-only">
          <strong>{receipt.statement}</strong> This demonstration stores its receipt
          in this browser only.
        </div>
      </div>
    </Panel>
  )
}

interface ActivityPanelProps {
  activity: ActivityEntry[]
}

const ACTION_COPY: Record<
  ActivityEntry['action'],
  Record<ActivityEntry['outcome'], string>
> = {
  draft_replaced: {
    succeeded: 'Replaced the complete intake draft.',
    rejected: 'Draft replacement was rejected.',
  },
  draft_updated: {
    succeeded: 'Updated draft fields.',
    rejected: 'Draft update was rejected.',
  },
  disclosure_changed: {
    succeeded: 'Changed an optional disclosure permission.',
    rejected: 'Disclosure permission change was rejected.',
  },
  review_prepared: {
    succeeded: 'Prepared and froze an exact disclosure review.',
    rejected: 'Review preparation was rejected.',
  },
  review_approved: {
    succeeded: 'Approved the exact frozen review.',
    rejected: 'Review approval was rejected.',
  },
  returned_to_editing: {
    succeeded: 'Returned the workflow to editing.',
    rejected: 'Return to editing was rejected.',
  },
  intake_submitted: {
    succeeded: 'Completed the local-only submission.',
    rejected: 'Local submission was rejected.',
  },
}

export function ActivityPanel({ activity }: ActivityPanelProps) {
  const entries = [...activity].reverse().slice(0, 10)
  return (
    <Panel tone="dark">
      <div className="panel__body">
        <SectionHeading
          eyebrow="Activity"
          title="Visible by design"
          copy="Actions are recorded without storing personal values in the timeline."
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
                  {ACTION_COPY[entry.action][entry.outcome]}
                  {entry.fieldNames.length
                    ? ` ${entry.fieldNames.map(fieldLabel).join(', ')}.`
                    : ''}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-state">
            Human and agent actions will appear here as the draft moves forward.
          </div>
        )}
      </div>
    </Panel>
  )
}
