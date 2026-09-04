import { describe, expect, it } from 'vitest'
import {
  approveReviewFromHuman,
  canonicalSerializeReviewPayload,
  confirmNextStepIntentFromHuman,
  createInitialState,
  getDisclosureReceipt,
  prepareSubmissionReview,
  replaceDraftFromAgent,
  setContactPermissionFromHuman,
  setOptionalDisclosureFromHuman,
  sha256Digest,
  submitApprovedIntake,
  updateDraftFromHuman,
  verifyAssistantSuggestionsFromHuman,
} from './index'
import type {
  DomainDependencies,
  PermissionSlipState,
  PreparedReviewResult,
} from './types'

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

function deterministicDependencies(
  digest: DomainDependencies['digest'] = async (canonical) =>
    `digest_${canonical.length}`,
): DomainDependencies {
  let id = 0
  let tick = 0
  return {
    now: () => new Date(Date.UTC(2026, 8, 3, 8, 0, tick++)).toISOString(),
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

function expectFailure(result: { ok: boolean; error?: { code: string } }) {
  expect(result.ok).toBe(false)
  if (result.ok || !result.error) throw new Error('Expected operation to fail')
  return result.error
}

function agentDraft(
  dependencies: DomainDependencies,
  input: Record<string, unknown> = validDraft,
  state = createInitialState(),
): PermissionSlipState {
  const result = replaceDraftFromAgent(state, input, dependencies)
  expectSuccess(result)
  return result.state
}

function makeReviewReady(
  dependencies: DomainDependencies,
  state = agentDraft(dependencies),
): PermissionSlipState {
  state = verifyAssistantSuggestionsFromHuman(state, dependencies).state
  state = confirmNextStepIntentFromHuman(state, true, dependencies).state
  state = setContactPermissionFromHuman(
    state,
    'projectResponse',
    true,
    dependencies,
  ).state
  return state
}

async function prepareReadyReview(
  dependencies: DomainDependencies,
  state = makeReviewReady(dependencies),
): Promise<{ state: PermissionSlipState; review: PreparedReviewResult['review'] }> {
  const prepared = await prepareSubmissionReview(state, 'agent', dependencies)
  return { state: prepared.state, review: expectSuccess(prepared).review }
}

async function approveReadyReview(dependencies: DomainDependencies) {
  const prepared = await prepareReadyReview(dependencies)
  const approved = approveReviewFromHuman(
    prepared.state,
    {
      reviewId: prepared.review.reviewId,
      digest: prepared.review.digest,
      revision: prepared.review.revision,
    },
    dependencies,
  )
  expectSuccess(approved)
  return { state: approved.state, review: prepared.review }
}

describe('Village Alchemist inquiry domain', () => {
  it('starts version 2 default-safe and marks every assistant proposal unverified', () => {
    const dependencies = deterministicDependencies()
    const initial = createInitialState()
    const drafted = replaceDraftFromAgent(initial, validDraft, dependencies)
    const data = expectSuccess(drafted)

    expect(initial).toMatchObject({
      stateVersion: 2,
      nextStepIntentConfirmed: false,
      contactPermissions: {
        projectResponse: false,
        occasionalUpdates: false,
      },
    })
    expect(data.acceptedFields).toEqual(Object.keys(validDraft))
    expect(drafted.state.status).toBe('draft')
    expect(drafted.state.inquiryProvenance.entrySource).toBe('webmcp')
    expect(drafted.state.fieldProvenance.desiredOutcome).toMatchObject({
      source: 'assistant_suggested',
      verifiedByHuman: false,
    })
    expect(drafted.state.receipts).toHaveLength(0)
  })

  it('atomically rejects an optional field without visible human authorization', () => {
    const dependencies = deterministicDependencies()
    const initial = agentDraft(dependencies)
    const result = replaceDraftFromAgent(
      initial,
      { ...validDraft, phone: '215-555-0134' },
      dependencies,
    )

    expect(expectFailure(result).code).toBe('UNAUTHORIZED_OPTIONAL_FIELDS')
    expect(result.state.draft).toEqual(initial.draft)
    expect(JSON.stringify(result.state.activity)).not.toContain('215-555-0134')
  })

  it('requires explicit next-step intent, project-response permission, and human verification in order', async () => {
    const dependencies = deterministicDependencies()
    let state = agentDraft(dependencies)

    let prepared = await prepareSubmissionReview(state, 'agent', dependencies)
    expect(expectFailure(prepared).code).toBe('INTENT_CONFIRMATION_REQUIRED')

    state = confirmNextStepIntentFromHuman(state, true, dependencies).state
    prepared = await prepareSubmissionReview(state, 'agent', dependencies)
    expect(expectFailure(prepared).code).toBe('CONTACT_PERMISSION_REQUIRED')

    state = setContactPermissionFromHuman(
      state,
      'projectResponse',
      true,
      dependencies,
    ).state
    prepared = await prepareSubmissionReview(state, 'agent', dependencies)
    expect(expectFailure(prepared).code).toBe('HUMAN_VERIFICATION_REQUIRED')
    expect(prepared.state.receipts).toHaveLength(0)

    state = verifyAssistantSuggestionsFromHuman(state, dependencies).state
    prepared = await prepareSubmissionReview(state, 'agent', dependencies)
    expectSuccess(prepared)
  })

  it('keeps person-provided and verified assistant provenance distinct', () => {
    const dependencies = deterministicDependencies()
    let state = agentDraft(dependencies)
    state = updateDraftFromHuman(
      state,
      { timeline: 'A first review in four weeks' },
      dependencies,
    ).state
    state = verifyAssistantSuggestionsFromHuman(state, dependencies).state

    expect(state.fieldProvenance.timeline).toMatchObject({
      source: 'person_provided',
      verifiedByHuman: true,
    })
    expect(state.fieldProvenance.desiredOutcome).toMatchObject({
      source: 'assistant_suggested',
      verifiedByHuman: true,
    })
  })

  it('clears confirmed intent when the requested next step changes', () => {
    const dependencies = deterministicDependencies()
    let state = agentDraft(dependencies)
    state = confirmNextStepIntentFromHuman(state, true, dependencies).state
    expect(state.nextStepIntentConfirmed).toBe(true)

    state = updateDraftFromHuman(
      state,
      { requestedNextStep: 'written_response' },
      dependencies,
    ).state
    expect(state.nextStepIntentConfirmed).toBe(false)
  })

  it('freezes values, intent, independent contact permissions, and provenance into one digest payload', async () => {
    const dependencies = deterministicDependencies(async (canonical) =>
      `fixed_${canonical}`,
    )
    let state = setOptionalDisclosureFromHuman(
      createInitialState(),
      'budgetOrConstraints',
      true,
      dependencies,
    ).state
    state = agentDraft(
      dependencies,
      {
        ...validDraft,
        budgetOrConstraints: '$15k cap; browser-only first milestone',
      },
      state,
    )
    state = makeReviewReady(dependencies, state)
    state = setContactPermissionFromHuman(
      state,
      'occasionalUpdates',
      false,
      dependencies,
    ).state
    const prepared = await prepareReadyReview(dependencies, state)

    expect(prepared.review.payload.snapshot).toEqual({
      ...validDraft,
      budgetOrConstraints: '$15k cap; browser-only first milestone',
    })
    expect(prepared.review.payload.contactPermissions).toEqual({
      projectResponse: true,
      occasionalUpdates: false,
    })
    expect(prepared.review.payload.nextStepIntentConfirmed).toBe(true)
    expect(prepared.review.digest).toBe(
      `fixed_${canonicalSerializeReviewPayload(prepared.review.payload)}`,
    )
    expect(prepared.review.fieldProvenance.budgetOrConstraints).toMatchObject({
      source: 'assistant_suggested',
      verifiedByHuman: true,
    })
  })

  it('invalidates review and approval after any execution-affecting human change', async () => {
    const dependencies = deterministicDependencies()
    const approved = await approveReadyReview(dependencies)
    const changed = setContactPermissionFromHuman(
      approved.state,
      'occasionalUpdates',
      true,
      dependencies,
    )

    expectSuccess(changed)
    expect(changed.state.status).toBe('draft')
    expect(changed.state.review).toBeNull()
    expect(changed.state.approval).toBeNull()
    expect(changed.state.revision).toBe(approved.review.revision + 1)
  })

  it('creates a qualified success receipt from the exact frozen payload and provenance', async () => {
    const dependencies = deterministicDependencies()
    const approved = await approveReadyReview(dependencies)
    const submitted = await submitApprovedIntake(
      approved.state,
      approved.review.reviewId,
      'agent',
      dependencies,
    )
    const result = expectSuccess(submitted)
    const receipt = result.receipt

    expect(receipt).toMatchObject({
      outcome: 'accepted',
      status: 'qualified_inquiry_created',
      destination: 'Village Alchemist project inquiry desk (simulated)',
      requestedNextStep: 'discovery_call',
      permissionsGranted: ['projectResponse'],
      permissionsWithheld: ['occasionalUpdates'],
      reviewRevision: approved.review.revision,
      reviewDigest: approved.review.digest,
      noNetworkTransmission: true,
    })
    expect(receipt.submissionId).toMatch(/^submission_/)
    expect(receipt.frozenSnapshot).toEqual(approved.review.snapshot)
    expect(receipt.fieldProvenance.desiredOutcome).toMatchObject({
      source: 'assistant_suggested',
      verifiedByHuman: true,
    })
    expect(receipt.inquiryProvenance).toEqual({
      entrySource: 'webmcp',
      referralSource: null,
      campaign: null,
    })
  })

  it('records and retrieves a PII-free failure receipt for a blocked submit', async () => {
    const dependencies = deterministicDependencies()
    const prepared = await prepareReadyReview(dependencies)
    const submitted = await submitApprovedIntake(
      prepared.state,
      prepared.review.reviewId,
      'agent',
      dependencies,
    )

    expect(expectFailure(submitted).code).toBe('APPROVAL_REQUIRED')
    if (submitted.ok || !submitted.failureReceipt) {
      throw new Error('Expected a failure receipt')
    }
    expect(submitted.failureReceipt).toMatchObject({
      outcome: 'rejected',
      status: 'submission_rejected',
      submissionId: null,
      reviewId: prepared.review.reviewId,
      failure: { code: 'APPROVAL_REQUIRED' },
    })
    const serialized = JSON.stringify(submitted.failureReceipt)
    expect(serialized).not.toContain(validDraft.contactName)
    expect(serialized).not.toContain(validDraft.email)
    expect(serialized).not.toContain(validDraft.desiredOutcome)

    const retrieved = getDisclosureReceipt(
      submitted.state,
      submitted.failureReceipt.receiptId,
    )
    expect(expectSuccess(retrieved)).toEqual(submitted.failureReceipt)
  })

  it('returns the identical success receipt for a same-review retry without duplication', async () => {
    const dependencies = deterministicDependencies()
    const approved = await approveReadyReview(dependencies)
    const first = await submitApprovedIntake(
      approved.state,
      approved.review.reviewId,
      'agent',
      dependencies,
    )
    const firstResult = expectSuccess(first)
    const retry = await submitApprovedIntake(
      first.state,
      approved.review.reviewId,
      'agent',
      dependencies,
    )
    const retryResult = expectSuccess(retry)

    expect(retryResult.idempotentReplay).toBe(true)
    expect(retryResult.receipt).toEqual(firstResult.receipt)
    expect(retry.state).toBe(first.state)
    expect(retry.state.receipts).toHaveLength(1)
  })

  it('rejects execution when live state is tampered away from the approved frozen snapshot', async () => {
    const dependencies = deterministicDependencies()
    const approved = await approveReadyReview(dependencies)
    const tampered = structuredClone(approved.state)
    tampered.draft.desiredOutcome =
      'A different result that was never reviewed by the person.'

    const submitted = await submitApprovedIntake(
      tampered,
      approved.review.reviewId,
      'agent',
      dependencies,
    )
    expect(expectFailure(submitted).code).toBe('STALE_REVIEW')
    expect(
      submitted.state.receipts.some((receipt) => receipt.outcome === 'accepted'),
    ).toBe(false)
  })

  it('computes a real SHA-256 digest with Web Crypto', async () => {
    expect(await sha256Digest('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
