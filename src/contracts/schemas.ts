import {
  CONTACT_PERMISSION_NAMES,
  INTAKE_FIELD_NAMES,
  NEVER_COLLECTED_DEFINITIONS,
  NEVER_COLLECTED_NAMES,
  OPTIONAL_FIELD_NAMES,
  REQUESTED_NEXT_STEPS,
  REQUIRED_FIELD_NAMES,
  SIMULATED_INQUIRY_DESTINATION,
} from '../domain'
import type { JsonSchema } from './defineContract'
import { CONTRACT_ERRORS, TOOL_FAILURE_SCHEMA } from './errors'
import {
  DISCLOSURE_SNAPSHOT_SCHEMA,
  INTAKE_FIELD_SCHEMAS,
  OPAQUE_ID_SCHEMA,
  REQUIRED_DRAFT_PROPERTIES,
} from './fields'
import { WORKFLOW_STATES } from './workflow'

/** Closed input object used by tools that accept no arguments. */
export const emptyObjectSchema = {
  type: 'object',
  description: 'No input parameters are accepted.',
  properties: {},
  additionalProperties: false,
} as const satisfies JsonSchema

/** Canonical external shape for an atomic agent inquiry replacement. */
export const draftIntakeSchema = {
  type: 'object',
  description:
    'One complete proposed Village Alchemist project inquiry. Optional values are accepted only when the person has enabled their matching disclosure controls in the webpage.',
  properties: INTAKE_FIELD_SCHEMAS,
  required: REQUIRED_DRAFT_PROPERTIES,
  additionalProperties: false,
} as const satisfies JsonSchema

/** Exact review identifier accepted by the consequential submission tool. */
export const submitApprovedIntakeSchema = {
  type: 'object',
  description:
    'Identifies the exact frozen inquiry review that the person approved in the webpage.',
  properties: {
    reviewId: {
      ...OPAQUE_ID_SCHEMA,
      description:
        'The exact review identifier returned by prepare_submission_review and approved by the person in the webpage.',
    },
  },
  required: ['reviewId'],
  additionalProperties: false,
} as const satisfies JsonSchema

/** Optional receipt lookup input; omission means the latest local receipt. */
export const getDisclosureReceiptSchema = {
  type: 'object',
  description:
    'Optionally identifies one local simulated-submission receipt; omit receiptId to request the latest receipt.',
  properties: {
    receiptId: {
      ...OPAQUE_ID_SCHEMA,
      description:
        'Optional receipt identifier. Omit it to retrieve the latest success or failure receipt.',
    },
  },
  additionalProperties: false,
} as const satisfies JsonSchema

const fieldNameArraySchema = {
  type: 'array',
  items: { type: 'string', enum: INTAKE_FIELD_NAMES },
  maxItems: INTAKE_FIELD_NAMES.length,
  uniqueItems: true,
} as const satisfies JsonSchema

const requiredFieldNameArraySchema = {
  type: 'array',
  items: { type: 'string', enum: REQUIRED_FIELD_NAMES },
  minItems: REQUIRED_FIELD_NAMES.length,
  maxItems: REQUIRED_FIELD_NAMES.length,
  uniqueItems: true,
} as const satisfies JsonSchema

const optionalFieldNameArraySchema = {
  type: 'array',
  items: { type: 'string', enum: OPTIONAL_FIELD_NAMES },
  maxItems: OPTIONAL_FIELD_NAMES.length,
  uniqueItems: true,
} as const satisfies JsonSchema

const allOptionalFieldNameArraySchema = {
  ...optionalFieldNameArraySchema,
  minItems: OPTIONAL_FIELD_NAMES.length,
} as const satisfies JsonSchema

const contactPermissionNameArraySchema = {
  type: 'array',
  items: { type: 'string', enum: CONTACT_PERMISSION_NAMES },
  maxItems: CONTACT_PERMISSION_NAMES.length,
  uniqueItems: true,
} as const satisfies JsonSchema

const contactPermissionsSchema = {
  type: 'object',
  properties: Object.fromEntries(
    CONTACT_PERMISSION_NAMES.map((name) => [name, { type: 'boolean' }]),
  ),
  required: CONTACT_PERMISSION_NAMES,
  additionalProperties: false,
} as const satisfies JsonSchema

const optionalDisclosureAuthorizationsSchema = {
  type: 'object',
  properties: Object.fromEntries(
    OPTIONAL_FIELD_NAMES.map((name) => [name, { type: 'boolean' }]),
  ),
  required: OPTIONAL_FIELD_NAMES,
  additionalProperties: false,
} as const satisfies JsonSchema

const nullableStringSchema = {
  anyOf: [{ type: 'string' }, { type: 'null' }],
} as const satisfies JsonSchema

const inquiryProvenanceSchema = {
  type: 'object',
  properties: {
    entrySource: { type: 'string', enum: ['direct', 'webmcp'] },
    referralSource: nullableStringSchema,
    campaign: nullableStringSchema,
  },
  required: ['entrySource', 'referralSource', 'campaign'],
  additionalProperties: false,
} as const satisfies JsonSchema

const fieldProvenanceEntrySchema = {
  type: 'object',
  properties: {
    source: {
      type: 'string',
      enum: ['person_provided', 'assistant_suggested'],
    },
    verifiedByHuman: { type: 'boolean' },
    updatedAt: { type: 'string', format: 'date-time' },
    verifiedAt: { type: 'string', format: 'date-time' },
  },
  required: ['source', 'verifiedByHuman', 'updatedAt'],
  additionalProperties: false,
} as const satisfies JsonSchema

const fieldProvenanceSchema = {
  type: 'object',
  properties: Object.fromEntries(
    INTAKE_FIELD_NAMES.map((name) => [name, fieldProvenanceEntrySchema]),
  ),
  additionalProperties: false,
} as const satisfies JsonSchema

const digestSchema = {
  type: 'string',
  pattern: '^[a-f0-9]{64}$',
} as const satisfies JsonSchema

const revisionSchema = {
  type: 'integer',
  minimum: 0,
} as const satisfies JsonSchema

function successSchema(data: JsonSchema): JsonSchema {
  return {
    type: 'object',
    properties: { ok: { const: true }, data },
    required: ['ok', 'data'],
    additionalProperties: false,
  }
}

function toolResultSchema(data: JsonSchema): JsonSchema {
  return {
    oneOf: [successSchema(data), TOOL_FAILURE_SCHEMA],
  }
}

/** Result envelope for the policy, workflow, and human-only prerequisite read. */
export const intakeRequirementsResultSchema = toolResultSchema({
  type: 'object',
  properties: {
    requiredFields: requiredFieldNameArraySchema,
    optionalFields: allOptionalFieldNameArraySchema,
    authorizedOptionalFields: optionalFieldNameArraySchema,
    neverCollectedFields: {
      type: 'array',
      items: {
        type: 'string',
        enum: NEVER_COLLECTED_DEFINITIONS.map((definition) => definition.label),
      },
      minItems: NEVER_COLLECTED_DEFINITIONS.length,
      maxItems: NEVER_COLLECTED_DEFINITIONS.length,
      uniqueItems: true,
    },
    workflowStatus: { type: 'string', enum: WORKFLOW_STATES },
    nextStepIntentConfirmed: { type: 'boolean' },
    contactPermissions: contactPermissionsSchema,
    unverifiedAssistantFields: fieldNameArraySchema,
    humanOnlyRequirements: {
      type: 'object',
      properties: {
        assistantSuggestionVerification: {
          type: 'object',
          properties: {
            required: { const: true },
            complete: { type: 'boolean' },
            unverifiedFields: fieldNameArraySchema,
          },
          required: ['required', 'complete', 'unverifiedFields'],
          additionalProperties: false,
        },
        requestedNextStepIntent: {
          type: 'object',
          properties: {
            required: { const: true },
            confirmed: { type: 'boolean' },
          },
          required: ['required', 'confirmed'],
          additionalProperties: false,
        },
        projectResponsePermission: {
          type: 'object',
          properties: {
            required: { const: true },
            granted: { type: 'boolean' },
          },
          required: ['required', 'granted'],
          additionalProperties: false,
        },
        exactReviewApproval: {
          type: 'object',
          properties: {
            required: { const: true },
            granted: { type: 'boolean' },
          },
          required: ['required', 'granted'],
          additionalProperties: false,
        },
      },
      required: [
        'assistantSuggestionVerification',
        'requestedNextStepIntent',
        'projectResponsePermission',
        'exactReviewApproval',
      ],
      additionalProperties: false,
    },
    instructions: { type: 'string' },
  },
  required: [
    'requiredFields',
    'optionalFields',
    'authorizedOptionalFields',
    'neverCollectedFields',
    'workflowStatus',
    'nextStepIntentConfirmed',
    'contactPermissions',
    'unverifiedAssistantFields',
    'humanOnlyRequirements',
    'instructions',
  ],
  additionalProperties: false,
})

/** Result envelope for a successful or rejected atomic inquiry replacement. */
export const draftIntakeResultSchema = toolResultSchema({
  type: 'object',
  properties: {
    acceptedFields: fieldNameArraySchema,
    withheldFields: optionalFieldNameArraySchema,
    workflowStatus: { const: 'draft' },
    revision: revisionSchema,
    nextRecommendedAction: { type: 'string' },
  },
  required: [
    'acceptedFields',
    'withheldFields',
    'workflowStatus',
    'revision',
    'nextRecommendedAction',
  ],
  additionalProperties: false,
})

/** Result envelope containing the exact inquiry payload offered for approval. */
export const prepareSubmissionReviewResultSchema = toolResultSchema({
  type: 'object',
  properties: {
    reviewId: OPAQUE_ID_SCHEMA,
    digest: digestSchema,
    revision: revisionSchema,
    workflowStatus: { const: 'review_pending' },
    frozenSnapshot: DISCLOSURE_SNAPSHOT_SCHEMA,
    disclosedFields: fieldNameArraySchema,
    authorizedOptionalFields: optionalFieldNameArraySchema,
    withheldOptionalFields: optionalFieldNameArraySchema,
    optionalDisclosureAuthorizations:
      optionalDisclosureAuthorizationsSchema,
    contactPermissions: contactPermissionsSchema,
    permissionsGranted: contactPermissionNameArraySchema,
    permissionsWithheld: contactPermissionNameArraySchema,
    nextStepIntentConfirmed: { const: true },
    inquiryProvenance: inquiryProvenanceSchema,
    fieldProvenance: fieldProvenanceSchema,
    humanApprovalRequired: { type: 'string' },
  },
  required: [
    'reviewId',
    'digest',
    'revision',
    'workflowStatus',
    'frozenSnapshot',
    'disclosedFields',
    'authorizedOptionalFields',
    'withheldOptionalFields',
    'optionalDisclosureAuthorizations',
    'contactPermissions',
    'permissionsGranted',
    'permissionsWithheld',
    'nextStepIntentConfirmed',
    'inquiryProvenance',
    'fieldProvenance',
    'humanApprovalRequired',
  ],
  additionalProperties: false,
})

/** Result envelope for local simulation after exact human approval. */
export const submitApprovedIntakeResultSchema = toolResultSchema({
  type: 'object',
  properties: {
    confirmation: { type: 'string' },
    submissionId: OPAQUE_ID_SCHEMA,
    receiptId: OPAQUE_ID_SCHEMA,
    reviewId: OPAQUE_ID_SCHEMA,
    workflowStatus: { const: 'submitted' },
    idempotentReplay: { type: 'boolean' },
  },
  required: [
    'confirmation',
    'submissionId',
    'receiptId',
    'reviewId',
    'workflowStatus',
    'idempotentReplay',
  ],
  additionalProperties: false,
})

const commonReceiptProperties = {
  receiptId: OPAQUE_ID_SCHEMA,
  submissionTimestamp: { type: 'string', format: 'date-time' },
  destination: { const: SIMULATED_INQUIRY_DESTINATION },
  permissionsGranted: contactPermissionNameArraySchema,
  permissionsWithheld: contactPermissionNameArraySchema,
  inquiryProvenance: inquiryProvenanceSchema,
  noNetworkTransmission: { const: true },
  statement: { const: 'No network transmission occurred.' },
} as const

const commonReceiptRequired = [
  'receiptId',
  'submissionTimestamp',
  'destination',
  'permissionsGranted',
  'permissionsWithheld',
  'inquiryProvenance',
  'noNetworkTransmission',
  'statement',
] as const

const successfulReceiptSchema = {
  type: 'object',
  properties: {
    ...commonReceiptProperties,
    outcome: { const: 'accepted' },
    status: { const: 'qualified_inquiry_created' },
    submissionId: OPAQUE_ID_SCHEMA,
    requestedNextStep: { type: 'string', enum: REQUESTED_NEXT_STEPS },
    reviewId: OPAQUE_ID_SCHEMA,
    reviewRevision: revisionSchema,
    reviewDigest: digestSchema,
    frozenSnapshot: DISCLOSURE_SNAPSHOT_SCHEMA,
    fieldsDisclosed: DISCLOSURE_SNAPSHOT_SCHEMA,
    disclosedFieldNames: fieldNameArraySchema,
    optionalFieldsWithheld: optionalFieldNameArraySchema,
    neverCollectedCategories: {
      type: 'array',
      items: { type: 'string', enum: NEVER_COLLECTED_NAMES },
      minItems: NEVER_COLLECTED_NAMES.length,
      maxItems: NEVER_COLLECTED_NAMES.length,
      uniqueItems: true,
    },
    snapshotDigest: digestSchema,
    fieldProvenance: fieldProvenanceSchema,
    contactPermissions: contactPermissionsSchema,
  },
  required: [
    ...commonReceiptRequired,
    'outcome',
    'status',
    'submissionId',
    'requestedNextStep',
    'reviewId',
    'reviewRevision',
    'reviewDigest',
    'frozenSnapshot',
    'fieldsDisclosed',
    'disclosedFieldNames',
    'optionalFieldsWithheld',
    'neverCollectedCategories',
    'snapshotDigest',
    'fieldProvenance',
    'contactPermissions',
  ],
  additionalProperties: false,
} as const satisfies JsonSchema

const nullableRequestedNextStepSchema = {
  anyOf: [
    { type: 'string', enum: REQUESTED_NEXT_STEPS },
    { type: 'null' },
  ],
} as const satisfies JsonSchema

const nullableOpaqueIdSchema = {
  anyOf: [OPAQUE_ID_SCHEMA, { type: 'null' }],
} as const satisfies JsonSchema

const nullableRevisionSchema = {
  anyOf: [revisionSchema, { type: 'null' }],
} as const satisfies JsonSchema

const nullableDigestSchema = {
  anyOf: [digestSchema, { type: 'null' }],
} as const satisfies JsonSchema

const domainErrorCodes = Object.values(CONTRACT_ERRORS)
  .filter((definition) => definition.source !== 'boundary')
  .map((definition) => definition.code)

const failedReceiptSchema = {
  type: 'object',
  properties: {
    ...commonReceiptProperties,
    outcome: { const: 'rejected' },
    status: { const: 'submission_rejected' },
    submissionId: { type: 'null' },
    requestedNextStep: nullableRequestedNextStepSchema,
    reviewId: nullableOpaqueIdSchema,
    reviewRevision: nullableRevisionSchema,
    reviewDigest: nullableDigestSchema,
    failure: {
      type: 'object',
      properties: {
        code: { type: 'string', enum: domainErrorCodes },
        message: { type: 'string' },
        retry: { type: 'string' },
      },
      required: ['code', 'message', 'retry'],
      additionalProperties: false,
    },
  },
  required: [
    ...commonReceiptRequired,
    'outcome',
    'status',
    'submissionId',
    'requestedNextStep',
    'reviewId',
    'reviewRevision',
    'reviewDigest',
    'failure',
  ],
  additionalProperties: false,
} as const satisfies JsonSchema

/** Result envelope for an accepted or PII-free rejected local receipt. */
export const disclosureReceiptResultSchema = toolResultSchema({
  oneOf: [successfulReceiptSchema, failedReceiptSchema],
})
