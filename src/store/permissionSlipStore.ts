import {
  approveReviewFromHuman,
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
  setOptionalDisclosureFromHuman,
  submitApprovedIntake,
  updateDraftFromHuman,
  type ApprovalInput,
  type ApprovalResult,
  type DisclosureAuthorizationResult,
  type DisclosureReceipt,
  type DomainDependencies,
  type DraftIntakeResult,
  type HumanDraftUpdateResult,
  type IntakeRequirements,
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
  loadPermissionSlipState,
  parsePermissionSlipState,
  savePermissionSlipState,
  type StorageLike,
} from './persistence'

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

export interface HumanFacade {
  updateDraft: (patch: unknown) => OperationResult<HumanDraftUpdateResult>
  setOptionalDisclosure: (
    field: OptionalFieldName,
    authorized: boolean,
  ) => OperationResult<DisclosureAuthorizationResult>
  prepareSubmissionReview: () => Promise<OperationResult<PreparedReviewResult>>
  approveReview: (input: ApprovalInput) => OperationResult<ApprovalResult>
  returnToEditing: () => OperationResult<ReturnToEditingResult>
  submitApprovedIntake: (
    reviewId: string,
  ) => Promise<OperationResult<SubmissionResult>>
  reset: () => OperationResult<ResetResult>
}

export interface PermissionSlipStoreOptions {
  storage?: StorageLike | null
  storageKey?: string
  dependencies?: Partial<DomainDependencies>
  initialState?: PermissionSlipState
}

type Listener = () => void

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export class PermissionSlipStore {
  private state: PermissionSlipState
  private readonly listeners = new Set<Listener>()
  private readonly storage: StorageLike | null
  private readonly storageKey: string
  private readonly dependencies: DomainDependencies

  readonly agent: AgentFacade
  readonly human: HumanFacade

  constructor(options: PermissionSlipStoreOptions = {}) {
    this.storage = options.storage === undefined ? getBrowserStorage() : options.storage
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
    this.dependencies = createDomainDependencies(options.dependencies)

    const suppliedInitialState = options.initialState
      ? parsePermissionSlipState(options.initialState)
      : null
    this.state = freezePermissionSlipState(
      suppliedInitialState ??
      loadPermissionSlipState(this.storage, this.storageKey) ??
      createInitialState(),
    )

    this.agent = Object.freeze({
      getIntakeRequirements: () => getIntakeRequirements(this.state),
      draftIntake: (input: unknown) =>
        this.commit(
          replaceDraftFromAgent(this.state, input, this.dependencies),
        ),
      prepareSubmissionReview: (signal?: AbortSignal) =>
        this.prepareReview('agent', signal),
      submitApprovedIntake: (reviewId: unknown, signal?: AbortSignal) =>
        this.submit(reviewId, 'agent', signal),
      getDisclosureReceipt: (receiptId?: unknown) =>
        getDisclosureReceipt(this.state, receiptId),
    })

    this.human = Object.freeze({
      updateDraft: (patch: unknown) =>
        this.commit(updateDraftFromHuman(this.state, patch, this.dependencies)),
      setOptionalDisclosure: (
        field: OptionalFieldName,
        authorized: boolean,
      ) =>
        this.commit(
          setOptionalDisclosureFromHuman(
            this.state,
            field,
            authorized,
            this.dependencies,
          ),
        ),
      prepareSubmissionReview: () => this.prepareReview('human'),
      approveReview: (input: ApprovalInput) =>
        this.commit(approveReviewFromHuman(this.state, input, this.dependencies)),
      returnToEditing: () =>
        this.commit(returnToEditingFromHuman(this.state, this.dependencies)),
      submitApprovedIntake: (reviewId: string) =>
        this.submit(reviewId, 'human'),
      reset: () => this.reset(),
    })
  }

  readonly getSnapshot = (): PermissionSlipState => this.state

  readonly getServerSnapshot = (): PermissionSlipState => this.state

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  private commit<T>(result: OperationResult<T>): OperationResult<T> {
    if (result.state !== this.state) {
      this.state = result.state
      savePermissionSlipState(this.storage, this.state, this.storageKey)
      this.notify()
    }
    return result
  }

  private async prepareReview(
    actor: 'agent' | 'human',
    signal?: AbortSignal,
  ): Promise<OperationResult<PreparedReviewResult>> {
    if (signal?.aborted) throw signal.reason
    const startingState = this.state
    const result = await prepareSubmissionReview(
      startingState,
      actor,
      this.dependencies,
    )
    if (signal?.aborted) throw signal.reason
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
    const startingState = this.state
    const result = await submitApprovedIntake(
      startingState,
      reviewId,
      actor,
      this.dependencies,
    )
    if (signal?.aborted) throw signal.reason
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
    clearPermissionSlipState(this.storage, this.storageKey)
    this.notify()
    return result
  }
}

let defaultStore: PermissionSlipStore | undefined

export function getDefaultPermissionSlipStore(): PermissionSlipStore {
  defaultStore ??= new PermissionSlipStore()
  return defaultStore
}
