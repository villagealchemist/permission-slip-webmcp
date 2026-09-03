import {
  NEVER_COLLECTED_DEFINITIONS,
  OPTIONAL_FIELD_DEFINITIONS,
  REQUIRED_FIELD_DEFINITIONS,
  type WorkflowStatus,
} from '../domain'

/** Stable workflow ordering used by contracts and the Explorer. */
export const WORKFLOW_STATES = [
  'empty',
  'draft',
  'review_pending',
  'approved',
  'submitted',
] as const satisfies readonly WorkflowStatus[]

/** Capabilities deliberately absent from the WebMCP registry. */
export const HUMAN_ONLY_CAPABILITIES = [
  {
    name: 'authorize_optional_disclosure',
    title: 'Authorize optional disclosure',
    reason: 'Only visible per-field toggles can expand the disclosure boundary.',
  },
  {
    name: 'approve_exact_review',
    title: 'Approve an exact review',
    reason: 'Only the visible approval control can bind consent to a review, digest, and revision.',
  },
  {
    name: 'return_to_editing',
    title: 'Return to editing',
    reason: 'The human decides when to abandon a frozen review.',
  },
  {
    name: 'reset_local_demo',
    title: 'Reset the local demo',
    reason: 'Only the human can delete the browser-local workflow state.',
  },
] as const

/** Invariants enforced below both the human UI and WebMCP adapter. */
export const WORKFLOW_INVARIANTS = [
  'Approval is valid only for the current reviewId, digest, and revision.',
  'Any disclosure-affecting edit invalidates the current review and approval.',
  'Unauthorized optional input rejects the complete agent draft atomically.',
  'Submission revalidates the frozen snapshot before creating a local receipt.',
  'Submitted is terminal until the human resets the local demo.',
] as const

/** Public domain concepts that support the tool and consent contracts. */
export const DOMAIN_MODEL = [
  {
    name: 'PermissionSlipState',
    role: 'The versioned aggregate shared by the human UI and every tool invocation.',
  },
  {
    name: 'IntakeDraft',
    role: 'An editable, potentially incomplete set of required and optional values.',
  },
  {
    name: 'DisclosureSnapshot',
    role: 'Six normalized required values plus only present, human-authorized optional values.',
  },
  {
    name: 'FrozenReview',
    role: 'An exact snapshot bound to a review ID, revision, creation time, and digest.',
  },
  {
    name: 'HumanApproval',
    role: 'A human-only binding to the current review ID, revision, and digest.',
  },
  {
    name: 'DisclosureReceipt',
    role: 'The local record of what the simulated submission disclosed and withheld.',
  },
  {
    name: 'OperationResult<T>',
    role: 'Structured success or failure paired with the authoritative next state.',
  },
] as const

/** Public disclosure taxonomy used in generated and human documentation. */
export const DISCLOSURE_MODEL = {
  required: REQUIRED_FIELD_DEFINITIONS,
  optional: OPTIONAL_FIELD_DEFINITIONS,
  neverCollected: NEVER_COLLECTED_DEFINITIONS,
} as const
