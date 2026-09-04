import { describe, expect, it, vi } from 'vitest'
import {
  PERMISSION_SLIP_TOOL_NAMES,
  createPermissionSlipWebMcpController,
  type PermissionSlipWebMcpAdapter,
  type WebMcpRegistrationTarget,
} from './index'

const validDraft = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  inquiryType: 'prototype',
  desiredOutcome: 'A browser prototype for a focused inquiry workflow.',
  relevantBackground:
    'A fictional creative-technology project needs a useful initial response.',
  timeline: 'A first slice within four weeks.',
  preferredResponseMethod: 'email',
  requestedNextStep: 'written_response',
} as const

const optionalFields = [
  'phone',
  'budgetOrConstraints',
  'organization',
  'additionalContext',
] as const

const requiredFields = Object.keys(validDraft) as Array<keyof typeof validDraft>

function createAdapter(): PermissionSlipWebMcpAdapter {
  return {
    getIntakeRequirements: vi.fn<
      PermissionSlipWebMcpAdapter['getIntakeRequirements']
    >(() => ({
      ok: true,
      data: {
        requiredFields,
        optionalFields: [...optionalFields],
        authorizedOptionalFields: [],
        neverCollectedFields: ['payment information'],
        workflowStatus: 'empty',
        nextStepIntentConfirmed: false,
        contactPermissions: {
          projectResponse: false,
          occasionalUpdates: false,
        },
        unverifiedAssistantFields: [],
        humanOnlyRequirements: {
          assistantSuggestionVerification: {
            required: true,
            complete: true,
            unverifiedFields: [],
          },
          requestedNextStepIntent: { required: true, confirmed: false },
          projectResponsePermission: { required: true, granted: false },
          exactReviewApproval: { required: true, granted: false },
        },
        instructions: 'Draft, review, then wait for human approval.',
      },
    })),
    draftIntake: vi.fn<PermissionSlipWebMcpAdapter['draftIntake']>(() => ({
      ok: true,
      data: {
        acceptedFields: requiredFields,
        withheldFields: [...optionalFields],
        workflowStatus: 'draft',
        revision: 1,
        nextRecommendedAction: 'Prepare a review.',
      },
    })),
    prepareSubmissionReview: vi.fn<
      PermissionSlipWebMcpAdapter['prepareSubmissionReview']
    >(() => ({
      ok: true,
      data: {
        reviewId: 'review-1',
        digest: '0'.repeat(64),
        revision: 1,
        workflowStatus: 'review_pending',
        frozenSnapshot: validDraft,
        disclosedFields: requiredFields,
        authorizedOptionalFields: [],
        withheldOptionalFields: [...optionalFields],
        optionalDisclosureAuthorizations: {
          phone: false,
          budgetOrConstraints: false,
          organization: false,
          additionalContext: false,
        },
        contactPermissions: {
          projectResponse: true,
          occasionalUpdates: false,
        },
        permissionsGranted: ['projectResponse'],
        permissionsWithheld: ['occasionalUpdates'],
        nextStepIntentConfirmed: true,
        inquiryProvenance: {
          entrySource: 'webmcp',
          referralSource: null,
          campaign: null,
        },
        fieldProvenance: {},
        humanApprovalRequired: 'Approve this exact review in the webpage.',
      },
    })),
    submitApprovedIntake: vi.fn<
      PermissionSlipWebMcpAdapter['submitApprovedIntake']
    >(() => ({
      ok: true,
      data: {
        confirmation: 'The approved intake was finalized locally.',
        submissionId: 'submission-1',
        receiptId: 'receipt-1',
        reviewId: 'review-1',
        workflowStatus: 'submitted',
        idempotentReplay: false,
      },
    })),
    getDisclosureReceipt: vi.fn<
      PermissionSlipWebMcpAdapter['getDisclosureReceipt']
    >(() => ({
      ok: true,
      data: {
        receiptId: 'receipt-1',
        submissionId: 'submission-1',
        reviewId: 'review-1',
        reviewRevision: 1,
        reviewDigest: '0'.repeat(64),
        submissionTimestamp: '2026-09-03T16:00:00.000Z',
        outcome: 'accepted',
        status: 'qualified_inquiry_created',
        destination: 'Village Alchemist project inquiry desk (simulated)',
        requestedNextStep: 'written_response',
        permissionsGranted: ['projectResponse'],
        permissionsWithheld: ['occasionalUpdates'],
        inquiryProvenance: {
          entrySource: 'webmcp',
          referralSource: null,
          campaign: null,
        },
        frozenSnapshot: validDraft,
        fieldsDisclosed: validDraft,
        disclosedFieldNames: requiredFields,
        optionalFieldsWithheld: [...optionalFields],
        neverCollectedCategories: [
          'streetAddress',
          'employmentHistory',
          'preciseLiveLocation',
          'paymentInformation',
          'unrelatedPrivateConversationHistory',
        ],
        snapshotDigest: '0'.repeat(64),
        fieldProvenance: {},
        contactPermissions: {
          projectResponse: true,
          occasionalUpdates: false,
        },
        noNetworkTransmission: true,
        statement: 'No network transmission occurred.',
      },
    })),
  }
}

function createRegistrationTarget() {
  const registrations: Array<{
    tool: WebMCP.ModelContextTool
    options?: WebMCP.ModelContextRegisterToolOptions
  }> = []
  const target: WebMcpRegistrationTarget = {
    registerTool: vi.fn(async (tool, options) => {
      registrations.push({ tool, options })
    }),
  }
  return { registrations, target }
}

describe('Permission Slip WebMCP registration', () => {
  it('registers exactly five narrow tools and cleans them up with one signal', async () => {
    const adapter = createAdapter()
    const { registrations, target } = createRegistrationTarget()
    const controller = createPermissionSlipWebMcpController({
      getAdapter: () => adapter,
      modelContext: target,
    })

    await expect(controller.start()).resolves.toMatchObject({
      phase: 'ready',
      supported: true,
      registeredToolCount: 5,
    })

    expect(registrations.map(({ tool }) => tool.name)).toEqual(
      PERMISSION_SLIP_TOOL_NAMES,
    )
    expect(
      registrations.every(
        ({ tool }) =>
          (tool.inputSchema as { additionalProperties?: boolean })
            .additionalProperties === false,
      ),
    ).toBe(true)
    expect(
      registrations
        .filter(({ tool }) => tool.annotations?.readOnlyHint)
        .map(({ tool }) => tool.name),
    ).toEqual(['get_intake_requirements', 'get_disclosure_receipt'])
    expect(
      registrations
        .filter(({ tool }) => tool.annotations?.untrustedContentHint)
        .map(({ tool }) => tool.name),
    ).toEqual(['prepare_submission_review', 'get_disclosure_receipt'])

    const signals = registrations.map(({ options }) => options?.signal)
    expect(signals.every((signal) => signal === signals[0])).toBe(true)
    expect(signals[0]?.aborted).toBe(false)

    controller.stop()
    expect(signals[0]?.aborted).toBe(true)
    expect(controller.getStatus()).toMatchObject({
      phase: 'stopped',
      registeredToolCount: 0,
    })
  })

  it('falls back without registering when document.modelContext is unavailable', async () => {
    const adapter = createAdapter()
    const controller = createPermissionSlipWebMcpController({
      getAdapter: () => adapter,
      modelContext: null,
    })

    await expect(controller.start()).resolves.toEqual({
      phase: 'unsupported',
      supported: false,
      registeredToolCount: 0,
    })
  })

  it('rejects malformed draft input before calling the application adapter', async () => {
    const adapter = createAdapter()
    const { registrations, target } = createRegistrationTarget()
    const controller = createPermissionSlipWebMcpController({
      getAdapter: () => adapter,
      modelContext: target,
    })
    await controller.start()

    const draftTool = registrations.find(
      ({ tool }) => tool.name === 'draft_intake',
    )?.tool
    expect(draftTool).toBeDefined()

    const result = await draftTool?.execute(
      { ...validDraft, inquiryType: 'invalid_type', secret: 'not allowed' },
      { signal: new AbortController().signal },
    )

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        retryable: true,
        details: {
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: 'secret',
              code: 'unknown_property',
            }),
            expect.objectContaining({
              path: 'inquiryType',
              code: 'invalid_format',
            }),
          ]),
        },
      },
    })
    expect(adapter.draftIntake).not.toHaveBeenCalled()
  })

  it('rejects identifiers with whitespace rather than silently normalizing them', async () => {
    const adapter = createAdapter()
    const { registrations, target } = createRegistrationTarget()
    const controller = createPermissionSlipWebMcpController({
      getAdapter: () => adapter,
      modelContext: target,
    })
    await controller.start()

    const submitTool = registrations.find(
      ({ tool }) => tool.name === 'submit_approved_intake',
    )?.tool
    const receiptTool = registrations.find(
      ({ tool }) => tool.name === 'get_disclosure_receipt',
    )?.tool
    const options = { signal: new AbortController().signal }

    await expect(
      submitTool?.execute({ reviewId: ' review-1 ' }, options),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    })
    await expect(
      receiptTool?.execute({ receiptId: ' receipt-1 ' }, options),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    })
    expect(adapter.submitApprovedIntake).not.toHaveBeenCalled()
    expect(adapter.getDisclosureReceipt).not.toHaveBeenCalled()
  })

  it('resolves the live adapter and forwards the invocation AbortSignal', async () => {
    const firstAdapter = createAdapter()
    const currentAdapter = createAdapter()
    let liveAdapter = firstAdapter
    const { registrations, target } = createRegistrationTarget()
    const controller = createPermissionSlipWebMcpController({
      getAdapter: () => liveAdapter,
      modelContext: target,
    })
    await controller.start()
    liveAdapter = currentAdapter

    const draftTool = registrations.find(
      ({ tool }) => tool.name === 'draft_intake',
    )?.tool
    const invocationController = new AbortController()
    await draftTool?.execute(validDraft, {
      signal: invocationController.signal,
    })

    expect(firstAdapter.draftIntake).not.toHaveBeenCalled()
    expect(currentAdapter.draftIntake).toHaveBeenCalledWith(validDraft, {
      signal: invocationController.signal,
    })
  })

  it('supports experimental builds that omit invocation options', async () => {
    const adapter = createAdapter()
    const { registrations, target } = createRegistrationTarget()
    const controller = createPermissionSlipWebMcpController({
      getAdapter: () => adapter,
      modelContext: target,
    })
    await controller.start()

    const draftTool = registrations.find(
      ({ tool }) => tool.name === 'draft_intake',
    )?.tool
    expect(draftTool).toBeDefined()

    const invokeWithoutOptions = draftTool?.execute as (
      input: unknown,
    ) => Promise<unknown>
    await expect(invokeWithoutOptions(validDraft)).resolves.toMatchObject({
      ok: true,
    })
    expect(adapter.draftIntake).toHaveBeenCalledWith(validDraft, {
      signal: expect.any(AbortSignal),
    })
  })

  it('aborts all partial registrations when one registration fails', async () => {
    const registrationSignals: AbortSignal[] = []
    const target: WebMcpRegistrationTarget = {
      registerTool: vi.fn(async (tool, options) => {
        if (options?.signal) registrationSignals.push(options.signal)
        if (tool.name === 'prepare_submission_review') {
          throw new Error('registration rejected')
        }
      }),
    }
    const controller = createPermissionSlipWebMcpController({
      getAdapter: createAdapter,
      modelContext: target,
    })

    await expect(controller.start()).resolves.toMatchObject({
      phase: 'error',
      supported: true,
      registeredToolCount: 0,
      error: 'registration rejected',
    })
    expect(registrationSignals).toHaveLength(5)
    expect(registrationSignals.every((signal) => signal.aborted)).toBe(true)
  })
})
