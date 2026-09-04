import type { ContractErrorCode } from './defineContract'

/** Documentation for a stable structured error code. */
export interface ContractErrorDefinition {
  code: ContractErrorCode
  source: 'boundary' | 'domain' | 'store'
  summary: string
  recovery: string
  retryable: boolean | 'depends'
}

function defineError(
  definition: ContractErrorDefinition,
): ContractErrorDefinition {
  return Object.freeze(definition)
}

/** Canonical error taxonomy referenced by every tool contract. */
export const CONTRACT_ERRORS = {
  APPROVAL_REQUIRED: defineError({
    code: 'APPROVAL_REQUIRED',
    source: 'domain',
    summary: 'The visible human has not approved the current exact review.',
    recovery: 'Wait for the human to approve the displayed review, then retry.',
    retryable: true,
  }),
  CONTACT_PERMISSION_REQUIRED: defineError({
    code: 'CONTACT_PERMISSION_REQUIRED',
    source: 'domain',
    summary: 'The person has not granted permission for a project response.',
    recovery:
      'Ask the person to grant the visible project-response permission; no tool can grant it.',
    retryable: true,
  }),
  DIGEST_MISMATCH: defineError({
    code: 'DIGEST_MISMATCH',
    source: 'domain',
    summary: 'The current canonical snapshot no longer matches the frozen digest.',
    recovery: 'Return to editing and prepare a fresh review.',
    retryable: true,
  }),
  DIGEST_UNAVAILABLE: defineError({
    code: 'DIGEST_UNAVAILABLE',
    source: 'domain',
    summary: 'The browser could not compute or verify the SHA-256 snapshot digest.',
    recovery: 'Retry in a browser with Web Crypto support or restart the review.',
    retryable: true,
  }),
  HUMAN_ACTION_REQUIRED: defineError({
    code: 'HUMAN_ACTION_REQUIRED',
    source: 'domain',
    summary: 'A human-only control must complete the next workflow step.',
    recovery: 'Ask the human to use the visible page control.',
    retryable: true,
  }),
  HUMAN_VERIFICATION_REQUIRED: defineError({
    code: 'HUMAN_VERIFICATION_REQUIRED',
    source: 'domain',
    summary: 'Assistant-suggested inquiry values still need human verification.',
    recovery:
      'Ask the person to verify the visible suggestions; no tool can mark them verified.',
    retryable: true,
  }),
  INCOMPLETE_DRAFT: defineError({
    code: 'INCOMPLETE_DRAFT',
    source: 'domain',
    summary: 'The draft is missing or contains invalid required information.',
    recovery: 'Correct every reported field before preparing a review.',
    retryable: true,
  }),
  INVALID_INPUT: defineError({
    code: 'INVALID_INPUT',
    source: 'boundary',
    summary: 'Input failed the declared contract or domain validation.',
    recovery: 'Correct every reported issue and retry the complete operation.',
    retryable: true,
  }),
  INVALID_STATE: defineError({
    code: 'INVALID_STATE',
    source: 'domain',
    summary: 'The requested transition is not valid from the current state.',
    recovery: 'Inspect the visible workflow and complete the required prior step.',
    retryable: true,
  }),
  INVALID_TOOL_RESULT: defineError({
    code: 'INVALID_TOOL_RESULT',
    source: 'boundary',
    summary: 'The application produced a result that was not JSON serializable.',
    recovery: 'Do not retry automatically; inspect the application.',
    retryable: false,
  }),
  INTENT_CONFIRMATION_REQUIRED: defineError({
    code: 'INTENT_CONFIRMATION_REQUIRED',
    source: 'domain',
    summary: 'The person has not confirmed the requested business next step.',
    recovery:
      'Ask the person to confirm the visible requested next step; no tool can confirm it.',
    retryable: true,
  }),
  RECEIPT_NOT_FOUND: defineError({
    code: 'RECEIPT_NOT_FOUND',
    source: 'domain',
    summary: 'No matching local disclosure receipt exists.',
    recovery: 'Check the receipt identifier or omit it to request the latest receipt.',
    retryable: true,
  }),
  REVIEW_NOT_FOUND: defineError({
    code: 'REVIEW_NOT_FOUND',
    source: 'domain',
    summary: 'The requested frozen review is not the current review.',
    recovery: 'Prepare a current review and use its returned identifier.',
    retryable: true,
  }),
  STALE_OPERATION: defineError({
    code: 'STALE_OPERATION',
    source: 'store',
    summary: 'Another tab or operation changed state during asynchronous work.',
    recovery: 'Read the current state and retry from the visible workflow.',
    retryable: true,
  }),
  STALE_REVIEW: defineError({
    code: 'STALE_REVIEW',
    source: 'domain',
    summary: 'An edit or authorization change invalidated the review.',
    recovery: 'Prepare a fresh review and obtain fresh human approval.',
    retryable: true,
  }),
  SUBMITTED_TERMINAL: defineError({
    code: 'SUBMITTED_TERMINAL',
    source: 'domain',
    summary: 'The current demo has already reached its terminal submitted state.',
    recovery: 'Only the human can reset the local demo before a new intake.',
    retryable: false,
  }),
  TOOL_EXECUTION_FAILED: defineError({
    code: 'TOOL_EXECUTION_FAILED',
    source: 'boundary',
    summary: 'Unexpected application execution failed safely.',
    recovery: 'Inspect the visible workflow and retry only when appropriate.',
    retryable: true,
  }),
  UNAUTHORIZED_OPTIONAL_FIELDS: defineError({
    code: 'UNAUTHORIZED_OPTIONAL_FIELDS',
    source: 'domain',
    summary: 'The draft included optional values the human has not authorized.',
    recovery: 'Remove those fields; only the human can change disclosure toggles.',
    retryable: true,
  }),
  UNKNOWN_FIELDS: defineError({
    code: 'UNKNOWN_FIELDS',
    source: 'domain',
    summary: 'The draft contained properties outside the published intake model.',
    recovery: 'Retry using only fields returned by get_intake_requirements.',
    retryable: true,
  }),
} as const satisfies Record<ContractErrorCode, ContractErrorDefinition>

/** Structured failure envelope shared by all documented output schemas. */
export const TOOL_FAILURE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { const: false },
    error: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          enum: Object.keys(CONTRACT_ERRORS),
        },
        message: { type: 'string' },
        retryable: { type: 'boolean' },
        details: {
          type: 'object',
          properties: {
            retry: { type: 'string' },
            fields: {
              type: 'array',
              items: { type: 'string' },
              uniqueItems: true,
            },
            issues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  path: { type: 'string' },
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
                required: ['code', 'message'],
                additionalProperties: false,
              },
            },
            receiptId: {
              type: 'string',
              minLength: 1,
              maxLength: 128,
              pattern: '^[A-Za-z0-9._-]+$',
            },
          },
          additionalProperties: false,
        },
      },
      required: ['code', 'message', 'retryable'],
      additionalProperties: false,
    },
  },
  required: ['ok', 'error'],
  additionalProperties: false,
} as const
