export const emptyObjectSchema = {
  type: 'object',
  description: 'No input parameters are accepted.',
  properties: {},
  additionalProperties: false,
} as const

export const draftIntakeSchema = {
  type: 'object',
  description:
    'A complete proposed workshop intake. Optional fields are accepted only when the person has enabled their matching disclosure controls in the webpage.',
  properties: {
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
  },
  required: [
    'contactName',
    'email',
    'eventType',
    'preferredDate',
    'estimatedAttendeeCount',
    'eventGoal',
  ],
  additionalProperties: false,
} as const

const opaqueIdSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9._-]+$',
} as const

export const submitApprovedIntakeSchema = {
  type: 'object',
  description:
    'Identifies the exact frozen review that the person approved in the webpage.',
  properties: {
    reviewId: {
      ...opaqueIdSchema,
      description:
        'The exact review identifier returned by prepare_submission_review and approved by the person in the webpage.',
    },
  },
  required: ['reviewId'],
  additionalProperties: false,
} as const

export const getDisclosureReceiptSchema = {
  type: 'object',
  description:
    'Optionally identifies one local receipt; omit receiptId to request the latest receipt.',
  properties: {
    receiptId: {
      ...opaqueIdSchema,
      description:
        'Optional receipt identifier. Omit it to retrieve the latest receipt.',
    },
  },
  additionalProperties: false,
} as const
