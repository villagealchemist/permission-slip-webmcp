import { REQUIRED_FIELD_NAMES } from '../domain'
import type { JsonSchema } from './defineContract'

/** Canonical externally visible constraints for accepted intake values. */
export const INTAKE_FIELD_SCHEMAS = {
  contactName: {
    type: 'string',
    description: 'Name of the person making the workshop inquiry.',
    minLength: 2,
    maxLength: 100,
  },
  email: {
    type: 'string',
    description: 'Contact email address for the inquiry.',
    format: 'email',
    minLength: 3,
    maxLength: 254,
  },
  eventType: {
    type: 'string',
    description: 'Short name for the proposed event or workshop.',
    minLength: 3,
    maxLength: 160,
  },
  preferredDate: {
    type: 'string',
    description: 'Preferred event date in YYYY-MM-DD format.',
    format: 'date',
    minLength: 10,
    maxLength: 10,
  },
  estimatedAttendeeCount: {
    type: 'integer',
    description: 'Estimated number of attendees, from 1 through 1,000.',
    minimum: 1,
    maximum: 1_000,
  },
  eventGoal: {
    type: 'string',
    description: 'What the event is intended to accomplish.',
    minLength: 10,
    maxLength: 1_000,
  },
  phone: {
    type: 'string',
    description:
      'Optional contact phone. Include only when phone disclosure is currently authorized in the webpage.',
    minLength: 7,
    maxLength: 40,
    pattern: '^[0-9+().\\-\\s]+$',
  },
  budgetRange: {
    type: 'string',
    description:
      'Optional budget range. Include only when budget disclosure is currently authorized in the webpage.',
    minLength: 1,
    maxLength: 120,
  },
  socialHandle: {
    type: 'string',
    description:
      'Optional social handle. Include only when social-handle disclosure is currently authorized in the webpage.',
    minLength: 1,
    maxLength: 100,
  },
  additionalNotes: {
    type: 'string',
    description:
      'Optional notes relevant to the event. Include only when notes disclosure is currently authorized in the webpage.',
    minLength: 1,
    maxLength: 2_000,
  },
} as const satisfies Record<string, JsonSchema>

/** Required draft property names, shared with the domain model. */
export const REQUIRED_DRAFT_PROPERTIES = REQUIRED_FIELD_NAMES

/** Schema for opaque review and receipt identifiers. */
export const OPAQUE_ID_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9._-]+$',
} as const satisfies JsonSchema

/** Complete disclosed snapshot: six required values plus authorized optionals. */
export const DISCLOSURE_SNAPSHOT_SCHEMA = {
  type: 'object',
  properties: INTAKE_FIELD_SCHEMAS,
  required: REQUIRED_DRAFT_PROPERTIES,
  additionalProperties: false,
} as const satisfies JsonSchema
