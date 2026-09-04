import { describe, expect, it } from 'vitest'
import { PermissionSlipStore } from '../store'
import { createStoreWebMcpAdapter } from './storeAdapter'

const validInquiry = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  inquiryType: 'prototype',
  desiredOutcome: 'A browser prototype for a focused consent-aware inquiry.',
  relevantBackground:
    'A fictional creative-technology project needs an initial feasibility response.',
  timeline: 'A first slice within four weeks.',
  preferredResponseMethod: 'email',
  requestedNextStep: 'written_response',
} as const

const context = () => ({ signal: new AbortController().signal })

function createHarness() {
  let id = 0
  const store = new PermissionSlipStore({
    storage: null,
    dependencies: {
      now: () => '2026-09-03T16:00:00.000Z',
      createId: (kind) => `${kind}-${++id}`,
      digest: async () => '0'.repeat(64),
    },
  })
  return { store, adapter: createStoreWebMcpAdapter(store) }
}

async function prepareReadyReview() {
  const harness = createHarness()
  const drafted = harness.adapter.draftIntake(validInquiry, context())
  expect(drafted).toMatchObject({ ok: true })
  harness.store.human.verifyAssistantSuggestions()
  harness.store.human.setNextStepIntent(true)
  harness.store.human.setContactPermission('projectResponse', true)
  const prepared = await harness.adapter.prepareSubmissionReview(context())
  if (!prepared.ok) throw new Error(prepared.error.message)
  return { ...harness, review: prepared.data }
}

describe('live store WebMCP adapter', () => {
  it('shares live UI state while exposing no programmatic human authority', async () => {
    const { store, adapter } = createHarness()
    expect(Object.keys(adapter).sort()).toEqual(
      [
        'draftIntake',
        'getDisclosureReceipt',
        'getIntakeRequirements',
        'prepareSubmissionReview',
        'submitApprovedIntake',
      ].sort(),
    )
    for (const humanOnly of [
      'verifyAssistantSuggestions',
      'setNextStepIntent',
      'setOptionalDisclosure',
      'setContactPermission',
      'approveReview',
      'returnToEditing',
      'reset',
    ]) {
      expect(store.agent).not.toHaveProperty(humanOnly)
      expect(adapter).not.toHaveProperty(humanOnly)
    }

    adapter.draftIntake(validInquiry, context())
    expect(store.getSnapshot().inquiryProvenance.entrySource).toBe('webmcp')
    expect(store.getSnapshot().draft).toEqual(validInquiry)

    store.human.verifyAssistantSuggestions()
    store.human.setContactPermission('projectResponse', true)
    const requirements = adapter.getIntakeRequirements(context())
    expect(requirements).toMatchObject({
      ok: true,
      data: {
        nextStepIntentConfirmed: false,
        contactPermissions: { projectResponse: true },
        unverifiedAssistantFields: [],
        humanOnlyRequirements: {
          requestedNextStepIntent: { confirmed: false },
          projectResponsePermission: { granted: true },
        },
      },
    })

    await expect(adapter.prepareSubmissionReview(context())).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTENT_CONFIRMATION_REQUIRED' },
    })
  })

  it('returns frozen permissions and provenance and rejects a stale approval', async () => {
    const { store, adapter, review } = await prepareReadyReview()
    expect(review).toMatchObject({
      revision: expect.any(Number),
      frozenSnapshot: validInquiry,
      contactPermissions: {
        projectResponse: true,
        occasionalUpdates: false,
      },
      permissionsGranted: ['projectResponse'],
      nextStepIntentConfirmed: true,
      inquiryProvenance: { entrySource: 'webmcp' },
    })
    expect(
      Object.values(review.fieldProvenance).every(
        (entry) =>
          entry?.source === 'assistant_suggested' && entry.verifiedByHuman,
      ),
    ).toBe(true)

    store.human.approveReview({
      reviewId: review.reviewId,
      digest: review.digest,
      revision: review.revision,
    })
    store.human.updateDraft({ timeline: 'A first slice within six weeks.' })
    expect(store.getSnapshot()).toMatchObject({
      status: 'draft',
      review: null,
      approval: null,
    })
    await expect(
      adapter.submitApprovedIntake({ reviewId: review.reviewId }, context()),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'REVIEW_NOT_FOUND',
        details: { receiptId: expect.any(String) },
      },
    })
  })

  it('replays a successful submission idempotently and returns its receipt', async () => {
    const { store, adapter, review } = await prepareReadyReview()
    store.human.approveReview({
      reviewId: review.reviewId,
      digest: review.digest,
      revision: review.revision,
    })

    const first = await adapter.submitApprovedIntake(
      { reviewId: review.reviewId },
      context(),
    )
    if (!first.ok) throw new Error(first.error.message)
    const replay = await adapter.submitApprovedIntake(
      { reviewId: review.reviewId },
      context(),
    )
    expect(replay).toEqual({
      ok: true,
      data: {
        ...first.data,
        confirmation:
          'This exact review was already submitted; the original receipt was returned.',
        idempotentReplay: true,
      },
    })

    const receipt = adapter.getDisclosureReceipt(
      { receiptId: first.data.receiptId },
      context(),
    )
    expect(receipt).toMatchObject({
      ok: true,
      data: {
        outcome: 'accepted',
        submissionId: first.data.submissionId,
        receiptId: first.data.receiptId,
        frozenSnapshot: validInquiry,
        inquiryProvenance: { entrySource: 'webmcp' },
        noNetworkTransmission: true,
      },
    })
  })

  it('links a rejected submit to a retrievable PII-free failure receipt', async () => {
    const { adapter } = createHarness()
    const rejected = await adapter.submitApprovedIntake(
      { reviewId: 'review-missing' },
      context(),
    )
    if (rejected.ok) throw new Error('Expected submission rejection.')
    const receiptId = rejected.error.details?.receiptId
    expect(receiptId).toEqual(expect.any(String))

    const receipt = adapter.getDisclosureReceipt(
      { receiptId: receiptId as string },
      context(),
    )
    expect(receipt).toMatchObject({
      ok: true,
      data: {
        receiptId,
        outcome: 'rejected',
        status: 'submission_rejected',
        submissionId: null,
        failure: { code: 'REVIEW_NOT_FOUND' },
        noNetworkTransmission: true,
      },
    })
    const serialized = JSON.stringify(receipt)
    expect(serialized).not.toContain(validInquiry.contactName)
    expect(serialized).not.toContain(validInquiry.email)
    expect(serialized).not.toContain(validInquiry.desiredOutcome)
    expect(serialized).not.toContain('frozenSnapshot')
    expect(serialized).not.toContain('fieldsDisclosed')
  })
})
