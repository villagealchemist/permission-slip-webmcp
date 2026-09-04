import type { ToolContract } from './defineContract'
import {
  draftIntakeContract,
  getDisclosureReceiptContract,
  getIntakeRequirementsContract,
  prepareSubmissionReviewContract,
  submitApprovedIntakeContract,
} from './tools'

/** Ordered list used to register this demo's five browser tools. */
export const WEBMCP_TOOL_CONTRACTS = Object.freeze([
  getIntakeRequirementsContract,
  draftIntakeContract,
  prepareSubmissionReviewContract,
  submitApprovedIntakeContract,
  getDisclosureReceiptContract,
] as const)

/** Exact names of the five public site tools. */
export type PermissionSlipToolName =
  (typeof WEBMCP_TOOL_CONTRACTS)[number]['name']

/** Ordered names of the five inquiry tools. */
export const PERMISSION_SLIP_TOOL_NAMES = Object.freeze(
  WEBMCP_TOOL_CONTRACTS.map((contract) => contract.name),
) as readonly PermissionSlipToolName[]

/** Typed lookup used by the in-page runtime bindings. */
export const WEBMCP_TOOL_CONTRACT_BY_NAME = Object.freeze(
  Object.fromEntries(
    WEBMCP_TOOL_CONTRACTS.map((contract) => [contract.name, contract]),
  ) as Record<PermissionSlipToolName, ToolContract<PermissionSlipToolName>>,
)
