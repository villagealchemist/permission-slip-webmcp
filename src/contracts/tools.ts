import type { ContractErrorCode } from './defineContract'
import { defineToolContract } from './defineContract'
import {
  disclosureReceiptResultSchema,
  draftIntakeResultSchema,
  draftIntakeSchema,
  emptyObjectSchema,
  getDisclosureReceiptSchema,
  intakeRequirementsResultSchema,
  prepareSubmissionReviewResultSchema,
  submitApprovedIntakeResultSchema,
  submitApprovedIntakeSchema,
} from './schemas'
import { WORKFLOW_STATES } from './workflow'

const DEMO_DIGEST = '0'.repeat(64)

const BOUNDARY_ERRORS = [
  'INVALID_INPUT',
  'TOOL_EXECUTION_FAILED',
  'INVALID_TOOL_RESULT',
] as const satisfies readonly ContractErrorCode[]

const FICTIONAL_DRAFT = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  eventType: 'Creative coding and mentorship workshop',
  preferredDate: '2026-10-10',
  estimatedAttendeeCount: 20,
  eventGoal:
    'Pair early-career developers with local mentors for a collaborative workshop',
} as const

const ALL_UNCHANGED_TRANSITIONS = WORKFLOW_STATES.map((state) => ({
  from: state,
  to: state,
  condition: 'The read completes without changing application state.',
}))

/** Canonical contract for reading current intake and disclosure policy. */
export const getIntakeRequirementsContract = defineToolContract({
  name: 'get_intake_requirements',
  title: 'Get intake requirements',
  summary: 'Inspect the current intake policy before drafting.',
  description:
    'Read the required, optional, currently human-authorized, and never-collected intake fields plus workflow status. This does not change state. Submission always requires explicit human approval in the visible webpage.',
  inputSchema: emptyObjectSchema,
  outputSchema: intakeRequirementsResultSchema,
  examples: [
    {
      title: 'Inspect an empty demo',
      description:
        'The agent learns the allowed field names without receiving any draft values.',
      input: {},
      result: {
        ok: true,
        data: {
          requiredFields: [
            'contactName',
            'email',
            'eventType',
            'preferredDate',
            'estimatedAttendeeCount',
            'eventGoal',
          ],
          optionalFields: [
            'phone',
            'budgetRange',
            'socialHandle',
            'additionalNotes',
          ],
          authorizedOptionalFields: [],
          neverCollectedFields: [
            'Street address',
            'Employer',
            'Precise live location',
            'Payment information',
            'Unrelated private conversation history',
          ],
          workflowStatus: 'empty',
          instructions:
            'Prepare the intake using only required fields and currently authorized optional fields. Submission remains blocked until the human approves the exact review snapshot in the webpage.',
        },
      },
    },
  ],
  errors: BOUNDARY_ERRORS,
  readOnly: true,
  sideEffect: 'none',
  allowedStates: WORKFLOW_STATES,
  transitions: ALL_UNCHANGED_TRANSITIONS,
  humanApprovalRequired: false,
  humanPrerequisite: null,
  privacy: {
    dataDisclosed:
      'Field names, disclosure authorization flags, never-collected categories, workflow state, and instructions; never draft values.',
    dataPersisted: 'Nothing.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: false,
    securityNote: 'Policy metadata grants no approval or disclosure authority.',
  },
  relatedOperations: ['getIntakeRequirements'],
  annotations: { readOnlyHint: true },
})

/** Canonical contract for atomically replacing the agent-controlled draft. */
export const draftIntakeContract = defineToolContract({
  name: 'draft_intake',
  title: 'Draft the intake',
  summary: 'Atomically replace the visible agent-proposed draft.',
  description:
    'Replace the visible intake with one complete proposed draft. The complete call is rejected if it is malformed, contains an unknown field, or includes an optional field the person has not authorized. A successful draft invalidates any older review or approval and never approves or submits.',
  inputSchema: draftIntakeSchema,
  outputSchema: draftIntakeResultSchema,
  examples: [
    {
      title: 'Draft only the required fictional fields',
      description:
        'Optional values remain omitted because the human has not authorized them.',
      input: FICTIONAL_DRAFT,
      result: {
        ok: true,
        data: {
          acceptedFields: [
            'contactName',
            'email',
            'eventType',
            'preferredDate',
            'estimatedAttendeeCount',
            'eventGoal',
          ],
          withheldFields: [
            'phone',
            'budgetRange',
            'socialHandle',
            'additionalNotes',
          ],
          workflowStatus: 'draft',
          nextRecommendedAction:
            'Prepare a submission review, then wait for the human to approve it in the webpage.',
        },
      },
    },
    {
      title: 'Unauthorized optional data is rejected atomically',
      description:
        'The existing draft is not partially changed when phone disclosure is off.',
      input: { ...FICTIONAL_DRAFT, phone: '215-555-0134' },
      result: {
        ok: false,
        error: {
          code: 'UNAUTHORIZED_OPTIONAL_FIELDS',
          message:
            'The draft included optional fields the human has not authorized.',
          retryable: true,
          details: {
            retry:
              'Retry without the unauthorized optional fields. Only the human can change disclosure permissions.',
            fields: ['phone'],
          },
        },
      },
    },
  ],
  errors: [
    ...BOUNDARY_ERRORS,
    'SUBMITTED_TERMINAL',
    'UNKNOWN_FIELDS',
    'UNAUTHORIZED_OPTIONAL_FIELDS',
  ],
  readOnly: false,
  sideEffect: 'local-draft-replacement',
  allowedStates: ['empty', 'draft', 'review_pending', 'approved'],
  transitions: [
    'empty',
    'draft',
    'review_pending',
    'approved',
  ].map((from) => ({
    from: from as 'empty' | 'draft' | 'review_pending' | 'approved',
    to: 'draft' as const,
    condition:
      'The complete input is valid and every supplied optional field is already human-authorized.',
  })),
  humanApprovalRequired: false,
  humanPrerequisite:
    'Any supplied optional field must first be authorized through its visible human-only disclosure toggle.',
  privacy: {
    dataDisclosed:
      'Required input values and only already-authorized optional values enter the shared local draft; the result returns field names, not values.',
    dataPersisted: 'The accepted draft and value-free activity metadata in localStorage.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: false,
    securityNote:
      'Runtime and domain checks enforce authorization; the schema alone is not an authorization boundary.',
  },
  relatedOperations: ['replaceDraftFromAgent'],
})

/** Canonical contract for freezing the current exact disclosure. */
export const prepareSubmissionReviewContract = defineToolContract({
  name: 'prepare_submission_review',
  title: 'Prepare submission review',
  summary: 'Freeze the exact current disclosure for visible human review.',
  description:
    'Freeze the current valid draft into an exact disclosure review and digest shown in the webpage. This does not approve or submit it; the person must approve that exact review using the visible human-only control.',
  inputSchema: emptyObjectSchema,
  outputSchema: prepareSubmissionReviewResultSchema,
  examples: [
    {
      title: 'Freeze a valid fictional draft',
      description:
        'The exact values returned to the agent are also shown for human review.',
      input: {},
      result: {
        ok: true,
        data: {
          reviewId: 'review_demo_001',
          digest: DEMO_DIGEST,
          reviewSummary: {
            fieldsDisclosed: FICTIONAL_DRAFT,
            optionalFieldsWithheld: [
              'phone',
              'budgetRange',
              'socialHandle',
              'additionalNotes',
            ],
          },
          humanApprovalRequired:
            'The human must approve this exact review in the webpage before submission.',
        },
      },
    },
  ],
  errors: [
    ...BOUNDARY_ERRORS,
    'SUBMITTED_TERMINAL',
    'INCOMPLETE_DRAFT',
    'DIGEST_UNAVAILABLE',
    'STALE_OPERATION',
  ],
  readOnly: false,
  sideEffect: 'local-review-freeze',
  allowedStates: ['draft', 'review_pending', 'approved'],
  transitions: ['draft', 'review_pending', 'approved'].map((from) => ({
    from: from as 'draft' | 'review_pending' | 'approved',
    to: 'review_pending' as const,
    condition:
      'The current draft is complete and remains unchanged while its digest is computed.',
  })),
  humanApprovalRequired: false,
  humanPrerequisite: null,
  privacy: {
    dataDisclosed:
      'The exact frozen disclosed values, withheld optional field names, review identifier, and SHA-256 digest are returned.',
    dataPersisted: 'The frozen review and value-free activity metadata in localStorage.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: true,
    securityNote:
      'The digest detects changed canonical content but does not prove human identity.',
  },
  relatedOperations: ['prepareSubmissionReview'],
  annotations: { untrustedContentHint: true },
})

/** Canonical contract for consequential, human-gated local finalization. */
export const submitApprovedIntakeContract = defineToolContract({
  name: 'submit_approved_intake',
  title: 'Submit approved intake',
  summary: 'Finalize one unchanged, human-approved review locally.',
  description:
    'Consequential action: finalize only the exact unchanged review identified by reviewId after the person has explicitly approved it in the visible webpage. This hackathon demonstration creates a local disclosure receipt and transitions the workflow to submitted; it sends no network request. Calls without matching current human approval are rejected.',
  inputSchema: submitApprovedIntakeSchema,
  outputSchema: submitApprovedIntakeResultSchema,
  examples: [
    {
      title: 'Finalize the exact approved review',
      description:
        'This succeeds only after the visible UI approved the matching ID, digest, and revision.',
      input: { reviewId: 'review_demo_001' },
      result: {
        ok: true,
        data: {
          confirmation:
            'The approved snapshot was stored locally. No network transmission occurred.',
          receiptId: 'receipt_demo_001',
          reviewId: 'review_demo_001',
          workflowStatus: 'submitted',
        },
      },
    },
    {
      title: 'Block submission before human approval',
      description: 'Preparing a review never grants submission authority.',
      input: { reviewId: 'review_demo_001' },
      result: {
        ok: false,
        error: {
          code: 'APPROVAL_REQUIRED',
          message:
            'The human has not approved this review in the webpage.',
          retryable: true,
          details: {
            retry:
              'Wait for the human to approve the exact visible disclosure before retrying.',
          },
        },
      },
    },
  ],
  errors: [
    ...BOUNDARY_ERRORS,
    'SUBMITTED_TERMINAL',
    'REVIEW_NOT_FOUND',
    'STALE_REVIEW',
    'APPROVAL_REQUIRED',
    'DIGEST_UNAVAILABLE',
    'DIGEST_MISMATCH',
    'STALE_OPERATION',
  ],
  readOnly: false,
  sideEffect: 'local-finalization',
  allowedStates: ['approved'],
  transitions: [
    {
      from: 'approved',
      to: 'submitted',
      condition:
        'The visible human approval, reviewId, digest, revision, current draft, and recomputed digest all still match.',
    },
  ],
  humanApprovalRequired: true,
  humanPrerequisite:
    'The visible human must approve the current exact review; no WebMCP tool can create that approval.',
  privacy: {
    dataDisclosed:
      'Only the review identifier crosses the invocation boundary; the result contains identifiers, confirmation, and status rather than intake values.',
    dataPersisted:
      'A local disclosure receipt plus submitted workflow state in localStorage.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: false,
    securityNote:
      'The review binding is revalidated locally; this simulated submission has no remote recipient.',
  },
  relatedOperations: ['submitApprovedIntake'],
})

/** Canonical contract for reading an already-finalized local receipt. */
export const getDisclosureReceiptContract = defineToolContract({
  name: 'get_disclosure_receipt',
  title: 'Get disclosure receipt',
  summary: 'Read what a completed local submission disclosed and withheld.',
  description:
    'Read a local disclosure receipt by receiptId, or read the latest receipt when receiptId is omitted. Returns exactly what was disclosed and withheld and confirms that no network transmission occurred. This does not change state.',
  inputSchema: getDisclosureReceiptSchema,
  outputSchema: disclosureReceiptResultSchema,
  examples: [
    {
      title: 'Read the latest local receipt',
      description:
        'Omitting receiptId retrieves the latest receipt for the current browser origin.',
      input: {},
      result: {
        ok: true,
        data: {
          receiptId: 'receipt_demo_001',
          reviewId: 'review_demo_001',
          submissionTimestamp: '2026-09-03T16:00:00.000Z',
          fieldsDisclosed: FICTIONAL_DRAFT,
          optionalFieldsWithheld: [
            'phone',
            'budgetRange',
            'socialHandle',
            'additionalNotes',
          ],
          neverCollectedCategories: [
            'streetAddress',
            'employer',
            'preciseLiveLocation',
            'paymentInformation',
            'unrelatedPrivateConversationHistory',
          ],
          snapshotDigest: DEMO_DIGEST,
          destination: 'Local demonstration only',
          networkTransmissionOccurred: false,
          statement: 'No network transmission occurred.',
        },
      },
    },
  ],
  errors: [...BOUNDARY_ERRORS, 'RECEIPT_NOT_FOUND'],
  readOnly: true,
  sideEffect: 'none',
  allowedStates: ['submitted'],
  transitions: [
    {
      from: 'submitted',
      to: 'submitted',
      condition: 'The requested local receipt exists.',
    },
  ],
  humanApprovalRequired: false,
  humanPrerequisite:
    'A receipt exists only after an exact review was visibly approved and submitted locally.',
  privacy: {
    dataDisclosed:
      'The receipt returns the exact disclosed values, withheld optional field names, digest, timestamp, and local-only destination.',
    dataPersisted: 'Nothing beyond the existing receipt.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: true,
    securityNote:
      'The receipt is browser-local and is not a tamper-proof audit record.',
  },
  relatedOperations: ['getDisclosureReceipt'],
  annotations: { readOnlyHint: true, untrustedContentHint: true },
})
