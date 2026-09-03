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

export function IntakeForm({
  draft,
  authorizations,
  provenance,
  errors,
  disabled = false,
  onChange,
}: IntakeFormProps) {
  const shared = (
    field: IntakeFieldName,
    alwaysDescribed = false,
  ) => ({
    disabled,
    id: field,
    name: field,
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
          {...shared('contactName')}
          autoComplete="name"
          maxLength={100}
          placeholder="Maya Chen"
          type="text"
          defaultValue={draft.contactName ?? ''}
          onBlur={(event) => onChange('contactName', event.target.value)}
        />
      </FieldGroup>

      <FieldGroup
        label="Email"
        htmlFor="email"
        error={errors.email}
        provenance={provenanceLabel(provenance.email)}
      >
        <input
          {...shared('email')}
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          placeholder="maya.chen@example.com"
          type="email"
          defaultValue={draft.email ?? ''}
          onBlur={(event) => onChange('email', event.target.value)}
        />
      </FieldGroup>

      <FieldGroup
        label="Event type"
        htmlFor="eventType"
        error={errors.eventType}
        provenance={provenanceLabel(provenance.eventType)}
      >
        <input
          {...shared('eventType')}
          maxLength={160}
          placeholder="Creative coding workshop"
          type="text"
          defaultValue={draft.eventType ?? ''}
          onBlur={(event) => onChange('eventType', event.target.value)}
        />
      </FieldGroup>

      <FieldGroup
        label="Preferred date"
        htmlFor="preferredDate"
        error={errors.preferredDate}
        provenance={provenanceLabel(provenance.preferredDate)}
      >
        <input
          {...shared('preferredDate')}
          type="date"
          defaultValue={draft.preferredDate ?? ''}
          onBlur={(event) => onChange('preferredDate', event.target.value)}
        />
      </FieldGroup>

      <FieldGroup
        label="Estimated attendee count"
        htmlFor="estimatedAttendeeCount"
        error={errors.estimatedAttendeeCount}
        provenance={provenanceLabel(provenance.estimatedAttendeeCount)}
      >
        <input
          {...shared('estimatedAttendeeCount')}
          inputMode="numeric"
          max={1000}
          min={1}
          placeholder="20"
          type="number"
          defaultValue={draft.estimatedAttendeeCount ?? ''}
          onBlur={(event) => {
            const rawValue = event.target.value
            onChange(
              'estimatedAttendeeCount',
              rawValue === '' ? undefined : Number(rawValue),
            )
          }}
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
            {...shared('eventGoal')}
            maxLength={1000}
            placeholder="What should this gathering make possible?"
            defaultValue={draft.eventGoal ?? ''}
            onBlur={(event) => onChange('eventGoal', event.target.value)}
          />
        </FieldGroup>
      </div>

      {OPTIONAL_FIELD_DEFINITIONS.map((definition) => {
        const field = definition.name
        const authorized = authorizations[field]
        const common = {
          ...shared(field, true),
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
                  defaultValue={draft[field] ?? ''}
                  onBlur={(event) => onChange(field, event.target.value)}
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
                defaultValue={draft[field] ?? ''}
                onBlur={(event) => onChange(field, event.target.value)}
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
              defaultValue={draft[field] ?? ''}
              onBlur={(event) => onChange(field, event.target.value)}
            />
          </FieldGroup>
        )
      })}
    </div>
  )
}
