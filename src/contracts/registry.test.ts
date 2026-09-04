import { describe, expect, it } from 'vitest'
import { auditToolContracts } from './audit'
import {
  buildArtifactBundle,
  buildContractManifest,
  buildMarkdownReference,
  buildOpenApiProjection,
  buildRegistrationMetadata,
  stableStringify,
} from './projections'
import {
  SECOND_SURFACE_TOOL_CONTRACT_BY_NAME,
  SECOND_SURFACE_TOOL_CONTRACTS,
  SECOND_SURFACE_TOOL_NAMES,
} from './registry'
import {
  applyContractRevisionPatch,
  cloneContracts,
  type ContractRevisionPatch,
  type WorkbenchToolContract,
} from './workbenchContract'

const CLEAR_LIST_DESCRIPTION =
  'Return the five accepted workbench contracts with current revision, annotation, side-effect, and deterministic finding summaries.'

function listDescriptionPatch(): ContractRevisionPatch {
  return {
    toolName: 'list_tool_contracts',
    baseRevision: 1,
    rationale: 'Replace the vague description with observable output details.',
    changes: { description: CLEAR_LIST_DESCRIPTION },
  }
}

function requireAppliedPatch(patch = listDescriptionPatch()) {
  const result = applyContractRevisionPatch(
    SECOND_SURFACE_TOOL_CONTRACTS,
    patch,
  )
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result.contracts
}

describe('canonical Second Surface contract registry', () => {
  it('defines exactly five unique, fixed, deeply frozen tool contracts', () => {
    expect(SECOND_SURFACE_TOOL_NAMES).toEqual([
      'list_tool_contracts',
      'get_tool_contract',
      'audit_tool_contracts',
      'propose_contract_revision',
      'preview_contract_bundle',
    ])
    expect(new Set(SECOND_SURFACE_TOOL_NAMES).size).toBe(5)
    expect(SECOND_SURFACE_TOOL_CONTRACTS).toHaveLength(5)
    expect(Object.isFrozen(SECOND_SURFACE_TOOL_CONTRACTS)).toBe(true)

    for (const contract of SECOND_SURFACE_TOOL_CONTRACTS) {
      expect(contract.revision).toBe(1)
      expect(contract.inputSchema.type).toBe('object')
      expect(contract.inputSchema.additionalProperties).toBe(false)
      expect(Object.isFrozen(contract)).toBe(true)
      expect(Object.isFrozen(contract.inputSchema)).toBe(true)
      expect(SECOND_SURFACE_TOOL_CONTRACT_BY_NAME[contract.name]).toBe(contract)
    }
  })

  it('uses toolName consistently for exact-contract lookup', () => {
    const contract = SECOND_SURFACE_TOOL_CONTRACT_BY_NAME.get_tool_contract
    expect(contract.inputSchema.required).toEqual(['toolName'])
    expect(contract.inputSchema.properties).toHaveProperty('toolName')
    expect(
      (contract.inputSchema.properties as Record<string, { enum?: unknown }>)
        .toolName?.enum,
    ).toEqual(SECOND_SURFACE_TOOL_NAMES)
    expect(contract.examples[0]?.input).toEqual({
      toolName: 'list_tool_contracts',
    })
  })

  it('returns the same six stable, evidence-supported seed findings', () => {
    const first = auditToolContracts(SECOND_SURFACE_TOOL_CONTRACTS)
    const second = auditToolContracts(SECOND_SURFACE_TOOL_CONTRACTS)

    expect(second).toEqual(first)
    expect(first.findingCount).toBe(6)
    expect(first.errorCount).toBe(2)
    expect(first.warningCount).toBe(4)
    expect(first.passed).toBe(false)
    expect(
      first.findings.map(({ toolName, code, field }) => ({
        toolName,
        code,
        field,
      })),
    ).toEqual([
      {
        toolName: 'get_tool_contract',
        code: 'MISSING_PARAMETER_DESCRIPTION',
        field: 'inputSchema.properties.toolName.description',
      },
      {
        toolName: 'list_tool_contracts',
        code: 'VAGUE_DESCRIPTION',
        field: 'description',
      },
      {
        toolName: 'preview_contract_bundle',
        code: 'UNTRUSTED_OUTPUT_ANNOTATION_MISSING',
        field: 'annotations.untrustedContentHint',
      },
      {
        toolName: 'propose_contract_revision',
        code: 'READ_ONLY_SIDE_EFFECT_CONFLICT',
        field: 'annotations.readOnlyHint',
      },
      {
        toolName: 'propose_contract_revision',
        code: 'MISSING_ERROR_RECOVERY',
        field: 'errors[0].recovery',
      },
      {
        toolName: 'propose_contract_revision',
        code: 'INVALID_EXAMPLE',
        field: 'examples[0].input',
      },
    ])
  })

  it('detects an open input schema without keeping any live input open', () => {
    const auditContract = SECOND_SURFACE_TOOL_CONTRACTS.find(
      (contract) => contract.name === 'audit_tool_contracts',
    )
    expect(auditContract).toBeDefined()
    if (!auditContract) return

    const fixture = cloneContracts([
      {
        ...auditContract,
        inputSchema: { type: 'object', properties: {} },
      },
    ] satisfies readonly WorkbenchToolContract[])
    expect(
      auditToolContracts(fixture).findings.some(
        (finding) => finding.code === 'OPEN_INPUT_SCHEMA',
      ),
    ).toBe(true)
  })

  it('clones accepted snapshots without sharing mutable structure', () => {
    const cloned = cloneContracts(SECOND_SURFACE_TOOL_CONTRACTS)
    expect(cloned).toEqual(SECOND_SURFACE_TOOL_CONTRACTS)
    expect(cloned).not.toBe(SECOND_SURFACE_TOOL_CONTRACTS)
    expect(cloned[0]).not.toBe(SECOND_SURFACE_TOOL_CONTRACTS[0])
    expect(cloned[0]?.inputSchema).not.toBe(
      SECOND_SURFACE_TOOL_CONTRACTS[0]?.inputSchema,
    )
    expect(Object.isFrozen(cloned[0]?.examples[0]?.input)).toBe(true)
  })

  it('rejects stale, schema-invalid, and name-changing patches atomically', () => {
    const before = stableStringify(SECOND_SURFACE_TOOL_CONTRACTS)
    const stale = applyContractRevisionPatch(
      SECOND_SURFACE_TOOL_CONTRACTS,
      { ...listDescriptionPatch(), baseRevision: 2 },
    )
    const invalidSchema = applyContractRevisionPatch(
      SECOND_SURFACE_TOOL_CONTRACTS,
      {
        ...listDescriptionPatch(),
        changes: {
          outputSchema: { type: 'not-a-json-schema-type' },
        },
      },
    )
    const renamed = applyContractRevisionPatch(
      SECOND_SURFACE_TOOL_CONTRACTS,
      {
        ...listDescriptionPatch(),
        changes: {
          name: 'renamed_tool',
        },
      } as unknown as ContractRevisionPatch,
    )

    expect(stale).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } })
    expect(invalidSchema).toMatchObject({
      ok: false,
      error: { code: 'INVALID_SCHEMA' },
    })
    expect(renamed).toMatchObject({ ok: false, error: { code: 'INVALID_PATCH' } })
    expect(stableStringify(SECOND_SURFACE_TOOL_CONTRACTS)).toBe(before)
  })

  it('applies one fixed-name revision and updates every projection', () => {
    const revised = requireAppliedPatch()
    const revisedList = revised[0]
    const registration = buildRegistrationMetadata(revised)
    const manifest = buildContractManifest(revised)
    const markdown = buildMarkdownReference(revised)
    const openApi = buildOpenApiProjection(revised)
    const bundle = buildArtifactBundle(revised)

    expect(SECOND_SURFACE_TOOL_CONTRACTS[0]?.revision).toBe(1)
    expect(revisedList).toMatchObject({
      name: 'list_tool_contracts',
      revision: 2,
      description: CLEAR_LIST_DESCRIPTION,
    })
    expect(revised.map((contract) => contract.name)).toEqual(
      SECOND_SURFACE_TOOL_NAMES,
    )
    expect(auditToolContracts(revised).findingCount).toBe(5)
    expect(registration[0]?.description).toBe(CLEAR_LIST_DESCRIPTION)
    expect(manifest).toMatchObject({
      revisions: { list_tool_contracts: 2 },
    })
    expect(markdown).toContain('Revision 2')
    expect(markdown).toContain(CLEAR_LIST_DESCRIPTION)
    expect(openApi).toMatchObject({
      servers: [],
      'x-documentation-projection': true,
      'x-network-endpoint': false,
      paths: {
        '/__webmcp_projection__/list_tool_contracts': {
          post: {
            description: CLEAR_LIST_DESCRIPTION,
            'x-webmcp-revision': 2,
            'x-documentation-projection': true,
            'x-network-endpoint': false,
          },
        },
      },
    })
    expect(bundle).toEqual(buildArtifactBundle(revised))
    expect(bundle.registrationJson).toBe(stableStringify(registration))
    expect(bundle.contractJson).toBe(stableStringify(manifest))
    expect(bundle.openApiJson).toBe(stableStringify(openApi))
  })

  it('reports optional observed-registration and artifact disagreements', () => {
    const bundle = buildArtifactBundle(SECOND_SURFACE_TOOL_CONTRACTS)
    const result = auditToolContracts(SECOND_SURFACE_TOOL_CONTRACTS, {
      registrationMetadata: [],
      artifactBundle: {
        markdown: `${bundle.markdown}\nDrifted`,
      },
    })

    expect(
      result.findings.filter(({ code }) => code.includes('DISAGREEMENT')),
    ).toEqual([
      expect.objectContaining({ code: 'ARTIFACT_DISAGREEMENT' }),
      expect.objectContaining({ code: 'REGISTRATION_DISAGREEMENT' }),
    ])
  })
})
