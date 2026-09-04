import { describe, expect, it, vi } from 'vitest'
import type { DomainDependencies, OperationResult } from '../domain'
import {
  DEFAULT_STORAGE_KEY,
  PERSISTED_STATE_VERSION,
  PermissionSlipStore,
  loadPermissionSlipState,
  parsePermissionSlipState,
  type StorageLike,
} from './index'

const validDraft = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  inquiryType: 'prototype',
  desiredOutcome: 'Turn a rough product idea into a working browser prototype.',
  relevantBackground:
    'Maya has a validated concept and early sketches but no implementation yet.',
  timeline: 'A working prototype within six weeks',
  preferredResponseMethod: 'email',
  requestedNextStep: 'discovery_call',
} as const

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  throwOnSet = false
  throwOnNextRemove = false

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    if (this.throwOnSet) throw new Error('quota')
    this.values.set(key, value)
  }

  removeItem(key: string) {
    if (this.throwOnNextRemove) {
      this.throwOnNextRemove = false
      throw new Error('blocked')
    }
    this.values.delete(key)
  }
}

function deterministicDependencies(
  instance = 'store',
  digest: DomainDependencies['digest'] = async (canonical) =>
    `digest_${canonical.length}`,
): Partial<DomainDependencies> {
  let id = 0
  let tick = 0
  return {
    now: () => new Date(Date.UTC(2026, 8, 3, 14, 0, tick++)).toISOString(),
    createId: (kind) => `${kind}_${instance}_${++id}`,
    digest,
  }
}

function expectSuccess<T>(result: OperationResult<T>): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected success, received ${result.error.code}`)
  return result.data
}

function makeReviewReady(store: PermissionSlipStore): void {
  expectSuccess(store.agent.draftIntake(validDraft))
  expectSuccess(store.human.verifyAssistantSuggestions())
  expectSuccess(store.human.setNextStepIntent(true))
  expectSuccess(store.human.setContactPermission('projectResponse', true))
}

async function prepareAndApprove(store: PermissionSlipStore) {
  makeReviewReady(store)
  const prepared = expectSuccess(await store.agent.prepareSubmissionReview())
  expectSuccess(
    store.human.approveReview({
      reviewId: prepared.reviewId,
      digest: prepared.digest,
      revision: prepared.revision,
    }),
  )
  return prepared
}

describe('PermissionSlipStore', () => {
  it('keeps consent-setting operations off the agent facade', () => {
    const store = new PermissionSlipStore({ storage: null })

    expect(Object.keys(store.agent).sort()).toEqual([
      'draftIntake',
      'getDisclosureReceipt',
      'getIntakeRequirements',
      'prepareSubmissionReview',
      'submitApprovedIntake',
    ])
    expect(store.agent).not.toHaveProperty('verifyAssistantSuggestions')
    expect(store.agent).not.toHaveProperty('setNextStepIntent')
    expect(store.agent).not.toHaveProperty('setContactPermission')
    expect(store.agent).not.toHaveProperty('setOptionalDisclosure')
    expect(store.agent).not.toHaveProperty('approveReview')
    expect(store.agent).not.toHaveProperty('reset')
    expect(store.human).toMatchObject({
      verifyAssistantSuggestions: expect.any(Function),
      setNextStepIntent: expect.any(Function),
      setContactPermission: expect.any(Function),
    })
  })

  it('persists and hydrates version 2 intent, permissions, and provenance', () => {
    const storage = new MemoryStorage()
    const first = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies('first'),
    })

    expectSuccess(first.agent.draftIntake(validDraft))
    expectSuccess(first.human.verifyAssistantSuggestions())
    expectSuccess(first.human.setNextStepIntent(true))
    expectSuccess(first.human.setContactPermission('projectResponse', true))
    expectSuccess(first.human.setContactPermission('occasionalUpdates', true))

    const raw = storage.getItem(DEFAULT_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '{}').version).toBe(PERSISTED_STATE_VERSION)

    const second = new PermissionSlipStore({ storage })
    expect(second.getSnapshot()).toMatchObject({
      stateVersion: 2,
      status: 'draft',
      draft: validDraft,
      nextStepIntentConfirmed: true,
      contactPermissions: {
        projectResponse: true,
        occasionalUpdates: true,
      },
      inquiryProvenance: {
        entrySource: 'webmcp',
        referralSource: null,
        campaign: null,
      },
    })
    expect(second.getSnapshot().fieldProvenance.desiredOutcome).toMatchObject({
      source: 'assistant_suggested',
      verifiedByHuman: true,
    })
  })

  it('invalidates version 1 and malformed or impossible persisted state', () => {
    const storage = new MemoryStorage()
    storage.setItem(
      DEFAULT_STORAGE_KEY,
      JSON.stringify({ version: 1, state: { stateVersion: 1 } }),
    )
    expect(new PermissionSlipStore({ storage }).getSnapshot().status).toBe(
      'empty',
    )
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()

    storage.setItem(DEFAULT_STORAGE_KEY, '{broken')
    expect(new PermissionSlipStore({ storage }).getSnapshot().status).toBe(
      'empty',
    )

    const initial = new PermissionSlipStore({ storage: null }).getSnapshot()
    storage.setItem(
      DEFAULT_STORAGE_KEY,
      JSON.stringify({
        version: PERSISTED_STATE_VERSION,
        state: { ...initial, status: 'submitted' },
      }),
    )
    expect(loadPermissionSlipState(storage)).toBeNull()
  })

  it('rejects tampered review relationships and unsafe provenance', async () => {
    const store = new PermissionSlipStore({
      storage: null,
      dependencies: deterministicDependencies(),
    })
    makeReviewReady(store)
    expectSuccess(await store.agent.prepareSubmissionReview())
    const state = store.getSnapshot()

    expect(
      parsePermissionSlipState({
        ...state,
        contactPermissions: {
          ...state.contactPermissions,
          occasionalUpdates: true,
        },
      }),
    ).toBeNull()
    expect(
      parsePermissionSlipState({
        ...state,
        inquiryProvenance: {
          ...state.inquiryProvenance,
          referralSource: 'https://example.com/private?email=maya',
        },
      }),
    ).toBeNull()
    expect(
      parsePermissionSlipState({
        ...state,
        review: state.review
          ? {
              ...state.review,
              payload: {
                ...state.review.payload,
                nextStepIntentConfirmed: false,
              },
            }
          : null,
      }),
    ).toBeNull()
  })

  it('continues safely when storage throws and reset restores safe defaults', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const store = new PermissionSlipStore({ storage })

    expect(() =>
      store.human.updateDraft({ contactName: 'Maya Chen' }),
    ).not.toThrow()
    expect(store.getSnapshot().draft.contactName).toBe('Maya Chen')
    expect(() => store.human.reset()).not.toThrow()
    expect(store.getSnapshot()).toMatchObject({
      stateVersion: 2,
      status: 'empty',
      nextStepIntentConfirmed: false,
      contactPermissions: {
        projectResponse: false,
        occasionalUpdates: false,
      },
      inquiryProvenance: {
        entrySource: 'direct',
        referralSource: null,
        campaign: null,
      },
    })
  })

  it('notifies subscribers for changes but not no-op updates', () => {
    const store = new PermissionSlipStore({ storage: null })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.human.updateDraft({ contactName: 'Maya Chen' })
    store.human.updateDraft({ contactName: 'Maya Chen' })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.human.updateDraft({ email: 'maya.chen@example.com' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('rejects an async review if state changes while hashing', async () => {
    let resolveDigest: ((value: string) => void) | undefined
    const digest = () =>
      new Promise<string>((resolve) => {
        resolveDigest = resolve
      })
    const store = new PermissionSlipStore({
      storage: null,
      dependencies: deterministicDependencies('pending', digest),
    })
    makeReviewReady(store)

    const pendingReview = store.agent.prepareSubmissionReview()
    store.human.updateDraft({
      desiredOutcome: 'A changed prototype outcome while hashing is pending.',
    })
    resolveDigest?.('digest_after_change')
    const result = await pendingReview

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected stale operation rejection')
    expect(result.error.code).toBe('STALE_OPERATION')
    expect(store.getSnapshot()).toMatchObject({
      status: 'draft',
      review: null,
      approval: null,
      draft: {
        desiredOutcome: 'A changed prototype outcome while hashing is pending.',
      },
    })
  })

  it('resynchronizes storage and records a stale cross-tab failure', async () => {
    const storage = new MemoryStorage()
    const firstTab = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies('first'),
    })
    makeReviewReady(firstTab)
    const prepared = expectSuccess(
      await firstTab.agent.prepareSubmissionReview(),
    )

    const secondTab = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies('second'),
    })
    expectSuccess(
      firstTab.human.approveReview({
        reviewId: prepared.reviewId,
        digest: prepared.digest,
        revision: prepared.revision,
      }),
    )
    expectSuccess(
      secondTab.human.updateDraft({
        desiredOutcome: 'A new outcome saved from another open tab.',
      }),
    )

    const submitted = await firstTab.agent.submitApprovedIntake(
      prepared.reviewId,
    )
    expect(submitted.ok).toBe(false)
    if (submitted.ok || !submitted.failureReceipt) {
      throw new Error('Expected a persisted failure receipt')
    }
    expect(submitted.error.code).toBe('REVIEW_NOT_FOUND')
    expect(submitted.failureReceipt.outcome).toBe('rejected')
    expect(firstTab.getSnapshot()).toMatchObject({
      status: 'draft',
      approval: null,
      review: null,
      draft: { desiredOutcome: 'A new outcome saved from another open tab.' },
    })
    expect(loadPermissionSlipState(storage)?.receipts).toEqual([
      submitted.failureReceipt,
    ])
  })

  it('does not commit an aborted agent review', async () => {
    let resolveDigest: ((value: string) => void) | undefined
    const digest = () =>
      new Promise<string>((resolve) => {
        resolveDigest = resolve
      })
    const store = new PermissionSlipStore({
      storage: null,
      dependencies: deterministicDependencies('aborted', digest),
    })
    makeReviewReady(store)
    const invocation = new AbortController()

    const pendingReview = store.agent.prepareSubmissionReview(invocation.signal)
    invocation.abort()
    resolveDigest?.('digest_after_abort')

    await expect(pendingReview).rejects.toMatchObject({ name: 'AbortError' })
    expect(store.getSnapshot()).toMatchObject({
      status: 'draft',
      review: null,
      approval: null,
    })
  })

  it('recovers the durable local success receipt on the same origin', async () => {
    const storage = new MemoryStorage()
    const first = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies('first'),
    })
    const prepared = await prepareAndApprove(first)
    const submitted = expectSuccess(
      await first.agent.submitApprovedIntake(prepared.reviewId),
    )

    const second = new PermissionSlipStore({ storage })
    const recovered = expectSuccess(
      second.agent.getDisclosureReceipt(submitted.receiptId),
    )
    expect(second.getSnapshot().status).toBe('submitted')
    expect(recovered).toEqual(submitted.receipt)
    expect(recovered).toMatchObject({
      outcome: 'accepted',
      status: 'qualified_inquiry_created',
      frozenSnapshot: validDraft,
      contactPermissions: {
        projectResponse: true,
        occasionalUpdates: false,
      },
      noNetworkTransmission: true,
    })
  })

  it('persists and retrieves a PII-free failure receipt', async () => {
    const storage = new MemoryStorage()
    const first = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies('first'),
    })

    const submitted = await first.agent.submitApprovedIntake('missing_review')
    expect(submitted.ok).toBe(false)
    if (submitted.ok || !submitted.failureReceipt) {
      throw new Error('Expected a failure receipt')
    }

    const second = new PermissionSlipStore({ storage })
    const recovered = expectSuccess(
      second.agent.getDisclosureReceipt(submitted.failureReceipt.receiptId),
    )
    expect(recovered).toEqual(submitted.failureReceipt)
    expect(recovered).toMatchObject({
      outcome: 'rejected',
      status: 'submission_rejected',
      submissionId: null,
      failure: { code: 'REVIEW_NOT_FOUND' },
      noNetworkTransmission: true,
    })
    expect(JSON.stringify(recovered)).not.toContain('Maya Chen')
    expect(JSON.stringify(recovered)).not.toContain('maya.chen@example.com')
  })

  it('replays the original success without duplicating its receipt', async () => {
    const storage = new MemoryStorage()
    const store = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    const prepared = await prepareAndApprove(store)
    const first = expectSuccess(
      await store.agent.submitApprovedIntake(prepared.reviewId),
    )
    const rawAfterFirst = storage.getItem(DEFAULT_STORAGE_KEY)
    const replay = expectSuccess(
      await store.agent.submitApprovedIntake(prepared.reviewId),
    )

    expect(replay.idempotentReplay).toBe(true)
    expect(replay.receiptId).toBe(first.receiptId)
    expect(replay.submissionId).toBe(first.submissionId)
    expect(replay.receipt).toEqual(first.receipt)
    expect(store.getSnapshot().receipts).toHaveLength(1)
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBe(rawAfterFirst)
    expect(new PermissionSlipStore({ storage }).getSnapshot().receipts).toEqual([
      first.receipt,
    ])
  })

  it('clears all state and receipts on human reset', async () => {
    const storage = new MemoryStorage()
    const store = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    const prepared = await prepareAndApprove(store)
    expectSuccess(await store.agent.submitApprovedIntake(prepared.reviewId))

    expectSuccess(store.human.reset())
    expect(store.getSnapshot()).toEqual({
      stateVersion: 2,
      status: 'empty',
      draft: {},
      fieldProvenance: {},
      revision: 0,
      optionalDisclosureAuthorizations: {
        phone: false,
        budgetOrConstraints: false,
        organization: false,
        additionalContext: false,
      },
      nextStepIntentConfirmed: false,
      contactPermissions: {
        projectResponse: false,
        occasionalUpdates: false,
      },
      inquiryProvenance: {
        entrySource: 'direct',
        referralSource: null,
        campaign: null,
      },
      review: null,
      approval: null,
      receipts: [],
      activity: [],
    })
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()
  })

  it('keeps memory authoritative after a storage write failure', async () => {
    const storage = new MemoryStorage()
    const store = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    makeReviewReady(store)
    const prepared = expectSuccess(await store.agent.prepareSubmissionReview())

    storage.throwOnSet = true
    expectSuccess(
      store.human.approveReview({
        reviewId: prepared.reviewId,
        digest: prepared.digest,
        revision: prepared.revision,
      }),
    )
    expect(store.getSnapshot().status).toBe('approved')
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()

    expectSuccess(await store.agent.submitApprovedIntake(prepared.reviewId))
    expect(store.getSnapshot().status).toBe('submitted')
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()
    expect(new PermissionSlipStore({ storage }).getSnapshot().status).toBe(
      'empty',
    )
  })

  it('overwrites stale receipts when reset removal fails', async () => {
    const storage = new MemoryStorage()
    const store = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    const prepared = await prepareAndApprove(store)
    expectSuccess(await store.agent.submitApprovedIntake(prepared.reviewId))

    storage.throwOnNextRemove = true
    expectSuccess(store.human.reset())

    expect(storage.getItem(DEFAULT_STORAGE_KEY)).not.toBeNull()
    expect(new PermissionSlipStore({ storage }).getSnapshot()).toMatchObject({
      stateVersion: 2,
      status: 'empty',
      nextStepIntentConfirmed: false,
      contactPermissions: {
        projectResponse: false,
        occasionalUpdates: false,
      },
      approval: null,
      review: null,
      receipts: [],
    })
  })
})
