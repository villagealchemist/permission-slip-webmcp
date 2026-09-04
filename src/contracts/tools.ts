import {
  CONTACT_PERMISSION_NAMES,
  NEVER_COLLECTED_NAMES,
  OPTIONAL_FIELD_NAMES,
  REQUIRED_FIELD_NAMES,
  SIMULATED_INQUIRY_DESTINATION,
} from '../domain'
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
const DEMO_TIMESTAMP = '2026-09-03T16:00:00.000Z'

const BOUNDARY_ERRORS = [
  'INVALID_INPUT',
  'TOOL_EXECUTION_FAILED',
  'INVALID_TOOL_RESULT',
] as const satisfies readonly ContractErrorCode[]

const FICTIONAL_DRAFT = {
  contactName: 'Maya Chen',
  email: 'maya.chen@example.com',
  inquiryType: 'prototype',
  desiredOutcome:
    'A browser prototype that makes consent checkpoints easy to inspect.',
  relevantBackground:
    'Maya is exploring a small creative-technology collaboration and needs an initial feasibility response.',
  timeline: 'A demonstrable first slice within four weeks.',
  preferredResponseMethod: 'email',
  requestedNextStep: 'written_response',
} as const

const DEMO_CONTACT_PERMISSIONS = {
  projectResponse: true,
  occasionalUpdates: false,
} as const

const DEMO_OPTIONAL_AUTHORIZATIONS = {
  phone: false,
  budgetOrConstraints: false,
  organization: false,
  additionalContext: false,
} as const

const DEMO_INQUIRY_PROVENANCE = {
  entrySource: 'webmcp',
  referralSource: null,
  campaign: null,
} as const

const DEMO_FIELD_PROVENANCE = Object.fromEntries(
  REQUIRED_FIELD_NAMES.map((field) => [
    field,
    {
      source: 'assistant_suggested',
      verifiedByHuman: true,
      updatedAt: DEMO_TIMESTAMP,
      verifiedAt: DEMO_TIMESTAMP,
    },
  ]),
)

const ALL_UNCHANGED_TRANSITIONS = WORKFLOW_STATES.map((state) => ({
  from: state,
  to: state,
  condition: 'The read completes without changing application state.',
}))

/** Canonical contract for reading inquiry policy and human-only prerequisites. */
export const getIntakeRequirementsContract = defineToolContract({
  name: 'get_intake_requirements',
  title: 'Get inquiry requirements',
  summary: 'Inspect the current Village Alchemist inquiry requirements.',
  description:
    'Read the allowed fields, current optional-disclosure boundary, workflow status, and whether human verification, requested-next-step intent, project-response permission, and exact-review approval are satisfied. This read grants none of those permissions and changes no state.',
  inputSchema: emptyObjectSchema,
  outputSchema: intakeRequirementsResultSchema,
  examples: [
    {
      title: 'Inspect an empty inquiry',
      description:
        'The caller learns the narrow inquiry policy without receiving any draft values.',
      input: {},
      result: {
        ok: true,
        data: {
          requiredFields: [...REQUIRED_FIELD_NAMES],
          optionalFields: [...OPTIONAL_FIELD_NAMES],
          authorizedOptionalFields: [],
          neverCollectedFields: [
            'Street address',
            'Employment history',
            'Precise live location',
            'Payment information',
            'Unrelated private conversation history',
          ],
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
            requestedNextStepIntent: {
              required: true,
              confirmed: false,
            },
            projectResponsePermission: {
              required: true,
              granted: false,
            },
            exactReviewApproval: {
              required: true,
              granted: false,
            },
          },
          instructions:
            'Draft only the required fields and currently authorized optional fields. The person must verify assistant suggestions, confirm the requested next step, grant project-response permission, and approve the exact frozen review before submission.',
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
      'Field names, permission flags, human-prerequisite state, never-collected categories, workflow state, and instructions; never draft values.',
    dataPersisted: 'Nothing.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: false,
    securityNote:
      'Readable state grants no authority; no registered tool can operate a human-only control.',
  },
  relatedOperations: ['getIntakeRequirements'],
  annotations: { readOnlyHint: true },
})

/** Canonical contract for atomically replacing the assistant-proposed inquiry. */
export const draftIntakeContract = defineToolContract({
  name: 'draft_intake',
  title: 'Draft project inquiry',
  summary: 'Atomically replace one visible Village Alchemist inquiry draft.',
  description:
    'Replace the visible inquiry with one complete proposal. Unknown fields, malformed values, and optional values lacking visible human authorization reject the whole call. A successful replacement records assistant provenance, marks every supplied value unverified, clears next-step intent, and invalidates any older review or approval.',
  inputSchema: draftIntakeSchema,
  outputSchema: draftIntakeResultSchema,
  examples: [
    {
      title: 'Draft only the required fictional fields',
      description:
        'Optional values remain omitted because the person has not authorized them.',
      input: FICTIONAL_DRAFT,
      result: {
        ok: true,
        data: {
          acceptedFields: [...REQUIRED_FIELD_NAMES],
          withheldFields: [...OPTIONAL_FIELD_NAMES],
          workflowStatus: 'draft',
          revision: 1,
          nextRecommendedAction:
            'Ask the person to verify assistant suggestions, confirm the requested next step, and set contact permissions before review.',
        },
      },
    },
    {
      title: 'Reject unauthorized optional data atomically',
      description:
        'The existing inquiry is not partially changed when phone disclosure is off.',
      input: { ...FICTIONAL_DRAFT, phone: '215-555-0134' },
      result: {
        ok: false,
        error: {
          code: 'UNAUTHORIZED_OPTIONAL_FIELDS',
          message:
            'The inquiry included optional fields the person has not authorized.',
          retryable: true,
          details: {
            retry:
              'Retry without those optional fields, or ask the person to authorize them visibly.',
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
      'The complete inquiry is valid and every supplied optional field is already human-authorized.',
  })),
  humanApprovalRequired: false,
  humanPrerequisite:
    'Any supplied optional field must first be authorized through its visible human-only disclosure control.',
  privacy: {
    dataDisclosed:
      'Required values and only already-authorized optional values enter the shared browser-local inquiry; the result returns field names, not values.',
    dataPersisted:
      'The accepted inquiry, field provenance, and value-free activity metadata in localStorage.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: false,
    securityNote:
      'The tool cannot verify its suggestions, confirm intent, change permissions, approve, return to editing, or reset.',
  },
  relatedOperations: ['replaceDraftFromAgent'],
})

/** Canonical contract for freezing the current exact inquiry payload. */
export const prepareSubmissionReviewContract = defineToolContract({
  name: 'prepare_submission_review',
  title: 'Prepare inquiry review',
  summary: 'Freeze the exact current inquiry and permissions for human review.',
  description:
    'After the person has verified assistant suggestions, confirmed the requested next step, and granted project-response permission, freeze the current inquiry, disclosure authorizations, contact permissions, intent, and provenance under one revision and digest. This call never approves or submits.',
  inputSchema: emptyObjectSchema,
  outputSchema: prepareSubmissionReviewResultSchema,
  examples: [
    {
      title: 'Freeze a qualified fictional inquiry',
      description:
        'The exact frozen payload returned here is also offered for visible human approval.',
      input: {},
      result: {
        ok: true,
        data: {
          reviewId: 'review_demo_001',
          digest: DEMO_DIGEST,
          revision: 1,
          workflowStatus: 'review_pending',
          frozenSnapshot: FICTIONAL_DRAFT,
          disclosedFields: [...REQUIRED_FIELD_NAMES],
          authorizedOptionalFields: [],
          withheldOptionalFields: [...OPTIONAL_FIELD_NAMES],
          optionalDisclosureAuthorizations: DEMO_OPTIONAL_AUTHORIZATIONS,
          contactPermissions: DEMO_CONTACT_PERMISSIONS,
          permissionsGranted: ['projectResponse'],
          permissionsWithheld: ['occasionalUpdates'],
          nextStepIntentConfirmed: true,
          inquiryProvenance: DEMO_INQUIRY_PROVENANCE,
          fieldProvenance: DEMO_FIELD_PROVENANCE,
          humanApprovalRequired:
            'The person must approve this exact visible review before submission.',
        },
      },
    },
  ],
  errors: [
    ...BOUNDARY_ERRORS,
    'SUBMITTED_TERMINAL',
    'INCOMPLETE_DRAFT',
    'INTENT_CONFIRMATION_REQUIRED',
    'CONTACT_PERMISSION_REQUIRED',
    'HUMAN_VERIFICATION_REQUIRED',
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
      'The inquiry and every human-only prerequisite are valid and unchanged while the digest is computed.',
  })),
  humanApprovalRequired: false,
  humanPrerequisite:
    'The person must visibly verify assistant suggestions, confirm requested-next-step intent, and grant project-response permission first.',
  privacy: {
    dataDisclosed:
      'The exact frozen inquiry, permissions, intent, provenance, revision, review identifier, and digest are returned.',
    dataPersisted:
      'The exact frozen review payload and value-free activity metadata in localStorage.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: true,
    securityNote:
      'The digest binds canonical content but does not prove identity or make localStorage tamper-proof.',
  },
  relatedOperations: ['prepareSubmissionReview'],
  annotations: { untrustedContentHint: true },
})

/** Canonical contract for consequential, human-gated local simulation. */
export const submitApprovedIntakeContract = defineToolContract({
  name: 'submit_approved_intake',
  title: 'Submit approved inquiry',
  summary: 'Simulate one unchanged, human-approved inquiry submission locally.',
  description:
    'Consequential local action: execute only the exact unchanged review identified by reviewId after visible human approval. Success stores a qualified-inquiry receipt; rejection stores a PII-free failure receipt. No network request is sent. Retrying the same successful review returns its original submissionId and receiptId.',
  inputSchema: submitApprovedIntakeSchema,
  outputSchema: submitApprovedIntakeResultSchema,
  examples: [
    {
      title: 'Simulate the exact approved inquiry',
      description:
        'This succeeds only while the visible approval still matches the ID, digest, revision, and frozen payload.',
      input: { reviewId: 'review_demo_001' },
      result: {
        ok: true,
        data: {
          confirmation:
            'The approved inquiry snapshot was stored locally as a simulated Village Alchemist submission. No network transmission occurred.',
          submissionId: 'submission_demo_001',
          receiptId: 'receipt_demo_001',
          reviewId: 'review_demo_001',
          workflowStatus: 'submitted',
          idempotentReplay: false,
        },
      },
    },
    {
      title: 'Block submission before human approval',
      description:
        'Preparing a review never grants submission authority; the error links to a PII-free failure receipt.',
      input: { reviewId: 'review_demo_001' },
      result: {
        ok: false,
        error: {
          code: 'APPROVAL_REQUIRED',
          message: 'The person has not approved this review in the webpage.',
          retryable: true,
          details: {
            retry:
              'Wait for visible human approval of the exact review before retrying.',
            receiptId: 'receipt_failure_001',
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
  allowedStates: WORKFLOW_STATES,
  transitions: [
    ...WORKFLOW_STATES.map((state) => ({
      from: state,
      to: state,
      condition:
        state === 'submitted'
          ? 'The same successful review is retried and the original identifiers are replayed, or a rejected attempt records a failure receipt.'
          : 'A rejected attempt records a PII-free receipt without advancing workflow state.',
    })),
    {
      from: 'approved' as const,
      to: 'submitted' as const,
      condition:
        'The visible human approval, reviewId, digest, revision, current payload, and recomputed digest all still match.',
    },
  ],
  humanApprovalRequired: true,
  humanPrerequisite:
    'The visible human must approve the current exact review; no WebMCP tool can create or restore that approval.',
  privacy: {
    dataDisclosed:
      'Only reviewId crosses the invocation boundary; success returns identifiers and status, while failure returns a structured error with a PII-free receipt identifier.',
    dataPersisted:
      'A local success or PII-free failure receipt plus the resulting workflow state in localStorage.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: false,
    securityNote:
      'Execution is snapshot-bound and simulated; there is no remote recipient or network transmission.',
  },
  relatedOperations: ['submitApprovedIntake'],
})

/** Canonical contract for reading one durable local receipt. */
export const getDisclosureReceiptContract = defineToolContract({
  name: 'get_disclosure_receipt',
  title: 'Get inquiry receipt',
  summary: 'Read one simulated inquiry success or rejection receipt.',
  description:
    'Read a browser-local receipt by receiptId, or the latest receipt when omitted. Accepted receipts include the exact frozen inquiry and provenance. Rejected receipts contain only the safe failure explanation and non-PII workflow metadata. Both state that no network transmission occurred.',
  inputSchema: getDisclosureReceiptSchema,
  outputSchema: disclosureReceiptResultSchema,
  examples: [
    {
      title: 'Read an accepted inquiry receipt',
      description:
        'The accepted branch reports the exact approved local simulation.',
      input: { receiptId: 'receipt_demo_001' },
      result: {
        ok: true,
        data: {
          receiptId: 'receipt_demo_001',
          submissionId: 'submission_demo_001',
          submissionTimestamp: DEMO_TIMESTAMP,
          outcome: 'accepted',
          status: 'qualified_inquiry_created',
          destination: SIMULATED_INQUIRY_DESTINATION,
          requestedNextStep: 'written_response',
          permissionsGranted: ['projectResponse'],
          permissionsWithheld: ['occasionalUpdates'],
          inquiryProvenance: DEMO_INQUIRY_PROVENANCE,
          reviewId: 'review_demo_001',
          reviewRevision: 1,
          reviewDigest: DEMO_DIGEST,
          frozenSnapshot: FICTIONAL_DRAFT,
          fieldsDisclosed: FICTIONAL_DRAFT,
          disclosedFieldNames: [...REQUIRED_FIELD_NAMES],
          optionalFieldsWithheld: [...OPTIONAL_FIELD_NAMES],
          neverCollectedCategories: [...NEVER_COLLECTED_NAMES],
          snapshotDigest: DEMO_DIGEST,
          fieldProvenance: DEMO_FIELD_PROVENANCE,
          contactPermissions: DEMO_CONTACT_PERMISSIONS,
          noNetworkTransmission: true,
          statement: 'No network transmission occurred.',
        },
      },
    },
    {
      title: 'Read a PII-free rejection receipt',
      description:
        'The rejected branch omits frozenSnapshot, fieldsDisclosed, and all inquiry values.',
      input: { receiptId: 'receipt_failure_001' },
      result: {
        ok: true,
        data: {
          receiptId: 'receipt_failure_001',
          submissionId: null,
          submissionTimestamp: DEMO_TIMESTAMP,
          outcome: 'rejected',
          status: 'submission_rejected',
          destination: SIMULATED_INQUIRY_DESTINATION,
          requestedNextStep: null,
          permissionsGranted: [],
          permissionsWithheld: [...CONTACT_PERMISSION_NAMES],
          inquiryProvenance: {
            entrySource: 'direct',
            referralSource: null,
            campaign: null,
          },
          reviewId: null,
          reviewRevision: null,
          reviewDigest: null,
          failure: {
            code: 'REVIEW_NOT_FOUND',
            message: 'No review exists for this inquiry.',
            retry: 'Prepare a review and wait for human approval before submitting.',
          },
          noNetworkTransmission: true,
          statement: 'No network transmission occurred.',
        },
      },
    },
  ],
  errors: [...BOUNDARY_ERRORS, 'RECEIPT_NOT_FOUND'],
  readOnly: true,
  sideEffect: 'none',
  allowedStates: WORKFLOW_STATES,
  transitions: ALL_UNCHANGED_TRANSITIONS,
  humanApprovalRequired: false,
  humanPrerequisite:
    'A receipt exists only after a submit attempt; failed attempts are safe to inspect without exposing inquiry values.',
  privacy: {
    dataDisclosed:
      'Accepted receipts return the frozen approved inquiry and provenance. Rejected receipts return no inquiry snapshot or field values.',
    dataPersisted: 'Nothing beyond the existing browser-local receipt.',
    networkTransmission: false,
    resultContainsHumanAuthoredValues: true,
    securityNote:
      'The receipt is browser-local, not an identity proof or tamper-proof audit record.',
  },
  relatedOperations: ['getDisclosureReceipt'],
  annotations: { readOnlyHint: true, untrustedContentHint: true },
})
