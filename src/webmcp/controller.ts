import { createSecondSurfaceTools } from './tools'
import type { SecondSurfaceWebMcpAdapterProvider } from './types'

/** Injectable subset of `document.modelContext` used for progressive enhancement. */
export interface WebMcpRegistrationTarget {
  registerTool(
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ): Promise<void>
}

/** Observable registration lifecycle, including a non-fatal unsupported state. */
export type WebMcpRegistrationPhase =
  | 'idle'
  | 'unsupported'
  | 'registering'
  | 'ready'
  | 'error'
  | 'stopped'

/** Copy-safe status published to the UI without exposing controller internals. */
export interface WebMcpRegistrationStatus {
  phase: WebMcpRegistrationPhase
  supported: boolean
  registeredToolCount: number
  error?: string
}

/**
 * Idempotent registration lifecycle. Stopping invalidates in-flight work and
 * aborts registrations created by the current run.
 */
export interface SecondSurfaceWebMcpController {
  start(): Promise<WebMcpRegistrationStatus>
  stop(): void
  getStatus(): WebMcpRegistrationStatus
}

/** Dependencies and status observer for a registration controller instance. */
export interface CreateSecondSurfaceWebMcpControllerOptions {
  getAdapter: SecondSurfaceWebMcpAdapterProvider
  /** Pass null to force the unsupported path. Omit to use document.modelContext. */
  modelContext?: WebMcpRegistrationTarget | null
  onStatusChange?: (status: WebMcpRegistrationStatus) => void
}

function defaultModelContext(): WebMcpRegistrationTarget | null {
  if (typeof document === 'undefined') return null
  return document.modelContext ?? null
}

function registrationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message
  return 'WebMCP tool registration failed.'
}

/**
 * Registers the fixed tool set on the top-level native WebMCP context when
 * available. Readiness is reported only after every registration resolves;
 * unsupported browsers remain fully functional through the visible UI.
 */
export function createSecondSurfaceWebMcpController(
  options: CreateSecondSurfaceWebMcpControllerOptions,
): SecondSurfaceWebMcpController {
  const tools = createSecondSurfaceTools(options.getAdapter)
  let status: WebMcpRegistrationStatus = {
    phase: 'idle',
    supported: false,
    registeredToolCount: 0,
  }
  let registrationController: AbortController | null = null
  let pendingStart: Promise<WebMcpRegistrationStatus> | null = null
  let runId = 0

  const publish = (
    nextStatus: WebMcpRegistrationStatus,
  ): WebMcpRegistrationStatus => {
    status = nextStatus
    options.onStatusChange?.({ ...status })
    return { ...status }
  }

  const start = (): Promise<WebMcpRegistrationStatus> => {
    if (status.phase === 'ready') return Promise.resolve({ ...status })
    if (pendingStart) return pendingStart

    const modelContext =
      options.modelContext === undefined
        ? defaultModelContext()
        : options.modelContext

    if (
      modelContext === null ||
      typeof modelContext.registerTool !== 'function'
    ) {
      return Promise.resolve(
        publish({
          phase: 'unsupported',
          supported: false,
          registeredToolCount: 0,
        }),
      )
    }

    const thisRun = ++runId
    const controller = new AbortController()
    registrationController = controller
    publish({
      phase: 'registering',
      supported: true,
      registeredToolCount: 0,
    })

    pendingStart = (async () => {
      try {
        await Promise.all(
          tools.map((tool) =>
            modelContext.registerTool(tool, { signal: controller.signal }),
          ),
        )

        if (thisRun !== runId) return { ...status }
        return publish({
          phase: 'ready',
          supported: true,
          registeredToolCount: tools.length,
        })
      } catch (error) {
        controller.abort()
        if (thisRun !== runId) return { ...status }
        registrationController = null
        return publish({
          phase: 'error',
          supported: true,
          registeredToolCount: 0,
          error: registrationErrorMessage(error),
        })
      } finally {
        if (thisRun === runId) pendingStart = null
      }
    })()

    return pendingStart
  }

  return {
    start,
    stop() {
      runId += 1
      registrationController?.abort()
      registrationController = null
      pendingStart = null
      publish({
        phase: 'stopped',
        supported: status.supported,
        registeredToolCount: 0,
      })
    },
    getStatus() {
      return { ...status }
    },
  }
}
