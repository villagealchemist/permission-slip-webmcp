import {
  INTAKE_FIELD_NAMES,
  NEVER_COLLECTED_DEFINITIONS,
  NEVER_COLLECTED_NAMES,
  OPTIONAL_FIELD_NAMES,
  REQUIRED_FIELD_NAMES,
} from '../domain'
import type { JsonSchema } from './defineContract'
import {
  DISCLOSURE_SNAPSHOT_SCHEMA,
  INTAKE_FIELD_SCHEMAS,
  OPAQUE_ID_SCHEMA,
  REQUIRED_DRAFT_PROPERTIES,
} from './fields'
import { TOOL_FAILURE_SCHEMA } from './errors'
import { WORKFLOW_STATES } from './workflow'

/** Closed input object used by tools that accept no arguments. */
export const emptyObjectSchema = {
  type: 'object',
  description: 'No input parameters are accepted.',
  properties: {},
  additionalProperties: false,
} as const satisfies JsonSchema

/** Canonical external shape for an atomic agent draft replacement. */
export const draftIntakeSchema = {
  type: 'object',
  description:
    'A complete proposed workshop intake. Optional fields are accepted only when the person has enabled their matching disclosure controls in the webpage.',
  properties: INTAKE_FIELD_SCHEMAS,
  required: REQUIRED_DRAFT_PROPERTIES,
  additionalProperties: false,
} as const satisfies JsonSchema

/** Exact review identifier accepted by the consequential submission tool. */
export const submitApprovedIntakeSchema = {
  type: 'object',
  description:
    'Identifies the exact frozen review that the person approved in the webpage.',
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
    'Optionally identifies one local receipt; omit receiptId to request the latest receipt.',
  properties: {
    receiptId: {
      ...OPAQUE_ID_SCHEMA,
      description:
        'Optional receipt identifier. Omit it to retrieve the latest receipt.',
    },
  },
  additionalProperties: false,
} as const satisfies JsonSchema

const fieldNameArraySchema = {
  type: 'array',
  items: { type: 'string', enum: INTAKE_FIELD_NAMES },
  minItems: REQUIRED_FIELD_NAMES.length,
  maxItems: INTAKE_FIELD_NAMES.length,
  uniqueItems: true,
} as const

const requiredFieldNameArraySchema = {
  type: 'array',
  items: { type: 'string', enum: REQUIRED_FIELD_NAMES },
  minItems: REQUIRED_FIELD_NAMES.length,
  maxItems: REQUIRED_FIELD_NAMES.length,
  uniqueItems: true,
} as const

const optionalFieldNameArraySchema = {
  type: 'array',
  items: { type: 'string', enum: OPTIONAL_FIELD_NAMES },
  maxItems: OPTIONAL_FIELD_NAMES.length,
  uniqueItems: true,
} as const

const allOptionalFieldNameArraySchema = {
  ...optionalFieldNameArraySchema,
  minItems: OPTIONAL_FIELD_NAMES.length,
} as const

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

/** Result envelope for the policy and workflow-status read. */
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
    instructions: { type: 'string' },
  },
  required: [
    'requiredFields',
    'optionalFields',
    'authorizedOptionalFields',
    'neverCollectedFields',
    'workflowStatus',
    'instructions',
  ],
  additionalProperties: false,
})

/** Result envelope for a successful or rejected atomic draft replacement. */
export const draftIntakeResultSchema = toolResultSchema({
  type: 'object',
  properties: {
    acceptedFields: fieldNameArraySchema,
    withheldFields: optionalFieldNameArraySchema,
    workflowStatus: { const: 'draft' },
    nextRecommendedAction: { type: 'string' },
  },
  required: [
    'acceptedFields',
    'withheldFields',
    'workflowStatus',
    'nextRecommendedAction',
  ],
  additionalProperties: false,
})

/** Result envelope containing the exact disclosure offered for human review. */
export const prepareSubmissionReviewResultSchema = toolResultSchema({
  type: 'object',
  properties: {
    reviewId: OPAQUE_ID_SCHEMA,
    digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    reviewSummary: {
      type: 'object',
      properties: {
        fieldsDisclosed: DISCLOSURE_SNAPSHOT_SCHEMA,
        optionalFieldsWithheld: optionalFieldNameArraySchema,
      },
      required: ['fieldsDisclosed', 'optionalFieldsWithheld'],
      additionalProperties: false,
    },
    humanApprovalRequired: { type: 'string' },
  },
  required: ['reviewId', 'digest', 'reviewSummary', 'humanApprovalRequired'],
  additionalProperties: false,
})

/** Result envelope for local finalization after exact human approval. */
export const submitApprovedIntakeResultSchema = toolResultSchema({
  type: 'object',
  properties: {
    confirmation: { type: 'string' },
    receiptId: OPAQUE_ID_SCHEMA,
    reviewId: OPAQUE_ID_SCHEMA,
    workflowStatus: { const: 'submitted' },
  },
  required: ['confirmation', 'receiptId', 'reviewId', 'workflowStatus'],
  additionalProperties: false,
})

/** Result envelope for the exact local disclosure record. */
export const disclosureReceiptResultSchema = toolResultSchema({
  type: 'object',
  properties: {
    receiptId: OPAQUE_ID_SCHEMA,
    reviewId: OPAQUE_ID_SCHEMA,
    submissionTimestamp: { type: 'string', format: 'date-time' },
    fieldsDisclosed: DISCLOSURE_SNAPSHOT_SCHEMA,
    optionalFieldsWithheld: optionalFieldNameArraySchema,
    neverCollectedCategories: {
      type: 'array',
      items: { type: 'string', enum: NEVER_COLLECTED_NAMES },
      minItems: NEVER_COLLECTED_NAMES.length,
      maxItems: NEVER_COLLECTED_NAMES.length,
      uniqueItems: true,
    },
    snapshotDigest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    destination: { const: 'Local demonstration only' },
    networkTransmissionOccurred: { const: false },
    statement: { const: 'No network transmission occurred.' },
  },
  required: [
    'receiptId',
    'reviewId',
    'submissionTimestamp',
    'fieldsDisclosed',
    'optionalFieldsWithheld',
    'neverCollectedCategories',
    'snapshotDigest',
    'destination',
    'networkTransmissionOccurred',
    'statement',
  ],
  additionalProperties: false,
})
