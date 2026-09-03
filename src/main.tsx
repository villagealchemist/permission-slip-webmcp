import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found.')
}

createRoot(rootElement).render(<App />)

const registration = new AbortController()
const statusElement = document.getElementById('webmcp-probe')

async function registerProbe() {
  if (typeof document.modelContext?.registerTool !== 'function') {
    if (statusElement) {
      statusElement.textContent =
        'WebMCP is unavailable here. The ordinary page remains usable.'
    }
    return
  }

  try {
    await document.modelContext.registerTool(
      {
        name: 'permission_slip_probe',
        description: 'Confirm that this top-level page can expose a WebMCP tool.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
        execute: async () => ({
          ok: true,
          project: 'Permission Slip',
          message: 'Top-level imperative WebMCP registration is working.',
        }),
      },
      { signal: registration.signal },
    )

    if (statusElement) {
      statusElement.textContent = 'WebMCP probe registered: 1 tool available.'
    }
  } catch {
    if (statusElement) {
      statusElement.textContent =
        'WebMCP was detected, but the compatibility probe could not register.'
    }
  }
}

void registerProbe()

if (import.meta.hot) {
  import.meta.hot.dispose(() => registration.abort())
}
