import type {
  ContactPermissionDefinition,
  ContactPermissions,
  FieldDefinition,
  IntakeFieldName,
  NeverCollectedDefinition,
  OptionalDisclosureAuthorizations,
} from './types'

/** Required fields for one actionable Village Alchemist project inquiry. */
export const REQUIRED_FIELD_DEFINITIONS = [
  {
    name: 'contactName',
    label: 'Contact name',
    description: 'The person asking Village Alchemist to respond.',
    type: 'string',
    required: true,
  },
  {
    name: 'email',
    label: 'Email',
    description: 'A valid address for the requested project response.',
    type: 'string',
    required: true,
  },
  {
    name: 'inquiryType',
    label: 'Inquiry type',
    description: 'Prototype, website, product strategy, creative collaboration, or other.',
    type: 'string',
    required: true,
  },
  {
    name: 'desiredOutcome',
    label: 'Desired outcome',
    description: 'The concrete result the person wants the project to produce.',
    type: 'string',
    required: true,
  },
  {
    name: 'relevantBackground',
    label: 'Relevant background',
    description: 'Enough existing context to make a first response useful.',
    type: 'string',
    required: true,
  },
  {
    name: 'timeline',
    label: 'Timeline',
    description: 'The target window, deadline, or current timing constraint.',
    type: 'string',
    required: true,
  },
  {
    name: 'preferredResponseMethod',
    label: 'Preferred response method',
    description: 'Email, phone, or video call.',
    type: 'string',
    required: true,
  },
  {
    name: 'requestedNextStep',
    label: 'Requested next step',
    description: 'A discovery call, written response, or project review.',
    type: 'string',
    required: true,
  },
] satisfies FieldDefinition[]

/** Optional information remains behind separate visible disclosure controls. */
export const OPTIONAL_FIELD_DEFINITIONS = [
  {
    name: 'phone',
    label: 'Phone',
    description: 'A callback number, disclosed only with human authorization.',
    type: 'string',
    required: false,
  },
  {
    name: 'budgetOrConstraints',
    label: 'Budget or constraints',
    description: 'Planning boundaries the person intentionally chooses to share.',
    type: 'string',
    required: false,
  },
  {
    name: 'organization',
    label: 'Organization',
    description: 'An organization name, disclosed only when relevant and authorized.',
    type: 'string',
    required: false,
  },
  {
    name: 'additionalContext',
    label: 'Additional context',
    description: 'Extra project context intentionally included in this inquiry.',
    type: 'string',
    required: false,
  },
] satisfies FieldDefinition[]

export const FIELD_DEFINITIONS: Record<IntakeFieldName, FieldDefinition> =
  Object.fromEntries(
    [...REQUIRED_FIELD_DEFINITIONS, ...OPTIONAL_FIELD_DEFINITIONS].map(
      (definition) => [definition.name, definition],
    ),
  ) as Record<IntakeFieldName, FieldDefinition>

export const CONTACT_PERMISSION_DEFINITIONS = [
  {
    name: 'projectResponse',
    label: 'Reply about this project',
    description: 'Allows one response to the explicitly requested project next step.',
    requiredForSubmission: true,
  },
  {
    name: 'occasionalUpdates',
    label: 'Occasional Village Alchemist updates',
    description: 'Optional continued contact, kept separate from the project response.',
    requiredForSubmission: false,
  },
] satisfies ContactPermissionDefinition[]

export const NEVER_COLLECTED_DEFINITIONS = [
  {
    name: 'streetAddress',
    label: 'Street address',
    reason: 'A first project inquiry does not need a home address.',
  },
  {
    name: 'employmentHistory',
    label: 'Employment history',
    reason: 'A project inquiry needs relevant context, not employment history.',
  },
  {
    name: 'preciseLiveLocation',
    label: 'Precise live location',
    reason: 'Live location is not relevant to the requested response.',
  },
  {
    name: 'paymentInformation',
    label: 'Payment information',
    reason: 'This demonstration does not process payment.',
  },
  {
    name: 'unrelatedPrivateConversationHistory',
    label: 'Unrelated private conversation history',
    reason: 'Unrelated conversations remain outside this inquiry.',
  },
] satisfies NeverCollectedDefinition[]

export const EMPTY_OPTIONAL_AUTHORIZATIONS: OptionalDisclosureAuthorizations = {
  phone: false,
  budgetOrConstraints: false,
  organization: false,
  additionalContext: false,
}

export const EMPTY_CONTACT_PERMISSIONS: ContactPermissions = {
  projectResponse: false,
  occasionalUpdates: false,
}

export const DEFAULT_INQUIRY_PROVENANCE = {
  entrySource: 'direct',
  referralSource: null,
  campaign: null,
} as const

export const ACTIVITY_LIMIT = 100

export const INTAKE_REQUIREMENTS_INSTRUCTIONS =
  'Draft only the required fields and currently authorized optional fields. The person must verify assistant suggestions, confirm the requested next step, grant project-response permission, and approve the exact frozen review before submission.'
