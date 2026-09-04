import {
  approveReviewFromHuman,
  confirmNextStepIntentFromHuman,
  createDomainDependencies,
  createInitialState,
  getDisclosureReceipt,
  getIntakeRequirements,
  freezePermissionSlipState,
  prepareSubmissionReview,
  rejectStaleAsyncOperation,
  replaceDraftFromAgent,
  resetFromHuman,
  returnToEditingFromHuman,
  setContactPermissionFromHuman,
  setOptionalDisclosureFromHuman,
  submitApprovedIntake,
  updateDraftFromHuman,
  verifyAssistantSuggestionsFromHuman,
  type ApprovalInput,
  type ApprovalResult,
  type AssistantVerificationResult,
  type ContactPermissionName,
  type ContactPermissionResult,
  type DisclosureAuthorizationResult,
  type DisclosureReceipt,
  type DomainDependencies,
  type DraftIntakeResult,
  type HumanDraftUpdateResult,
  type IntakeRequirements,
  type NextStepIntentResult,
  type OperationResult,
  type OptionalFieldName,
  type PermissionSlipState,
  type PreparedReviewResult,
  type ResetResult,
  type ReturnToEditingResult,
  type SubmissionResult,
} from '../domain'
import {
  clearPermissionSlipState,
  DEFAULT_STORAGE_KEY,
  parsePermissionSlipState,
  readPermissionSlipState,
  savePermissionSlipState,
  serializePermissionSlipState,
  type StorageLike,
} from './persistence'

/**
 * Capabilities safe to expose to WebMCP. Approval, authorization changes, and
 * reset are deliberately absent so an agent cannot acquire human authority.
 */
export interface AgentFacade {
  getIntakeRequirements: () => IntakeRequirements
  draftIntake: (input: unknown) => OperationResult<DraftIntakeResult>
  prepareSubmissionReview: (
    signal?: AbortSignal,
  ) => Promise<OperationResult<PreparedReviewResult>>
  submitApprovedIntake: (
    reviewId: unknown,
    signal?: AbortSignal,
  ) => Promise<OperationResult<SubmissionResult>>
  getDisclosureReceipt: (receiptId?: unknown) => OperationResult<DisclosureReceipt>
}

/** Human UI capabilities, including the operations that establish consent. */
export interface HumanFacade {
  updateDraft: (patch: unknown) => OperationResult<HumanDraftUpdateResult>
  setOptionalDisclosure: (
    field: OptionalFieldName,
    authorized: boolean,
  ) => OperationResult<DisclosureAuthorizationResult>
  verifyAssistantSuggestions: () => OperationResult<AssistantVerificationResult>
  setNextStepIntent: (
    confirmed: boolean,
  ) => OperationResult<NextStepIntentResult>
  setContactPermission: (
    permission: ContactPermissionName,
    granted: boolean,
  ) => OperationResult<ContactPermissionResult>
  prepareSubmissionReview: () => Promise<OperationResult<PreparedReviewResult>>
  approveReview: (input: ApprovalInput) => OperationResult<ApprovalResult>
  returnToEditing: () => OperationResult<ReturnToEditingResult>
  submitApprovedIntake: (
    reviewId: string,
  ) => Promise<OperationResult<SubmissionResult>>
  reset: () => OperationResult<ResetResult>
}

/** Store seams for deterministic tests, alternate storage, and explicit hydration. */
export interface PermissionSlipStoreOptions {
  storage?: StorageLike | null
  storageKey?: string
  dependencies?: Partial<DomainDependencies>
  initialState?: PermissionSlipState
}

/** Callback notified after the store commits an authoritative state change. */
export type PermissionSlipStoreListener = () => void

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function statesMatch(
  left: PermissionSlipState,
  right: PermissionSlipState,
): boolean {
  return (
    serializePermissionSlipState(left) === serializePermissionSlipState(right)
  )
}

/**
 * Coordinates one immutable state stream for the React UI and WebMCP tools.
 * Domain operations remain authoritative; persistence and cross-tab sync cannot
 * bypass their approval or revision invariants.
 */
export class PermissionSlipStore {
  private state: PermissionSlipState
  private readonly listeners = new Set<PermissionSlipStoreListener>()
  private readonly storage: StorageLike | null
  private readonly storageKey: string
  private readonly dependencies: DomainDependencies
  private readonly observesBrowserStorage: boolean
  private hasUnpersistedState = false
  private ignorePersistedState = false

  readonly agent: AgentFacade
  readonly human: HumanFacade

  constructor(options: PermissionSlipStoreOptions = {}) {
    this.storage = options.storage === undefined ? getBrowserStorage() : options.storage
    this.observesBrowserStorage =
      options.storage === undefined && this.storage !== null
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
    this.dependencies = createDomainDependencies(options.dependencies)

    const suppliedInitialState = options.initialState
      ? parsePermissionSlipState(options.initialState)
      : null
    const persisted = readPermissionSlipState(this.storage, this.storageKey)

    if (suppliedInitialState) {
      this.state = freezePermissionSlipState(suppliedInitialState)
      const matchesPersistedState =
        persisted.status === 'valid' &&
        statesMatch(suppliedInitialState, persisted.state)
      this.hasUnpersistedState = !matchesPersistedState
      this.ignorePersistedState = !matchesPersistedState
    } else if (persisted.status === 'valid') {
      this.state = freezePermissionSlipState(persisted.state)
    } else {
      this.state = createInitialState()
      if (persisted.status === 'invalid') {
        const cleared = clearPermissionSlipState(this.storage, this.storageKey)
        this.hasUnpersistedState = !cleared
        this.ignorePersistedState = !cleared
      } else if (persisted.status === 'unavailable') {
        this.hasUnpersistedState = true
        this.ignorePersistedState = true
      }
    }

    this.agent = Object.freeze({
      getIntakeRequirements: () => {
        this.synchronizeFromStorage()
        return getIntakeRequirements(this.state)
      },
      draftIntake: (input: unknown) => {
        this.synchronizeFromStorage()
        return this.commit(
          replaceDraftFromAgent(this.state, input, this.dependencies),
        )
      },
      prepareSubmissionReview: (signal?: AbortSignal) =>
        this.prepareReview('agent', signal),
      submitApprovedIntake: (reviewId: unknown, signal?: AbortSignal) =>
        this.submit(reviewId, 'agent', signal),
      getDisclosureReceipt: (receiptId?: unknown) => {
        this.synchronizeFromStorage()
        return getDisclosureReceipt(this.state, receiptId)
      },
    })

    this.human = Object.freeze({
      updateDraft: (patch: unknown) => {
        this.synchronizeFromStorage()
        return this.commit(
          updateDraftFromHuman(this.state, patch, this.dependencies),
        )
      },
      setOptionalDisclosure: (
        field: OptionalFieldName,
        authorized: boolean,
      ) => {
        this.synchronizeFromStorage()
        return this.commit(
          setOptionalDisclosureFromHuman(
            this.state,
            field,
            authorized,
            this.dependencies,
          ),
        )
      },
      verifyAssistantSuggestions: () => {
        this.synchronizeFromStorage()
        return this.commit(
          verifyAssistantSuggestionsFromHuman(this.state, this.dependencies),
        )
      },
      setNextStepIntent: (confirmed: boolean) => {
        this.synchronizeFromStorage()
        return this.commit(
          confirmNextStepIntentFromHuman(
            this.state,
            confirmed,
            this.dependencies,
          ),
        )
      },
      setContactPermission: (
        permission: ContactPermissionName,
        granted: boolean,
      ) => {
        this.synchronizeFromStorage()
        return this.commit(
          setContactPermissionFromHuman(
            this.state,
            permission,
            granted,
            this.dependencies,
          ),
        )
      },
      prepareSubmissionReview: () => this.prepareReview('human'),
      approveReview: (input: ApprovalInput) => {
        this.synchronizeFromStorage()
        return this.commit(
          approveReviewFromHuman(this.state, input, this.dependencies),
        )
      },
      returnToEditing: () => {
        this.synchronizeFromStorage()
        return this.commit(
          returnToEditingFromHuman(this.state, this.dependencies),
        )
      },
      submitApprovedIntake: (reviewId: string) =>
        this.submit(reviewId, 'human'),
      reset: () => this.reset(),
    })

    this.listenForStorageChanges()
  }

  /** Current immutable snapshot for `useSyncExternalStore` consumers. */
  readonly getSnapshot = (): PermissionSlipState => this.state

  /** Server-safe snapshot; browser persistence is intentionally not required. */
  readonly getServerSnapshot = (): PermissionSlipState => this.state

  /** Subscribes to committed domain results and accepted storage synchronization. */
  readonly subscribe = (listener: PermissionSlipStoreListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private listenForStorageChanges(): void {
    if (
      typeof window === 'undefined' ||
      !this.storage ||
      !this.observesBrowserStorage
    ) {
      return
    }

    let browserStorage: StorageLike
    try {
      browserStorage = window.localStorage
    } catch {
      return
    }
    if (this.storage !== browserStorage) return

    window.addEventListener('storage', (event) => {
      if (event.key !== null && event.key !== this.storageKey) return
      if (event.storageArea !== null && event.storageArea !== this.storage) return
      this.synchronizeFromStorage()
    })
  }

  private synchronizeFromStorage(): void {
    if (!this.storage || this.ignorePersistedState) return

    const persisted = readPermissionSlipState(this.storage, this.storageKey)
    if (persisted.status === 'unavailable') return

    if (persisted.status === 'missing' && this.hasUnpersistedState) return

    let nextState: PermissionSlipState
    if (persisted.status === 'valid') {
      nextState = persisted.state
    } else {
      nextState = createInitialState()
      if (persisted.status === 'invalid') {
        const cleared = clearPermissionSlipState(this.storage, this.storageKey)
        this.hasUnpersistedState = !cleared
        this.ignorePersistedState = !cleared
      }
    }

    if (statesMatch(this.state, nextState)) {
      if (persisted.status !== 'invalid') {
        this.hasUnpersistedState = false
      }
      return
    }

    this.state = freezePermissionSlipState(nextState)
    if (persisted.status !== 'invalid') {
      this.hasUnpersistedState = false
    }
    this.notify()
  }

  private persistCurrentState(): void {
    if (savePermissionSlipState(this.storage, this.state, this.storageKey)) {
      this.hasUnpersistedState = false
      this.ignorePersistedState = false
      return
    }

    this.hasUnpersistedState = true
    this.ignorePersistedState = !clearPermissionSlipState(
      this.storage,
      this.storageKey,
    )
  }

  private commit<T>(result: OperationResult<T>): OperationResult<T> {
    if (result.state !== this.state) {
      this.state = result.state
      this.persistCurrentState()
      this.notify()
    }
    return result
  }

  private async prepareReview(
    actor: 'agent' | 'human',
    signal?: AbortSignal,
  ): Promise<OperationResult<PreparedReviewResult>> {
    if (signal?.aborted) throw signal.reason
    this.synchronizeFromStorage()
    const startingState = this.state
    const result = await prepareSubmissionReview(
      startingState,
      actor,
      this.dependencies,
    )
    if (signal?.aborted) throw signal.reason
    this.synchronizeFromStorage()
    if (this.state !== startingState) {
      return this.commit(
        rejectStaleAsyncOperation(
          this.state,
          actor,
          'review_prepared',
          this.dependencies,
        ),
      )
    }
    return this.commit(result)
  }

  private async submit(
    reviewId: unknown,
    actor: 'agent' | 'human',
    signal?: AbortSignal,
  ): Promise<OperationResult<SubmissionResult>> {
    if (signal?.aborted) throw signal.reason
    this.synchronizeFromStorage()
    const startingState = this.state
    const result = await submitApprovedIntake(
      startingState,
      reviewId,
      actor,
      this.dependencies,
    )
    if (signal?.aborted) throw signal.reason
    this.synchronizeFromStorage()
    if (this.state !== startingState) {
      return this.commit(
        rejectStaleAsyncOperation(
          this.state,
          actor,
          'intake_submitted',
          this.dependencies,
        ),
      )
    }
    return this.commit(result)
  }

  private reset(): OperationResult<ResetResult> {
    const result = resetFromHuman()
    this.state = result.state
    const cleared = clearPermissionSlipState(this.storage, this.storageKey)
    const replacedWithEmptyState =
      cleared || savePermissionSlipState(this.storage, this.state, this.storageKey)
    this.hasUnpersistedState = !replacedWithEmptyState
    this.ignorePersistedState = !replacedWithEmptyState
    this.notify()
    return result
  }
}

let defaultStore: PermissionSlipStore | undefined

/**
 * Lazily creates the application-wide store so tool registration and React
 * rendering resolve the same live state rather than parallel instances.
 */
export function getDefaultPermissionSlipStore(): PermissionSlipStore {
  defaultStore ??= new PermissionSlipStore()
  return defaultStore
}
