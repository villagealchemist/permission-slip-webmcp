import {
  INQUIRY_TYPES,
  PREFERRED_RESPONSE_METHODS,
  REQUESTED_NEXT_STEPS,
  REQUIRED_FIELD_NAMES,
} from '../domain'
import type { JsonSchema } from './defineContract'

/** Canonical externally visible constraints for one Village Alchemist inquiry. */
export const INTAKE_FIELD_SCHEMAS = {
  contactName: {
    type: 'string',
    description: 'Name of the person asking Village Alchemist to respond.',
    minLength: 2,
    maxLength: 100,
  },
  email: {
    type: 'string',
    description: 'Email address for the requested project response.',
    format: 'email',
    minLength: 3,
    maxLength: 254,
  },
  inquiryType: {
    type: 'string',
    description: 'The kind of Village Alchemist project inquiry.',
    enum: INQUIRY_TYPES,
  },
  desiredOutcome: {
    type: 'string',
    description: 'The concrete result the person wants the project to produce.',
    minLength: 10,
    maxLength: 1_500,
  },
  relevantBackground: {
    type: 'string',
    description: 'Existing context needed to make a first response useful.',
    minLength: 10,
    maxLength: 2_000,
  },
  timeline: {
    type: 'string',
    description: 'The target window, deadline, or current timing constraint.',
    minLength: 2,
    maxLength: 200,
  },
  preferredResponseMethod: {
    type: 'string',
    description: 'How the person would prefer Village Alchemist to respond.',
    enum: PREFERRED_RESPONSE_METHODS,
  },
  requestedNextStep: {
    type: 'string',
    description: 'The specific business next step the person is requesting.',
    enum: REQUESTED_NEXT_STEPS,
  },
  phone: {
    type: 'string',
    description:
      'Optional callback number. Include only after the person authorizes this disclosure in the webpage.',
    minLength: 7,
    maxLength: 40,
    pattern: '^[0-9+().\\-\\s]+$',
  },
  budgetOrConstraints: {
    type: 'string',
    description:
      'Optional planning boundaries. Include only after the person authorizes this disclosure in the webpage.',
    minLength: 1,
    maxLength: 500,
  },
  organization: {
    type: 'string',
    description:
      'Optional organization name. Include only after the person authorizes this disclosure in the webpage.',
    minLength: 1,
    maxLength: 160,
  },
  additionalContext: {
    type: 'string',
    description:
      'Optional extra project context. Include only after the person authorizes this disclosure in the webpage.',
    minLength: 1,
    maxLength: 2_000,
  },
} as const satisfies Record<string, JsonSchema>

/** Required draft property names, shared with the domain model. */
export const REQUIRED_DRAFT_PROPERTIES = REQUIRED_FIELD_NAMES

/** Schema for opaque review, receipt, and submission identifiers. */
export const OPAQUE_ID_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9._-]+$',
} as const satisfies JsonSchema

/** Complete qualified inquiry values plus any present authorized optionals. */
export const DISCLOSURE_SNAPSHOT_SCHEMA = {
  type: 'object',
  properties: INTAKE_FIELD_SCHEMAS,
  required: REQUIRED_DRAFT_PROPERTIES,
  additionalProperties: false,
} as const satisfies JsonSchema
