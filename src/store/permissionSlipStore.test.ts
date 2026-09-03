import { describe, expect, it, vi } from 'vitest'
import type { DomainDependencies } from '../domain'
import {
  DEFAULT_STORAGE_KEY,
  PERSISTED_STATE_VERSION,
  PermissionSlipStore,
  loadPermissionSlipState,
  type StorageLike,
} from './index'

const validDraft = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  eventType: 'Creative coding and mentorship workshop',
  preferredDate: '2026-10-10',
  estimatedAttendeeCount: 20,
  eventGoal:
    'Pair early-career developers with local mentors for a collaborative workshop',
}

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
  digest: DomainDependencies['digest'] = async (canonical) =>
    `digest_${canonical.length}`,
): Partial<DomainDependencies> {
  let id = 0
  let tick = 0
  return {
    now: () => new Date(Date.UTC(2026, 8, 3, 14, 0, tick++)).toISOString(),
    createId: (kind) => `${kind}_${++id}`,
    digest,
  }
}

describe('PermissionSlipStore', () => {
  it('offers an agent facade without human-only disclosure, approval, or reset controls', () => {
    const store = new PermissionSlipStore({
      storage: null,
      dependencies: deterministicDependencies(),
    })

    expect(Object.keys(store.agent).sort()).toEqual([
      'draftIntake',
      'getDisclosureReceipt',
      'getIntakeRequirements',
      'prepareSubmissionReview',
      'submitApprovedIntake',
    ])
    expect(store.agent).not.toHaveProperty('setOptionalDisclosure')
    expect(store.agent).not.toHaveProperty('approveReview')
    expect(store.agent).not.toHaveProperty('reset')
  })

  it('persists versioned state and defensively hydrates it', () => {
    const storage = new MemoryStorage()
    const first = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    first.human.updateDraft({ contactName: 'Maya Chen' })

    const raw = storage.getItem(DEFAULT_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw ?? '{}').version).toBe(PERSISTED_STATE_VERSION)

    const second = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    expect(second.getSnapshot().draft.contactName).toBe('Maya Chen')
    expect(second.getSnapshot().fieldProvenance.contactName?.actor).toBe('human')
  })

  it('falls back to an empty state for malformed, wrong-version, and impossible data', () => {
    const storage = new MemoryStorage()
    storage.setItem(DEFAULT_STORAGE_KEY, '{broken')
    expect(new PermissionSlipStore({ storage }).getSnapshot().status).toBe('empty')

    storage.setItem(
      DEFAULT_STORAGE_KEY,
      JSON.stringify({ version: 99, state: { status: 'submitted' } }),
    )
    expect(loadPermissionSlipState(storage)).toBeNull()

    storage.setItem(
      DEFAULT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          stateVersion: 1,
          status: 'approved',
          draft: {},
          fieldProvenance: {},
          revision: 0,
          optionalDisclosureAuthorizations: {
            phone: false,
            budgetRange: false,
            socialHandle: false,
            additionalNotes: false,
          },
          review: null,
          approval: null,
          receipts: [],
          activity: [],
        },
      }),
    )
    expect(new PermissionSlipStore({ storage }).getSnapshot().status).toBe('empty')
  })

  it('continues safely when storage access throws', () => {
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
    const store = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })

    expect(() => store.human.updateDraft({ contactName: 'Maya Chen' })).not.toThrow()
    expect(store.getSnapshot().draft.contactName).toBe('Maya Chen')
    expect(() => store.human.reset()).not.toThrow()
    expect(store.getSnapshot().status).toBe('empty')
  })

  it('notifies subscribers for changes but not no-op updates', () => {
    const store = new PermissionSlipStore({
      storage: null,
      dependencies: deterministicDependencies(),
    })
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
      dependencies: deterministicDependencies(digest),
    })
    store.agent.draftIntake(validDraft)

    const pendingReview = store.agent.prepareSubmissionReview()
    store.human.updateDraft({ eventType: 'Changed while the digest was pending' })
    resolveDigest?.('digest_after_change')
    const result = await pendingReview

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected rejection')
    expect(result.error.code).toBe('STALE_OPERATION')
    expect(store.getSnapshot().review).toBeNull()
    expect(store.getSnapshot().draft.eventType).toBe(
      'Changed while the digest was pending',
    )
  })

  it('resynchronizes shared storage before submission and rejects a cross-tab stale approval', async () => {
    const storage = new MemoryStorage()
    const firstTab = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    firstTab.agent.draftIntake(validDraft)
    const prepared = await firstTab.agent.prepareSubmissionReview()
    if (!prepared.ok) throw new Error('Expected review')

    const secondTab = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    firstTab.human.approveReview({
      reviewId: prepared.data.reviewId,
      digest: prepared.data.digest,
      revision: prepared.data.revision,
    })
    secondTab.human.updateDraft({
      eventGoal: 'A valid changed goal saved from another open tab',
    })

    const submitted = await firstTab.agent.submitApprovedIntake(
      prepared.data.reviewId,
    )

    expect(submitted.ok).toBe(false)
    expect(firstTab.getSnapshot()).toMatchObject({
      status: 'draft',
      approval: null,
      review: null,
      draft: {
        eventGoal: 'A valid changed goal saved from another open tab',
      },
      receipts: [],
    })
    expect(loadPermissionSlipState(storage)).toMatchObject({
      status: 'draft',
      approval: null,
      review: null,
      draft: {
        eventGoal: 'A valid changed goal saved from another open tab',
      },
      receipts: [],
    })
  })

  it('does not commit an agent review after its invocation is aborted', async () => {
    let resolveDigest: ((value: string) => void) | undefined
    const digest = () =>
      new Promise<string>((resolve) => {
        resolveDigest = resolve
      })
    const store = new PermissionSlipStore({
      storage: null,
      dependencies: deterministicDependencies(digest),
    })
    store.agent.draftIntake(validDraft)
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

  it('clears state, provenance, receipt data, and persistence on human reset', async () => {
    const storage = new MemoryStorage()
    const store = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    store.agent.draftIntake(validDraft)
    const prepared = await store.agent.prepareSubmissionReview()
    if (!prepared.ok) throw new Error('Expected review')
    store.human.approveReview({
      reviewId: prepared.data.reviewId,
      digest: prepared.data.digest,
      revision: prepared.data.revision,
    })
    await store.agent.submitApprovedIntake(prepared.data.reviewId)
    expect(store.getSnapshot().status).toBe('submitted')

    const result = store.human.reset()
    expect(result.ok).toBe(true)
    expect(store.getSnapshot()).toMatchObject({
      status: 'empty',
      draft: {},
      fieldProvenance: {},
      review: null,
      approval: null,
      receipts: [],
      activity: [],
    })
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()
  })

  it('removes the last durable review after a write failure while continuing safely in memory', async () => {
    const storage = new MemoryStorage()
    const store = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    store.agent.draftIntake(validDraft)
    const prepared = await store.agent.prepareSubmissionReview()
    if (!prepared.ok) throw new Error('Expected review')

    storage.throwOnSet = true
    const approved = store.human.approveReview({
      reviewId: prepared.data.reviewId,
      digest: prepared.data.digest,
      revision: prepared.data.revision,
    })

    expect(approved.ok).toBe(true)
    expect(store.getSnapshot().status).toBe('approved')
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()

    const submitted = await store.agent.submitApprovedIntake(
      prepared.data.reviewId,
    )
    expect(submitted.ok).toBe(true)
    expect(store.getSnapshot().status).toBe('submitted')
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).toBeNull()

    const reloaded = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    expect(reloaded.getSnapshot().status).toBe('empty')
  })

  it('overwrites stale persisted approval and receipt data when reset removal fails', async () => {
    const storage = new MemoryStorage()
    const store = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    store.agent.draftIntake(validDraft)
    const prepared = await store.agent.prepareSubmissionReview()
    if (!prepared.ok) throw new Error('Expected review')
    store.human.approveReview({
      reviewId: prepared.data.reviewId,
      digest: prepared.data.digest,
      revision: prepared.data.revision,
    })
    await store.agent.submitApprovedIntake(prepared.data.reviewId)

    storage.throwOnNextRemove = true
    const reset = store.human.reset()

    expect(reset.ok).toBe(true)
    expect(storage.getItem(DEFAULT_STORAGE_KEY)).not.toBeNull()
    const reloaded = new PermissionSlipStore({
      storage,
      dependencies: deterministicDependencies(),
    })
    expect(reloaded.getSnapshot()).toMatchObject({
      status: 'empty',
      approval: null,
      review: null,
      receipts: [],
    })
  })
})
