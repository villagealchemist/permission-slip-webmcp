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
    name: 'verify_assistant_suggestions',
    title: 'Verify assistant suggestions',
    reason:
      'Only the visible human UI can mark assistant-suggested values as verified.',
  },
  {
    name: 'confirm_requested_next_step',
    title: 'Confirm the requested next step',
    reason:
      'Only the person can confirm that the selected business next step expresses their intent.',
  },
  {
    name: 'authorize_optional_disclosure',
    title: 'Authorize optional disclosure',
    reason: 'Only visible per-field toggles can expand the disclosure boundary.',
  },
  {
    name: 'set_contact_permission',
    title: 'Set contact permission',
    reason:
      'Only visible human controls can permit a project response or optional updates.',
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
  'Any pre-submission edit or permission change invalidates review and approval.',
  'Unauthorized optional input rejects the complete agent draft atomically.',
  'Assistant suggestions, next-step intent, and project-response permission require visible human action.',
  'Submission revalidates the frozen payload before creating a simulated local receipt.',
  'Rejected submit attempts create PII-free local failure receipts.',
  'Submitted is terminal until the human resets the local demo.',
] as const

/** Public domain concepts that support the tool and consent contracts. */
export const DOMAIN_MODEL = [
  {
    name: 'PermissionSlipState',
    role: 'The versioned aggregate shared by the human UI and every tool invocation.',
  },
  {
    name: 'InquiryDraft',
    role: 'An editable, potentially incomplete Village Alchemist inquiry.',
  },
  {
    name: 'InquirySnapshot',
    role: 'Eight normalized required values plus only present, human-authorized optional values.',
  },
  {
    name: 'FrozenReview',
    role: 'An exact inquiry, permission, intent, and provenance payload bound to a review ID, revision, and digest.',
  },
  {
    name: 'HumanApproval',
    role: 'A human-only binding to the current review ID, revision, and digest.',
  },
  {
    name: 'SubmissionReceipt',
    role: 'A successful qualified-inquiry receipt or PII-free rejected-attempt receipt stored locally.',
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
