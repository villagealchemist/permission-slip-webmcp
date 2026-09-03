import { describe, expect, it } from 'vitest'
import { createPermissionSlipTools } from '../webmcp/tools'
import type { PermissionSlipWebMcpAdapter } from '../webmcp/types'
import {
  validateDraftIntake,
  validateEmptyObject,
  validateGetDisclosureReceipt,
  validateSubmitApprovedIntake,
} from '../webmcp/validation'
import { CONTRACT_ERRORS } from './errors'
import {
  HUMAN_ONLY_CAPABILITIES,
  PERMISSION_SLIP_TOOL_NAMES,
  WEBMCP_TOOL_CONTRACTS,
} from './index'

const validators = {
  get_intake_requirements: validateEmptyObject,
  draft_intake: validateDraftIntake,
  prepare_submission_review: validateEmptyObject,
  submit_approved_intake: validateSubmitApprovedIntake,
  get_disclosure_receipt: validateGetDisclosureReceipt,
} as const

describe('canonical WebMCP contract registry', () => {
  it('defines exactly five unique ordered tool names', () => {
    expect(PERMISSION_SLIP_TOOL_NAMES).toEqual([
      'get_intake_requirements',
      'draft_intake',
      'prepare_submission_review',
      'submit_approved_intake',
      'get_disclosure_receipt',
    ])
    expect(new Set(PERMISSION_SLIP_TOOL_NAMES).size).toBe(5)
    expect(WEBMCP_TOOL_CONTRACTS).toHaveLength(5)
    for (const capability of HUMAN_ONLY_CAPABILITIES) {
      expect(PERMISSION_SLIP_TOOL_NAMES).not.toContain(capability.name)
    }
  })

  it('projects registration metadata and canonical schema objects unchanged', () => {
    const tools = createPermissionSlipTools(
      () => ({}) as PermissionSlipWebMcpAdapter,
    )

    for (const [index, contract] of WEBMCP_TOOL_CONTRACTS.entries()) {
      const tool = tools[index]
      expect(tool).toMatchObject({
        name: contract.name,
        title: contract.title,
        description: contract.description,
      })
      expect(tool.inputSchema).toBe(contract.inputSchema)
      expect(tool.annotations).toEqual(contract.annotations)
      expect(Boolean(tool.annotations?.readOnlyHint)).toBe(contract.readOnly)
      expect(contract.privacy.networkTransmission).toBe(false)
    }
  })

  it('marks only local finalization as requiring exact human approval', () => {
    expect(
      WEBMCP_TOOL_CONTRACTS.filter(
        (contract) => contract.humanApprovalRequired,
      ).map((contract) => contract.name),
    ).toEqual(['submit_approved_intake'])
  })

  it('keeps every input closed and documents success and failure outputs', () => {
    for (const contract of WEBMCP_TOOL_CONTRACTS) {
      expect(contract.inputSchema.additionalProperties).toBe(false)
      expect(contract.outputSchema).toHaveProperty('oneOf')
      expect(contract.examples.length).toBeGreaterThan(0)
    }
  })

  it('keeps fictional examples within the executable boundary validators', () => {
    for (const contract of WEBMCP_TOOL_CONTRACTS) {
      for (const example of contract.examples) {
        expect(
          validators[contract.name](example.input),
          `${contract.name}: ${example.title}`,
        ).toMatchObject({ ok: true })
        expect(() => JSON.stringify(example.result)).not.toThrow()
      }
    }
  })

  it('references only errors in the canonical taxonomy', () => {
    for (const contract of WEBMCP_TOOL_CONTRACTS) {
      expect(new Set(contract.errors).size).toBe(contract.errors.length)
      for (const errorCode of contract.errors) {
        expect(CONTRACT_ERRORS).toHaveProperty(errorCode)
      }
    }
  })
})
