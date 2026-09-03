import { useEffect, useState } from 'react'
import { OPTIONAL_FIELD_DEFINITIONS } from '../domain/constants'
import type {
  IntakeDraft,
  IntakeFieldName,
  OptionalDisclosureAuthorizations,
} from '../domain/types'
import { FieldGroup } from './Primitives'

export type FieldProvenance = Partial<
  Record<IntakeFieldName, 'human' | 'agent'>
>

interface IntakeFormProps {
  draft: IntakeDraft
  authorizations: OptionalDisclosureAuthorizations
  provenance: FieldProvenance
  errors: Partial<Record<IntakeFieldName, string>>
  disabled?: boolean
  onChange: (field: IntakeFieldName, value: string | number | undefined) => void
}

function provenanceLabel(
  value: 'human' | 'agent' | undefined,
): 'Human' | 'Agent' | undefined {
  if (!value) return undefined
  return value === 'agent' ? 'Agent' : 'Human'
}

type IntakeFormBuffer = Record<IntakeFieldName, string>

function bufferFromDraft(draft: IntakeDraft): IntakeFormBuffer {
  return {
    contactName: draft.contactName ?? '',
    email: draft.email ?? '',
    eventType: draft.eventType ?? '',
    preferredDate: draft.preferredDate ?? '',
    estimatedAttendeeCount:
      draft.estimatedAttendeeCount === undefined
        ? ''
        : String(draft.estimatedAttendeeCount),
    eventGoal: draft.eventGoal ?? '',
    phone: draft.phone ?? '',
    budgetRange: draft.budgetRange ?? '',
    socialHandle: draft.socialHandle ?? '',
    additionalNotes: draft.additionalNotes ?? '',
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
    // WebMCP and preset updates arrive through the shared store, so refresh the
    // local edit buffer when that canonical draft changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBuffer(bufferFromDraft(draft))
  }, [draft])

  function updateBuffer(field: IntakeFieldName, value: string): void {
    setBuffer((current) => ({ ...current, [field]: value }))
  }

  function commitText(field: IntakeFieldName, value: string): void {
    onChange(field, value)
  }

  function commitAttendeeCount(rawValue: string): void {
    onChange(
      'estimatedAttendeeCount',
      rawValue === '' ? undefined : Number(rawValue),
    )
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

  return (
    <div className="form-grid">
      <FieldGroup
        label="Contact name"
        htmlFor="contactName"
        error={errors.contactName}
        provenance={provenanceLabel(provenance.contactName)}
      >
        <input
          {...shared('contactName', true)}
          autoComplete="name"
          maxLength={100}
          placeholder="Maya Chen"
          type="text"
          value={buffer.contactName}
          onBlur={(event) => commitText('contactName', event.currentTarget.value)}
          onChange={(event) => updateBuffer('contactName', event.target.value)}
        />
      </FieldGroup>

      <FieldGroup
        label="Email"
        htmlFor="email"
        error={errors.email}
        provenance={provenanceLabel(provenance.email)}
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
        label="Event type"
        htmlFor="eventType"
        error={errors.eventType}
        provenance={provenanceLabel(provenance.eventType)}
      >
        <input
          {...shared('eventType', true)}
          maxLength={160}
          placeholder="Creative coding workshop"
          type="text"
          value={buffer.eventType}
          onBlur={(event) => commitText('eventType', event.currentTarget.value)}
          onChange={(event) => updateBuffer('eventType', event.target.value)}
        />
      </FieldGroup>

      <FieldGroup
        label="Preferred date"
        htmlFor="preferredDate"
        error={errors.preferredDate}
        provenance={provenanceLabel(provenance.preferredDate)}
      >
        <input
          {...shared('preferredDate', true)}
          type="date"
          value={buffer.preferredDate}
          onBlur={(event) => commitText('preferredDate', event.currentTarget.value)}
          onChange={(event) => updateBuffer('preferredDate', event.target.value)}
        />
      </FieldGroup>

      <FieldGroup
        label="Estimated attendee count"
        htmlFor="estimatedAttendeeCount"
        error={errors.estimatedAttendeeCount}
        provenance={provenanceLabel(provenance.estimatedAttendeeCount)}
      >
        <input
          {...shared('estimatedAttendeeCount', true)}
          inputMode="numeric"
          max={1000}
          min={1}
          placeholder="20"
          type="number"
          value={buffer.estimatedAttendeeCount}
          onBlur={(event) => commitAttendeeCount(event.currentTarget.value)}
          onChange={(event) =>
            updateBuffer('estimatedAttendeeCount', event.target.value)
          }
        />
      </FieldGroup>

      <div className="field--wide">
        <FieldGroup
          label="Event goal"
          htmlFor="eventGoal"
          error={errors.eventGoal}
          provenance={provenanceLabel(provenance.eventGoal)}
        >
          <textarea
            {...shared('eventGoal', true)}
            maxLength={1000}
            placeholder="What should this gathering make possible?"
            value={buffer.eventGoal}
            onBlur={(event) => commitText('eventGoal', event.currentTarget.value)}
            onChange={(event) => updateBuffer('eventGoal', event.target.value)}
          />
        </FieldGroup>
      </div>

      {OPTIONAL_FIELD_DEFINITIONS.map((definition) => {
        const field = definition.name
        const authorized = authorizations[field]
        const common = {
          ...shared(field, false, true),
          disabled: disabled || !authorized,
        }
        const hint = authorized
          ? 'Human-authorized for disclosure.'
          : 'Withheld. Authorize this field in the disclosure controls first.'
        const withheldPlaceholder = authorized ? undefined : 'Not authorized'

        if (field === 'additionalNotes') {
          return (
            <div className="field--wide" key={field}>
              <FieldGroup
                label={definition.label}
                htmlFor={field}
                hint={hint}
                error={errors[field]}
                optional
                provenance={provenanceLabel(provenance[field])}
              >
                <textarea
                  {...common}
                  maxLength={2000}
                  placeholder={
                    withheldPlaceholder ??
                    'Only context you intentionally choose to share'
                  }
                  value={buffer[field]}
                  onBlur={(event) => commitText(field, event.currentTarget.value)}
                  onChange={(event) => updateBuffer(field, event.target.value)}
                />
              </FieldGroup>
            </div>
          )
        }

        if (field === 'budgetRange') {
          return (
            <FieldGroup
              key={field}
              label={definition.label}
              htmlFor={field}
              hint={hint}
              error={errors[field]}
              optional
              provenance={provenanceLabel(provenance[field])}
            >
              <input
                {...common}
                maxLength={120}
                placeholder={withheldPlaceholder ?? 'For example, $1,000–$2,500'}
                type="text"
                value={buffer[field]}
                onBlur={(event) => commitText(field, event.currentTarget.value)}
                onChange={(event) => updateBuffer(field, event.target.value)}
              />
            </FieldGroup>
          )
        }

        return (
          <FieldGroup
            key={field}
            label={definition.label}
            htmlFor={field}
            hint={hint}
            error={errors[field]}
            optional
            provenance={provenanceLabel(provenance[field])}
          >
            <input
              {...common}
              autoComplete={field === 'phone' ? 'tel' : 'off'}
              maxLength={field === 'phone' ? 40 : 100}
              placeholder={
                withheldPlaceholder ?? (field === 'phone' ? '215-555-0134' : '@maya')
              }
              type={field === 'phone' ? 'tel' : 'text'}
              value={buffer[field]}
              onBlur={(event) => commitText(field, event.currentTarget.value)}
              onChange={(event) => updateBuffer(field, event.target.value)}
            />
          </FieldGroup>
        )
      })}
    </div>
  )
}
