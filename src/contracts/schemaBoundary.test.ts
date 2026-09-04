import { describe, expect, it } from 'vitest'
import { stableStringify } from './projections'
import { SECOND_SURFACE_TOOL_CONTRACTS } from './registry'
import {
  applyContractRevisionPatch,
  type ContractRevisionPatch,
  type WorkbenchJsonSchema,
} from './workbenchContract'

const INVALID_OUTPUT_SCHEMAS: readonly [string, WorkbenchJsonSchema][] = [
  [
    'enum string',
    {
      type: 'object',
      properties: { value: { type: 'string', enum: 'not-an-array' } },
    },
  ],
  [
    'minLength string',
    {
      type: 'object',
      properties: { value: { type: 'string', minLength: 'one' } },
    },
  ],
  [
    'uniqueItems string',
    { type: 'array', items: { type: 'string' }, uniqueItems: 'yes' },
  ],
  ['unsupported keyword', { type: 'object', dependentRequired: {} }],
  ['agent-authored pattern', { type: 'string', pattern: '^(a+)+$' }],
]

function outputSchemaPatch(outputSchema: WorkbenchJsonSchema) {
  return {
    toolName: 'list_tool_contracts',
    baseRevision: 1,
    rationale: 'Exercise strict domain schema validation.',
    changes: { outputSchema },
  } satisfies ContractRevisionPatch
}

describe('domain contract schema boundary', () => {
  it.each(INVALID_OUTPUT_SCHEMAS)(
    'rejects %s without changing the accepted registry',
    (_label, schema) => {
      const before = stableStringify(SECOND_SURFACE_TOOL_CONTRACTS)
      const result = applyContractRevisionPatch(
        SECOND_SURFACE_TOOL_CONTRACTS,
        outputSchemaPatch(schema),
      )

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: 'INVALID_SCHEMA',
          fields: ['changes.outputSchema'],
        },
      })
      expect(stableStringify(SECOND_SURFACE_TOOL_CONTRACTS)).toBe(before)
    },
  )

  it('rejects inputSchema as an unknown non-patchable field atomically', () => {
    const before = stableStringify(SECOND_SURFACE_TOOL_CONTRACTS)
    const patch = {
      toolName: 'list_tool_contracts',
      baseRevision: 1,
      rationale: 'Attempt to drift the fixed executor input.',
      changes: {
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
      },
    } as unknown as ContractRevisionPatch

    const result = applyContractRevisionPatch(
      SECOND_SURFACE_TOOL_CONTRACTS,
      patch,
    )

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PATCH', fields: ['inputSchema'] },
    })
    expect(stableStringify(SECOND_SURFACE_TOOL_CONTRACTS)).toBe(before)
  })

  it('accepts a supported recursive output schema', () => {
    const result = applyContractRevisionPatch(
      SECOND_SURFACE_TOOL_CONTRACTS,
      outputSchemaPatch({
        type: 'object',
        properties: {
          values: {
            type: 'array',
            items: {
              anyOf: [
                { type: 'string', enum: ['alpha', 'beta'] },
                { const: null },
              ],
            },
            minItems: 0,
            maxItems: 4,
            uniqueItems: true,
          },
        },
        required: ['values'],
        additionalProperties: false,
      }),
    )

    expect(result.ok).toBe(true)
  })

  it('keeps trusted fixed input patterns valid for metadata-only revisions', () => {
    const result = applyContractRevisionPatch(
      SECOND_SURFACE_TOOL_CONTRACTS,
      {
        toolName: 'get_tool_contract',
        baseRevision: 1,
        rationale: 'Clarify existing fixed lookup behavior.',
        changes: {
          description:
            'Return one accepted tool contract by its fixed executor-bound name and show its deterministic contract-data findings.',
        },
      },
    )

    expect(result.ok).toBe(true)
  })
})
