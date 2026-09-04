import { describe, expect, it } from 'vitest'
import { validateProposeContractRevision } from './validation'

function validateOutputSchema(outputSchema: unknown) {
  return validateProposeContractRevision({
    toolName: 'list_tool_contracts',
    baseRevision: 1,
    rationale: 'Exercise the bounded output schema validator.',
    changes: { outputSchema },
  })
}

function issuePaths(result: ReturnType<typeof validateProposeContractRevision>) {
  return result.ok ? [] : result.issues.map((issue) => issue.path)
}

describe('WebMCP contract schema boundary', () => {
  it.each([
    [
      'a non-array enum',
      {
        type: 'object',
        properties: { value: { type: 'string', enum: 'not-an-array' } },
      },
      'changes.outputSchema.properties.value.enum',
    ],
    [
      'a non-numeric minLength',
      {
        type: 'object',
        properties: { value: { type: 'string', minLength: 'one' } },
      },
      'changes.outputSchema.properties.value.minLength',
    ],
    [
      'a non-boolean uniqueItems',
      {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: 'yes',
      },
      'changes.outputSchema.uniqueItems',
    ],
    [
      'an unsupported keyword',
      { type: 'object', unevaluatedProperties: false },
      'changes.outputSchema.unevaluatedProperties',
    ],
    [
      'an agent-authored regular expression',
      {
        type: 'string',
        pattern: '^(a+)+$',
      },
      'changes.outputSchema.pattern',
    ],
  ])('rejects %s recursively', (_label, schema, expectedPath) => {
    const result = validateOutputSchema(schema)

    expect(result.ok).toBe(false)
    expect(issuePaths(result)).toContain(expectedPath)
  })

  it('rejects inputSchema as a non-patchable fixed-executor field', () => {
    const result = validateProposeContractRevision({
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
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'changes.inputSchema',
          code: 'unknown_property',
        }),
      ]),
    )
  })

  it('accepts the supported recursive output-schema subset', () => {
    const result = validateOutputSchema({
      type: 'object',
      description: 'One bounded documented payload.',
      properties: {
        values: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string', minLength: 1, maxLength: 40 },
              { type: 'integer', minimum: 0, maximum: 10 },
            ],
          },
          minItems: 0,
          maxItems: 4,
          uniqueItems: true,
        },
      },
      required: ['values'],
      additionalProperties: false,
    })

    expect(result.ok).toBe(true)
  })
})
