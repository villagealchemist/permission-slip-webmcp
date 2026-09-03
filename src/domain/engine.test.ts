import { describe, expect, it } from 'vitest'
import {
  approveReviewFromHuman,
  canonicalSerialize,
  createInitialState,
  prepareSubmissionReview,
  replaceDraftFromAgent,
  setOptionalDisclosureFromHuman,
  sha256Digest,
  submitApprovedIntake,
  updateDraftFromHuman,
} from './index'
import type {
  DisclosureSnapshot,
  DomainDependencies,
  PermissionSlipState,
} from './types'

const validDraft = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  eventType: 'Creative coding and mentorship workshop',
  preferredDate: '2026-10-10',
  estimatedAttendeeCount: 20,
  eventGoal:
    'Pair early-career developers with local mentors for a collaborative workshop',
}

function deterministicDependencies(
  digest: DomainDependencies['digest'] = async (canonical) =>
    `digest_${canonical.length}`,
): DomainDependencies {
  let id = 0
  let tick = 0
  return {
    now: () => new Date(Date.UTC(2026, 8, 3, 14, 0, tick++)).toISOString(),
    createId: (kind) => `${kind}_${++id}`,
    digest,
  }
}

function expectSuccess<T>(result: { ok: boolean; data?: T }): T {
  expect(result.ok).toBe(true)
  if (!result.ok || result.data === undefined) {
    throw new Error('Expected operation to succeed')
  }
  return result.data
}

function draftedState(dependencies: DomainDependencies): PermissionSlipState {
  const result = replaceDraftFromAgent(
    createInitialState(),
    validDraft,
    dependencies,
  )
  expectSuccess(result)
  return result.state
}

async function approvedState(dependencies: DomainDependencies) {
  const draft = draftedState(dependencies)
  const prepared = await prepareSubmissionReview(draft, 'agent', dependencies)
  const review = expectSuccess(prepared).review
  const approved = approveReviewFromHuman(
    prepared.state,
    {
      reviewId: review.reviewId,
      digest: review.digest,
      revision: review.revision,
    },
    dependencies,
  )
  expectSuccess(approved)
  return { state: approved.state, review }
}

describe('Permission Slip domain engine', () => {
  it('accepts a valid required-only agent draft and marks its provenance', () => {
    const dependencies = deterministicDependencies()
    const result = replaceDraftFromAgent(
      createInitialState(),
      validDraft,
      dependencies,
    )
    const data = expectSuccess(result)

    expect(result.state.status).toBe('draft')
    expect(result.state.draft).toEqual(validDraft)
    expect(data.acceptedFields).toEqual(Object.keys(validDraft))
    expect(data.withheldOptionalFields).toEqual([
      'phone',
      'budgetRange',
      'socialHandle',
      'additionalNotes',
    ])
    expect(result.state.fieldProvenance.contactName?.actor).toBe('agent')
    expect(result.state.fieldProvenance.email?.actor).toBe('agent')
  })

  it('atomically rejects an unauthorized optional field and stores no raw value in activity', () => {
    const dependencies = deterministicDependencies()
    const initial = draftedState(dependencies)
    const beforeDraft = structuredClone(initial.draft)
    const beforeRevision = initial.revision
    const result = replaceDraftFromAgent(
      initial,
      { ...validDraft, phone: '215-555-0134' },
      dependencies,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected rejection')
    expect(result.error.code).toBe('UNAUTHORIZED_OPTIONAL_FIELDS')
    expect(result.error.fields).toEqual(['phone'])
    expect(result.state.draft).toEqual(beforeDraft)
    expect(result.state.revision).toBe(beforeRevision)
    expect(JSON.stringify(result.state.activity)).not.toContain('215-555-0134')
    expect(result.state.activity.at(-1)).toMatchObject({
      actor: 'agent',
      action: 'draft_replaced',
      outcome: 'rejected',
      fieldNames: ['phone'],
    })
  })

  it('rejects unknown properties without changing the draft', () => {
    const dependencies = deterministicDependencies()
    const initial = draftedState(dependencies)
    const result = replaceDraftFromAgent(
      initial,
      { ...validDraft, streetAddress: 'not retained' },
      dependencies,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected rejection')
    expect(result.error.code).toBe('UNKNOWN_FIELDS')
    expect(result.error.fields).toEqual(['streetAddress'])
    expect(result.state.draft).toEqual(initial.draft)
    expect(JSON.stringify(result.state.activity)).not.toContain('not retained')
  })

  it('rejects review creation for an incomplete human draft', async () => {
    const dependencies = deterministicDependencies()
    const updated = updateDraftFromHuman(
      createInitialState(),
      { contactName: 'Maya Chen' },
      dependencies,
    )
    const result = await prepareSubmissionReview(
      updated.state,
      'human',
      dependencies,
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Expected rejection')
    expect(result.error.code).toBe('INCOMPLETE_DRAFT')
    expect(result.error.fields).toContain('email')
    expect(result.state.review).toBeNull()
  })

  it('freezes an authorized disclosure snapshot and deterministic digest', async () => {
    const dependencies = deterministicDependencies(async (canonical) =>
      `fixed_${canonical}`,
    )
    const authorized = setOptionalDisclosureFromHuman(
      createInitialState(),
      'phone',
      true,
      dependencies,
    )
    const proposedDraft = { ...validDraft, phone: '215-555-0134' }
    const drafted = replaceDraftFromAgent(
      authorized.state,
      proposedDraft,
      dependencies,
    )
    const prepared = await prepareSubmissionReview(
      drafted.state,
      'agent',
      dependencies,
    )
    const review = expectSuccess(prepared).review

    expect(review.reviewId).toMatch(/^review_[A-Za-z0-9._-]+$/)
    expect(review.snapshot).toEqual({ ...validDraft, phone: '215-555-0134' })
    expect(review.digest).toBe(`fixed_${canonicalSerialize(review.snapshot)}`)
    expect(review.authorizedOptionalFields).toEqual(['phone'])
    expect(review.withheldOptionalFields).toEqual([
      'budgetRange',
      'socialHandle',
      'additionalNotes',
    ])

    proposedDraft.contactName = 'Changed elsewhere'
    expect(review.snapshot.contactName).toBe('Maya Chen')
    expect(Object.isFrozen(prepared.state)).toBe(true)
    expect(Object.isFrozen(prepared.state.draft)).toBe(true)
  })

  it('blocks submission before the visible human approval', async () => {
    const dependencies = deterministicDependencies()
    const prepared = await prepareSubmissionReview(
      draftedState(dependencies),
      'agent',
      dependencies,
    )
    const review = expectSuccess(prepared).review
    const submitted = await submitApprovedIntake(
      prepared.state,
      review.reviewId,
      'agent',
      dependencies,
    )

    expect(submitted.ok).toBe(false)
    if (submitted.ok) throw new Error('Expected rejection')
    expect(submitted.error.code).toBe('APPROVAL_REQUIRED')
    expect(submitted.state.receipts).toHaveLength(0)
  })

  it('requires approval to match the exact review ID, digest, and revision', async () => {
    const dependencies = deterministicDependencies()
    const prepared = await prepareSubmissionReview(
      draftedState(dependencies),
      'agent',
      dependencies,
    )
    const review = expectSuccess(prepared).review

    const stale = approveReviewFromHuman(
      prepared.state,
      { ...review, reviewId: 'review_stale' },
      dependencies,
    )
    expect(stale.ok).toBe(false)
    if (stale.ok) throw new Error('Expected rejection')
    expect(stale.error.code).toBe('STALE_REVIEW')

    const mismatched = approveReviewFromHuman(
      prepared.state,
      { ...review, digest: 'wrong_digest' },
      dependencies,
    )
    expect(mismatched.ok).toBe(false)
    if (mismatched.ok) throw new Error('Expected rejection')
    expect(mismatched.error.code).toBe('DIGEST_MISMATCH')
  })

  it('invalidates a review and approval after a human edit', async () => {
    const dependencies = deterministicDependencies()
    const approved = await approvedState(dependencies)
    const edited = updateDraftFromHuman(
      approved.state,
      { eventGoal: 'A newly edited and sufficiently detailed event goal' },
      dependencies,
    )
    const data = expectSuccess(edited)

    expect(data.changed).toBe(true)
    expect(edited.state.status).toBe('draft')
    expect(edited.state.review).toBeNull()
    expect(edited.state.approval).toBeNull()
    expect(edited.state.revision).toBe(approved.review.revision + 1)
    expect(edited.state.fieldProvenance.eventGoal?.actor).toBe('human')
  })

  it('rejects a stale review ID after a fresh review is created', async () => {
    const dependencies = deterministicDependencies()
    const first = await prepareSubmissionReview(
      draftedState(dependencies),
      'agent',
      dependencies,
    )
    const firstReview = expectSuccess(first).review
    const edited = updateDraftFromHuman(
      first.state,
      { eventType: 'Updated creative mentorship workshop' },
      dependencies,
    )
    const second = await prepareSubmissionReview(
      edited.state,
      'human',
      dependencies,
    )
    expectSuccess(second)
    const submitted = await submitApprovedIntake(
      second.state,
      firstReview.reviewId,
      'agent',
      dependencies,
    )

    expect(submitted.ok).toBe(false)
    if (submitted.ok) throw new Error('Expected rejection')
    expect(submitted.error.code).toBe('STALE_REVIEW')
  })

  it('submits only the frozen approved snapshot and creates an exact local receipt', async () => {
    const dependencies = deterministicDependencies()
    const authorized = setOptionalDisclosureFromHuman(
      createInitialState(),
      'phone',
      true,
      dependencies,
    )
    const drafted = replaceDraftFromAgent(
      authorized.state,
      { ...validDraft, phone: '215-555-0134' },
      dependencies,
    )
    const prepared = await prepareSubmissionReview(
      drafted.state,
      'agent',
      dependencies,
    )
    const review = expectSuccess(prepared).review
    const approved = approveReviewFromHuman(
      prepared.state,
      {
        reviewId: review.reviewId,
        digest: review.digest,
        revision: review.revision,
      },
      dependencies,
    )
    const submitted = await submitApprovedIntake(
      approved.state,
      review.reviewId,
      'agent',
      dependencies,
    )
    const receipt = expectSuccess(submitted).receipt

    expect(submitted.state.status).toBe('submitted')
    expect(receipt.receiptId).toMatch(/^receipt_[A-Za-z0-9._-]+$/)
    expect(receipt.fieldsDisclosed).toEqual(review.snapshot)
    expect(receipt.snapshotDigest).toBe(review.digest)
    expect(receipt.destination).toBe('Local demonstration only')
    expect(receipt.noNetworkTransmission).toBe(true)
    expect(receipt.optionalFieldsWithheld).toEqual([
      'budgetRange',
      'socialHandle',
      'additionalNotes',
    ])
    expect(receipt.neverCollectedCategories).toEqual([
      'streetAddress',
      'employer',
      'preciseLiveLocation',
      'paymentInformation',
      'unrelatedPrivateConversationHistory',
    ])
  })

  it('keeps submitted state terminal until a human reset', async () => {
    const dependencies = deterministicDependencies()
    const approved = await approvedState(dependencies)
    const submitted = await submitApprovedIntake(
      approved.state,
      approved.review.reviewId,
      'agent',
      dependencies,
    )
    expectSuccess(submitted)

    const edit = updateDraftFromHuman(
      submitted.state,
      { contactName: 'Another Person' },
      dependencies,
    )
    const toggle = setOptionalDisclosureFromHuman(
      submitted.state,
      'phone',
      true,
      dependencies,
    )
    expect(edit.ok).toBe(false)
    expect(toggle.ok).toBe(false)
    if (edit.ok || toggle.ok) throw new Error('Expected terminal rejections')
    expect(edit.error.code).toBe('SUBMITTED_TERMINAL')
    expect(toggle.error.code).toBe('SUBMITTED_TERMINAL')
    expect(edit.state.draft).toEqual(submitted.state.draft)
  })

  it('allows private human-entered optional data but excludes it without authorization', async () => {
    const dependencies = deterministicDependencies()
    let state = draftedState(dependencies)
    const privateUpdate = updateDraftFromHuman(
      state,
      { additionalNotes: 'Keep this local unless I authorize it.' },
      dependencies,
    )
    state = privateUpdate.state
    const prepared = await prepareSubmissionReview(state, 'human', dependencies)
    const review = expectSuccess(prepared).review

    expect(state.draft.additionalNotes).toBe('Keep this local unless I authorize it.')
    expect(review.snapshot).not.toHaveProperty('additionalNotes')
    expect(review.withheldOptionalFields).toContain('additionalNotes')
  })

  it('computes a real SHA-256 digest with Web Crypto', async () => {
    expect(await sha256Digest('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('serializes canonical snapshots in fixed field order', () => {
    const shuffled = {
      eventGoal: validDraft.eventGoal,
      estimatedAttendeeCount: 20,
      preferredDate: '2026-10-10',
      eventType: validDraft.eventType,
      email: validDraft.email,
      contactName: validDraft.contactName,
    } satisfies DisclosureSnapshot

    expect(canonicalSerialize(shuffled)).toBe(JSON.stringify(validDraft))
  })
})
