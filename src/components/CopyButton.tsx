import { useEffect, useState } from 'react'

interface CopyButtonProps {
  label: string
  text: string
  className?: string
}

export function CopyButton({ label, text, className = '' }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const timeout = window.setTimeout(() => setState('idle'), 2200)
    return () => window.clearTimeout(timeout)
  }, [state])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  const visibleLabel =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label

  return (
    <button
      className={`button button--quiet ${className}`.trim()}
      type="button"
      onClick={() => void copy()}
      aria-live="polite"
    >
      <span aria-hidden="true">{state === 'copied' ? '✓' : '⧉'}</span>
      {visibleLabel}
    </button>
  )
}
