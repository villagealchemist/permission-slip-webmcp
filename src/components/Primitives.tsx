import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  className?: string
  id?: string
  tone?: 'cream' | 'dark' | 'violet'
}

export function Panel({
  children,
  className = '',
  id,
  tone = 'cream',
}: PanelProps) {
  return (
    <section
      className={`panel panel--${tone} ${className}`.trim()}
      id={id}
    >
      {children}
    </section>
  )
}

interface SectionHeadingProps {
  eyebrow: string
  title: string
  copy?: string
  action?: ReactNode
  headingId?: string
}

export function SectionHeading({
  eyebrow,
  title,
  copy,
  action,
  headingId,
}: SectionHeadingProps) {
  return (
    <header className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={headingId} tabIndex={headingId ? -1 : undefined}>
          {title}
        </h2>
        {copy ? <p className="section-copy">{copy}</p> : null}
      </div>
      {action ? <div className="section-heading__action">{action}</div> : null}
    </header>
  )
}

interface StatusPillProps {
  label: string
  tone?: 'neutral' | 'active' | 'success' | 'warning'
}

export function StatusPill({ label, tone = 'neutral' }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill--${tone}`}>
      <span className="status-pill__dot" aria-hidden="true" />
      {label}
    </span>
  )
}

interface FieldGroupProps {
  label: string
  hint?: string
  error?: string
  optional?: boolean
  provenance?: 'Human' | 'Agent'
  htmlFor: string
  children: ReactNode
}

export function FieldGroup({
  label,
  hint,
  error,
  optional = false,
  provenance,
  htmlFor,
  children,
}: FieldGroupProps) {
  const messageId = `${htmlFor}-message`
  return (
    <div className={`field ${error ? 'field--error' : ''}`}>
      <div className="field__label-line">
        <label htmlFor={htmlFor}>{label}</label>
        <span className="field__meta">
          {optional ? 'Optional' : 'Required'}
          {provenance ? (
            <span className={`provenance provenance--${provenance.toLowerCase()}`}>
              {provenance}
            </span>
          ) : null}
        </span>
      </div>
      {children}
      {error || hint ? (
        <p className="field__message" id={messageId}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}

interface DefinitionListProps {
  items: ReadonlyArray<{ label: string; value: ReactNode }>
  className?: string
}

export function DefinitionList({ items, className = '' }: DefinitionListProps) {
  return (
    <dl className={`definition-list ${className}`.trim()}>
      {items.map((item) => (
        <div className="definition-list__row" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
