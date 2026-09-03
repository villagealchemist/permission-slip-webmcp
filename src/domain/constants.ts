import type {
  FieldDefinition,
  IntakeFieldName,
  NeverCollectedDefinition,
  OptionalDisclosureAuthorizations,
} from './types'

export const REQUIRED_FIELD_DEFINITIONS = [
  {
    name: 'contactName',
    label: 'Contact name',
    description: 'The name of the person responsible for the inquiry.',
    type: 'string',
    required: true,
  },
  {
    name: 'email',
    label: 'Email',
    description: 'A valid contact email address.',
    type: 'string',
    required: true,
  },
  {
    name: 'eventType',
    label: 'Event type',
    description: 'A concise description of the proposed workshop or event.',
    type: 'string',
    required: true,
  },
  {
    name: 'preferredDate',
    label: 'Preferred date',
    description: 'The preferred event date in YYYY-MM-DD format.',
    type: 'string',
    required: true,
  },
  {
    name: 'estimatedAttendeeCount',
    label: 'Estimated attendee count',
    description: 'A whole-number estimate from 1 to 1,000 attendees.',
    type: 'integer',
    required: true,
  },
  {
    name: 'eventGoal',
    label: 'Event goal',
    description: 'What the organizer hopes the workshop will accomplish.',
    type: 'string',
    required: true,
  },
] satisfies FieldDefinition<
  | 'contactName'
  | 'email'
  | 'eventType'
  | 'preferredDate'
  | 'estimatedAttendeeCount'
  | 'eventGoal'
>[]

export const OPTIONAL_FIELD_DEFINITIONS = [
  {
    name: 'phone',
    label: 'Phone',
    description: 'A contact phone number, disclosed only with human authorization.',
    type: 'string',
    required: false,
  },
  {
    name: 'budgetRange',
    label: 'Budget range',
    description: 'An approximate budget range, disclosed only with human authorization.',
    type: 'string',
    required: false,
  },
  {
    name: 'socialHandle',
    label: 'Social handle',
    description: 'A social account handle, disclosed only with human authorization.',
    type: 'string',
    required: false,
  },
  {
    name: 'additionalNotes',
    label: 'Additional notes',
    description: 'Extra context, disclosed only with human authorization.',
    type: 'string',
    required: false,
  },
] satisfies FieldDefinition<
  'phone' | 'budgetRange' | 'socialHandle' | 'additionalNotes'
>[]

export const FIELD_DEFINITIONS: Record<IntakeFieldName, FieldDefinition> =
  Object.fromEntries(
    [...REQUIRED_FIELD_DEFINITIONS, ...OPTIONAL_FIELD_DEFINITIONS].map(
      (definition) => [definition.name, definition],
    ),
  ) as Record<IntakeFieldName, FieldDefinition>

export const NEVER_COLLECTED_DEFINITIONS = [
  {
    name: 'streetAddress',
    label: 'Street address',
    reason: 'A workshop inquiry does not need a home address.',
  },
  {
    name: 'employer',
    label: 'Employer',
    reason: 'Employment details are unrelated to this inquiry.',
  },
  {
    name: 'preciseLiveLocation',
    label: 'Precise live location',
    reason: 'Live location is never relevant to preparing the request.',
  },
  {
    name: 'paymentInformation',
    label: 'Payment information',
    reason: 'This local demonstration does not process payment.',
  },
  {
    name: 'unrelatedPrivateConversationHistory',
    label: 'Unrelated private conversation history',
    reason: 'Private conversation history is outside the intake scope.',
  },
] satisfies NeverCollectedDefinition[]

export const EMPTY_OPTIONAL_AUTHORIZATIONS: OptionalDisclosureAuthorizations = {
  phone: false,
  budgetRange: false,
  socialHandle: false,
  additionalNotes: false,
}

export const ACTIVITY_LIMIT = 100

export const INTAKE_REQUIREMENTS_INSTRUCTIONS =
  'Prepare the intake using only required fields and currently authorized optional fields. Submission remains blocked until the human approves the exact review snapshot in the webpage.'
