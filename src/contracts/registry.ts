import type { ToolContract } from './defineContract'
import {
  draftIntakeContract,
  getDisclosureReceiptContract,
  getIntakeRequirementsContract,
  prepareSubmissionReviewContract,
  submitApprovedIntakeContract,
} from './tools'

/** Ordered canonical registry used for browser registration and documentation. */
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

/** Ordered tool names derived from the canonical registry. */
export const PERMISSION_SLIP_TOOL_NAMES = Object.freeze(
  WEBMCP_TOOL_CONTRACTS.map((contract) => contract.name),
) as readonly PermissionSlipToolName[]

/** Constant-time contract lookup for typed runtime bindings and documentation. */
export const WEBMCP_TOOL_CONTRACT_BY_NAME = Object.freeze(
  Object.fromEntries(
    WEBMCP_TOOL_CONTRACTS.map((contract) => [contract.name, contract]),
  ) as Record<PermissionSlipToolName, ToolContract<PermissionSlipToolName>>,
)
