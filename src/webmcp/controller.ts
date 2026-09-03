import { createPermissionSlipTools } from './tools'
import type { PermissionSlipWebMcpAdapterProvider } from './types'

export interface WebMcpRegistrationTarget {
  registerTool(
    tool: WebMCP.ModelContextTool,
    options?: WebMCP.ModelContextRegisterToolOptions,
  ): Promise<void>
}

export type WebMcpRegistrationPhase =
  | 'idle'
  | 'unsupported'
  | 'registering'
  | 'ready'
  | 'error'
  | 'stopped'

export interface WebMcpRegistrationStatus {
  phase: WebMcpRegistrationPhase
  supported: boolean
  registeredToolCount: number
  error?: string
}

export interface PermissionSlipWebMcpController {
  start(): Promise<WebMcpRegistrationStatus>
  stop(): void
  getStatus(): WebMcpRegistrationStatus
}

export interface CreatePermissionSlipWebMcpControllerOptions {
  getAdapter: PermissionSlipWebMcpAdapterProvider
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

export function createPermissionSlipWebMcpController(
  options: CreatePermissionSlipWebMcpControllerOptions,
): PermissionSlipWebMcpController {
  const tools = createPermissionSlipTools(options.getAdapter)
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
