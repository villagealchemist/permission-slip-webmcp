import { useEffect, useState } from 'react'
import type {
  IntakeDraft,
  IntakeFieldName,
  OptionalDisclosureAuthorizations,
} from '../domain/types'
import { FieldGroup, type ProvenanceBadge } from './Primitives'

export interface InquiryFieldProvenance {
  source: 'person_provided' | 'assistant_suggested'
  verifiedByHuman: boolean
  updatedAt: string
}

export type FieldProvenance = Partial<
  Record<IntakeFieldName, InquiryFieldProvenance>
>

interface IntakeFormProps {
  draft: IntakeDraft
  authorizations: OptionalDisclosureAuthorizations
  provenance: FieldProvenance
  errors: Partial<Record<IntakeFieldName, string>>
  disabled?: boolean
  onChange: (field: IntakeFieldName, value: string | undefined) => void
}

function provenanceBadges(
  value: InquiryFieldProvenance | undefined,
): ProvenanceBadge[] | undefined {
  if (!value) return undefined

  const badges: ProvenanceBadge[] = [
    value.source === 'assistant_suggested'
      ? { label: 'Assistant suggestion', tone: 'assistant' }
      : { label: 'Person', tone: 'person' },
  ]
  if (value.verifiedByHuman) {
    badges.push({ label: 'Verified', tone: 'verified' })
  }
  return badges
}

type IntakeFormBuffer = Record<IntakeFieldName, string>

function bufferFromDraft(draft: IntakeDraft): IntakeFormBuffer {
  return {
    contactName: draft.contactName ?? '',
    email: draft.email ?? '',
    inquiryType: draft.inquiryType ?? '',
    desiredOutcome: draft.desiredOutcome ?? '',
    relevantBackground: draft.relevantBackground ?? '',
    timeline: draft.timeline ?? '',
    preferredResponseMethod: draft.preferredResponseMethod ?? '',
    requestedNextStep: draft.requestedNextStep ?? '',
    phone: draft.phone ?? '',
    budgetOrConstraints: draft.budgetOrConstraints ?? '',
    organization: draft.organization ?? '',
    additionalContext: draft.additionalContext ?? '',
  }
}

export function IntakeForm({
  draft,
  authorizations,
  provenance,
  errors,
  disabled = false,
  onChange,
}: IntakeFormProps) {
  const [buffer, setBuffer] = useState<IntakeFormBuffer>(() =>
    bufferFromDraft(draft),
  )

  useEffect(() => {
    // WebMCP and rehearsal updates arrive through the shared store.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuffer(bufferFromDraft(draft))
  }, [draft])

  function updateBuffer(field: IntakeFieldName, value: string): void {
    setBuffer((current) => ({ ...current, [field]: value }))
  }

  function commitText(field: IntakeFieldName, value: string): void {
    onChange(field, value === '' ? undefined : value)
  }

  const shared = (
    field: IntakeFieldName,
    required: boolean,
    alwaysDescribed = false,
  ) => ({
    disabled,
    id: field,
    name: field,
    required,
    'aria-required': required,
    'aria-describedby':
      alwaysDescribed || errors[field] ? `${field}-message` : undefined,
    'aria-invalid': Boolean(errors[field]),
  })

  function optionalShared(field: keyof OptionalDisclosureAuthorizations) {
    return {
      ...shared(field, false, true),
      disabled: disabled || !authorizations[field],
    }
  }

  function optionalHint(field: keyof OptionalDisclosureAuthorizations): string {
    return authorizations[field]
      ? 'You chose to make this available for the exact review.'
      : 'Withheld. Use the human-only inclusion control above to share it.'
  }

  return (
    <div className="inquiry-form">
      <fieldset className="form-section">
        <legend>
          <span>01</span> Project direction
        </legend>
        <p className="form-section__copy">
          Start with the outcome. The assistant can organize the request, but it
          should never invent missing facts.
        </p>
        <div className="form-grid">
          <FieldGroup
            label="Inquiry type"
            htmlFor="inquiryType"
            error={errors.inquiryType}
            provenance={provenanceBadges(provenance.inquiryType)}
          >
            <select
              {...shared('inquiryType', true)}
              value={buffer.inquiryType}
              onBlur={(event) =>
                commitText('inquiryType', event.currentTarget.value)
              }
              onChange={(event) => {
                updateBuffer('inquiryType', event.target.value)
                commitText('inquiryType', event.target.value)
              }}
            >
              <option value="">Choose an inquiry type</option>
              <option value="prototype">Product prototype</option>
              <option value="website">Website or digital experience</option>
              <option value="product_strategy">Product strategy</option>
              <option value="creative_collaboration">
                Creative technology collaboration
              </option>
              <option value="other">Something else</option>
            </select>
          </FieldGroup>

          <FieldGroup
            label="Timeline"
            htmlFor="timeline"
            error={errors.timeline}
            provenance={provenanceBadges(provenance.timeline)}
          >
            <input
              {...shared('timeline', true)}
              maxLength={160}
              placeholder="Eight weeks, with a flexible start date"
              type="text"
              value={buffer.timeline}
              onBlur={(event) => commitText('timeline', event.currentTarget.value)}
              onChange={(event) => updateBuffer('timeline', event.target.value)}
            />
          </FieldGroup>

          <div className="field--wide">
            <FieldGroup
              label="Desired outcome"
              htmlFor="desiredOutcome"
              error={errors.desiredOutcome}
              provenance={provenanceBadges(provenance.desiredOutcome)}
            >
              <textarea
                {...shared('desiredOutcome', true)}
                maxLength={1200}
                placeholder="What should exist or be clearer at the end of the engagement?"
                value={buffer.desiredOutcome}
                onBlur={(event) =>
                  commitText('desiredOutcome', event.currentTarget.value)
                }
                onChange={(event) =>
                  updateBuffer('desiredOutcome', event.target.value)
                }
              />
            </FieldGroup>
          </div>

          <div className="field--wide">
            <FieldGroup
              label="Relevant background"
              htmlFor="relevantBackground"
              error={errors.relevantBackground}
              provenance={provenanceBadges(provenance.relevantBackground)}
            >
              <textarea
                {...shared('relevantBackground', true)}
                maxLength={1600}
                placeholder="What already exists, what has been tried, and what is still uncertain?"
                value={buffer.relevantBackground}
                onBlur={(event) =>
                  commitText('relevantBackground', event.currentTarget.value)
                }
                onChange={(event) =>
                  updateBuffer('relevantBackground', event.target.value)
                }
              />
            </FieldGroup>
          </div>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>
          <span>02</span> Contact and next step
        </legend>
        <p className="form-section__copy">
          Enough information to respond, plus the specific business step you are
          asking for.
        </p>
        <div className="form-grid">
          <FieldGroup
            label="Contact name"
            htmlFor="contactName"
            error={errors.contactName}
            provenance={provenanceBadges(provenance.contactName)}
          >
            <input
              {...shared('contactName', true)}
              autoComplete="name"
              maxLength={100}
              placeholder="Maya Chen"
              type="text"
              value={buffer.contactName}
              onBlur={(event) =>
                commitText('contactName', event.currentTarget.value)
              }
              onChange={(event) =>
                updateBuffer('contactName', event.target.value)
              }
            />
          </FieldGroup>

          <FieldGroup
            label="Email"
            htmlFor="email"
            error={errors.email}
            provenance={provenanceBadges(provenance.email)}
          >
            <input
              {...shared('email', true)}
              autoComplete="email"
              inputMode="email"
              maxLength={254}
              placeholder="maya.chen@example.com"
              type="email"
              value={buffer.email}
              onBlur={(event) => commitText('email', event.currentTarget.value)}
              onChange={(event) => updateBuffer('email', event.target.value)}
            />
          </FieldGroup>

          <FieldGroup
            label="Preferred response method"
            htmlFor="preferredResponseMethod"
            error={errors.preferredResponseMethod}
            provenance={provenanceBadges(provenance.preferredResponseMethod)}
          >
            <select
              {...shared('preferredResponseMethod', true)}
              value={buffer.preferredResponseMethod}
              onBlur={(event) =>
                commitText('preferredResponseMethod', event.currentTarget.value)
              }
              onChange={(event) => {
                updateBuffer('preferredResponseMethod', event.target.value)
                commitText('preferredResponseMethod', event.target.value)
              }}
            >
              <option value="">Choose a response method</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="video_call">Video call</option>
            </select>
          </FieldGroup>

          <FieldGroup
            label="Requested next step"
            htmlFor="requestedNextStep"
            error={errors.requestedNextStep}
            provenance={provenanceBadges(provenance.requestedNextStep)}
          >
            <select
              {...shared('requestedNextStep', true)}
              value={buffer.requestedNextStep}
              onBlur={(event) =>
                commitText('requestedNextStep', event.currentTarget.value)
              }
              onChange={(event) => {
                updateBuffer('requestedNextStep', event.target.value)
                commitText('requestedNextStep', event.target.value)
              }}
            >
              <option value="">Choose a requested next step</option>
              <option value="discovery_call">30-minute discovery call</option>
              <option value="written_response">Written response</option>
              <option value="project_review">Project review</option>
            </select>
          </FieldGroup>
        </div>
      </fieldset>

      <details className="optional-context">
        <summary>
          <span>
            Optional context
            <small>Included only when you turn on its separate permission</small>
          </span>
          <span aria-hidden="true">+</span>
        </summary>
        <div className="form-grid optional-context__fields">
          <FieldGroup
            label="Budget or constraints"
            htmlFor="budgetOrConstraints"
            hint={optionalHint('budgetOrConstraints')}
            error={errors.budgetOrConstraints}
            optional
            provenance={provenanceBadges(provenance.budgetOrConstraints)}
          >
            <input
              {...optionalShared('budgetOrConstraints')}
              maxLength={500}
              placeholder={
                authorizations.budgetOrConstraints
                  ? '$15,000–$25,000, with an eight-week window'
                  : 'Not authorized'
              }
              type="text"
              value={buffer.budgetOrConstraints}
              onBlur={(event) =>
                commitText('budgetOrConstraints', event.currentTarget.value)
              }
              onChange={(event) =>
                updateBuffer('budgetOrConstraints', event.target.value)
              }
            />
          </FieldGroup>

          <FieldGroup
            label="Organization"
            htmlFor="organization"
            hint={optionalHint('organization')}
            error={errors.organization}
            optional
            provenance={provenanceBadges(provenance.organization)}
          >
            <input
              {...optionalShared('organization')}
              autoComplete="organization"
              maxLength={160}
              placeholder={
                authorizations.organization ? 'Organization name' : 'Not authorized'
              }
              type="text"
              value={buffer.organization}
              onBlur={(event) =>
                commitText('organization', event.currentTarget.value)
              }
              onChange={(event) =>
                updateBuffer('organization', event.target.value)
              }
            />
          </FieldGroup>

          <FieldGroup
            label="Phone"
            htmlFor="phone"
            hint={optionalHint('phone')}
            error={errors.phone}
            optional
            provenance={provenanceBadges(provenance.phone)}
          >
            <input
              {...optionalShared('phone')}
              autoComplete="tel"
              maxLength={40}
              placeholder={authorizations.phone ? '215-555-0134' : 'Not authorized'}
              type="tel"
              value={buffer.phone}
              onBlur={(event) => commitText('phone', event.currentTarget.value)}
              onChange={(event) => updateBuffer('phone', event.target.value)}
            />
          </FieldGroup>

          <div className="field--wide">
            <FieldGroup
              label="Additional context"
              htmlFor="additionalContext"
              hint={optionalHint('additionalContext')}
              error={errors.additionalContext}
              optional
              provenance={provenanceBadges(provenance.additionalContext)}
            >
              <textarea
                {...optionalShared('additionalContext')}
                maxLength={2000}
                placeholder={
                  authorizations.additionalContext
                    ? 'Only context you intentionally choose to share'
                    : 'Not authorized'
                }
                value={buffer.additionalContext}
                onBlur={(event) =>
                  commitText('additionalContext', event.currentTarget.value)
                }
                onChange={(event) =>
                  updateBuffer('additionalContext', event.target.value)
                }
              />
            </FieldGroup>
          </div>
        </div>
      </details>
    </div>
  )
}
