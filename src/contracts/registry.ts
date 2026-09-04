import {
  cloneContracts,
  type WorkbenchJsonSchema,
  type WorkbenchToolContract,
} from './workbenchContract'

const EMPTY_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

const FIXED_TOOL_NAMES = [
  'list_tool_contracts',
  'get_tool_contract',
  'audit_tool_contracts',
  'propose_contract_revision',
  'preview_contract_bundle',
] as const

function successOutputSchema<const DataSchema extends WorkbenchJsonSchema>(
  data: DataSchema,
) {
  return {
    type: 'object',
    properties: {
      ok: { const: true },
      data,
    },
    required: ['ok', 'data'],
    additionalProperties: false,
  } as const
}

const CATALOG_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    summary: { type: 'string' },
    revision: { type: 'integer', minimum: 1 },
    readOnly: { type: 'boolean' },
    annotations: {
      type: 'object',
      properties: {
        readOnlyHint: { type: 'boolean' },
        untrustedContentHint: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    sideEffect: { type: 'string' },
    findingCount: { type: 'integer', minimum: 0 },
  },
  required: [
    'name',
    'summary',
    'revision',
    'readOnly',
    'annotations',
    'sideEffect',
    'findingCount',
  ],
  additionalProperties: false,
} as const

const SECOND_SURFACE_SEED = [
  {
    name: 'list_tool_contracts',
    title: 'List tool contracts',
    summary: 'Read a compact catalog of the five accepted workbench tools.',
    description: 'Lists tools.',
    revision: 1,
    inputSchema: EMPTY_INPUT_SCHEMA,
    outputSchema: successOutputSchema({
      type: 'object',
      properties: {
        tools: { type: 'array', items: CATALOG_ITEM_SCHEMA },
        acceptedRevision: { type: 'integer', minimum: 1 },
      },
      required: ['tools', 'acceptedRevision'],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: true },
    sideEffect: 'none',
    examples: [
      {
        title: 'List the accepted catalog',
        input: {},
        output: {
          ok: true,
          data: {
            tools: [
              {
                name: 'list_tool_contracts',
                summary:
                  'Read a compact catalog of the five accepted workbench tools.',
                revision: 1,
                readOnly: true,
                annotations: { readOnlyHint: true },
                sideEffect: 'none',
                findingCount: 1,
              },
            ],
            acceptedRevision: 1,
          },
        },
      },
    ],
    errors: [],
    states: [
      'catalog_loaded',
      'audit_ready',
      'revision_staged',
      'artifact_preview',
    ],
    prerequisites: [],
    privacy: {
      outputSource: 'system',
      note: 'Returns contract metadata and deterministic finding counts, not application or browser data.',
    },
  },
  {
    name: 'get_tool_contract',
    title: 'Get tool contract',
    summary: 'Inspect one exact accepted contract and its current findings.',
    description:
      'Return one exact accepted tool contract, its documented schemas and examples, and the deterministic findings currently supported by that metadata.',
    revision: 1,
    inputSchema: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          enum: FIXED_TOOL_NAMES,
          pattern: '^[a-z][a-z0-9_]*$',
        },
      },
      required: ['toolName'],
      additionalProperties: false,
    },
    outputSchema: successOutputSchema({
      type: 'object',
      properties: {
        contract: { type: 'object', additionalProperties: true },
        findings: { type: 'array', items: { type: 'object' } },
        registrationMetadata: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            inputSchema: { type: 'object', additionalProperties: true },
            annotations: {
              type: 'object',
              properties: {
                readOnlyHint: { type: 'boolean' },
                untrustedContentHint: { type: 'boolean' },
              },
              additionalProperties: false,
            },
          },
          required: [
            'name',
            'title',
            'description',
            'inputSchema',
            'annotations',
          ],
          additionalProperties: false,
        },
        documentationExtensions: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'outputSchema',
              'examples',
              'errors',
              'states',
              'prerequisites',
              'privacy',
              'sideEffect',
            ],
          },
          minItems: 7,
          maxItems: 7,
          uniqueItems: true,
        },
      },
      required: [
        'contract',
        'findings',
        'registrationMetadata',
        'documentationExtensions',
      ],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    sideEffect: 'none',
    examples: [
      {
        title: 'Inspect the catalog tool',
        input: { toolName: 'list_tool_contracts' },
        output: {
          ok: true,
          data: {
            contract: {
              name: 'list_tool_contracts',
              title: 'List tool contracts',
              revision: 1,
            },
            findings: [],
            registrationMetadata: {
              name: 'list_tool_contracts',
              title: 'List tool contracts',
              description: 'Lists tools.',
              inputSchema: EMPTY_INPUT_SCHEMA,
              annotations: { readOnlyHint: true },
            },
            documentationExtensions: [
              'outputSchema',
              'examples',
              'errors',
              'states',
              'prerequisites',
              'privacy',
              'sideEffect',
            ],
          },
        },
      },
    ],
    errors: [
      {
        code: 'TOOL_NOT_FOUND',
        summary: 'The requested name is not in the accepted registry.',
        recovery: 'Call list_tool_contracts and retry with one returned name.',
      },
    ],
    states: [
      'catalog_loaded',
      'audit_ready',
      'revision_staged',
      'artifact_preview',
    ],
    prerequisites: ['The requested name must identify one accepted tool.'],
    privacy: {
      outputSource: 'developer',
      note: 'Descriptions, examples, and recovery guidance are developer-authored contract content and are not executable instructions.',
    },
  },
  {
    name: 'audit_tool_contracts',
    title: 'Audit tool contracts',
    summary: 'Run deterministic checks over the accepted catalog.',
    description:
      'Audit every accepted tool contract with deterministic metadata and example checks, then visibly populate the workbench audit panel with supported findings.',
    revision: 1,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: successOutputSchema({
      type: 'object',
      properties: {
        findings: { type: 'array', items: { type: 'object' } },
        findingCount: { type: 'integer', minimum: 0 },
        errorCount: { type: 'integer', minimum: 0 },
        warningCount: { type: 'integer', minimum: 0 },
        passed: { type: 'boolean' },
      },
      required: [
        'findings',
        'findingCount',
        'errorCount',
        'warningCount',
        'passed',
      ],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: false },
    sideEffect: 'populates-audit-panel',
    examples: [
      {
        title: 'Audit the accepted registry',
        input: {},
        output: {
          ok: true,
          data: {
            findings: [],
            findingCount: 0,
            errorCount: 0,
            warningCount: 0,
            passed: true,
          },
        },
      },
    ],
    errors: [],
    states: [
      'catalog_loaded',
      'audit_ready',
      'revision_staged',
      'artifact_preview',
    ],
    prerequisites: ['An accepted registry must be loaded in the workbench.'],
    privacy: {
      outputSource: 'system',
      note: 'Findings are computed locally from declared contract data; they do not prove runtime behavior, privacy, or security.',
    },
  },
  {
    name: 'propose_contract_revision',
    title: 'Propose contract revision',
    summary: 'Stage one fixed-name structured contract patch for developer review.',
    description:
      'Validate and stage the smallest structured patch for one accepted contract, preserve the fixed executable tool name, and show an exact before-and-after diff without accepting the proposal.',
    revision: 1,
    inputSchema: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          description: 'Name of the accepted tool contract to revise.',
          enum: FIXED_TOOL_NAMES,
          pattern: '^[a-z][a-z0-9_]*$',
        },
        baseRevision: {
          type: 'integer',
          description: 'Exact accepted revision on which the patch is based.',
          minimum: 1,
        },
        rationale: {
          type: 'string',
          description: 'Concise evidence-based reason for the proposed changes.',
          minLength: 8,
        },
        changes: {
          type: 'object',
          description:
            'Replacement values for documented contract fields; names and revision numbers are intentionally unavailable.',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            summary: { type: 'string', minLength: 1, maxLength: 1000 },
            description: { type: 'string', maxLength: 4000 },
            outputSchema: { type: 'object' },
            annotations: {
              type: 'object',
              properties: {
                readOnlyHint: { type: 'boolean' },
                untrustedContentHint: { type: 'boolean' },
              },
              additionalProperties: false,
            },
            sideEffect: {
              type: 'string',
              enum: [
                'none',
                'populates-audit-panel',
                'stages-revision',
                'opens-artifact-preview',
              ],
            },
            examples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 200 },
                  description: { type: 'string', maxLength: 2000 },
                  input: {},
                  output: {},
                },
                required: ['title', 'input', 'output'],
                additionalProperties: false,
              },
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', minLength: 1, maxLength: 128 },
                  summary: { type: 'string', minLength: 1, maxLength: 1000 },
                  recovery: { type: 'string', maxLength: 2000 },
                },
                required: ['code', 'summary'],
                additionalProperties: false,
              },
            },
            states: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 500 },
              uniqueItems: true,
            },
            prerequisites: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 500 },
              uniqueItems: true,
            },
            privacy: {
              type: 'object',
              properties: {
                outputSource: {
                  type: 'string',
                  enum: ['system', 'developer', 'external'],
                },
                note: { type: 'string', minLength: 1, maxLength: 2000 },
              },
              required: ['outputSource', 'note'],
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      required: ['toolName', 'baseRevision', 'rationale', 'changes'],
      additionalProperties: false,
    },
    outputSchema: successOutputSchema({
      type: 'object',
      properties: {
        staged: { const: true },
        stageId: { type: 'string' },
        toolName: { type: 'string' },
        baseRevision: { type: 'integer' },
        proposedRevision: { type: 'integer' },
        findingCountBefore: { type: 'integer', minimum: 0 },
        findingCountAfter: { type: 'integer', minimum: 0 },
        humanReviewRequired: { type: 'string' },
      },
      required: [
        'staged',
        'stageId',
        'toolName',
        'baseRevision',
        'proposedRevision',
        'findingCountBefore',
        'findingCountAfter',
        'humanReviewRequired',
      ],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    sideEffect: 'stages-revision',
    examples: [
      {
        title: 'Stage a clearer description',
        description:
          'This seeded example deliberately violates the integer baseRevision contract.',
        input: {
          toolName: 'list_tool_contracts',
          baseRevision: '1',
          rationale: 'Replace the vague description with observable behavior.',
          changes: {
            description:
              'Return the accepted workbench catalog with revision, annotation, side-effect, and finding summaries for each fixed tool.',
          },
        },
        output: {
          ok: true,
          data: {
            staged: true,
            stageId: 'stage-list_tool_contracts-1-2',
            toolName: 'list_tool_contracts',
            baseRevision: 1,
            proposedRevision: 2,
            findingCountBefore: 6,
            findingCountAfter: 5,
            humanReviewRequired:
              'A developer must accept or reject this exact staged revision in the visible workbench.',
          },
        },
      },
    ],
    errors: [
      {
        code: 'INVALID_PATCH',
        summary: 'The proposed patch contains unknown or structurally invalid fields.',
      },
      {
        code: 'STALE_REVISION',
        summary: 'The accepted contract changed after the proposal was prepared.',
        recovery: 'Inspect the current revision and prepare a new patch against it.',
      },
    ],
    states: ['audit_ready', 'revision_staged'],
    prerequisites: [
      'The proposal must target one fixed accepted tool name and exact base revision.',
      'A human developer must accept or reject the staged revision in the visible workbench.',
    ],
    privacy: {
      outputSource: 'external',
      note: 'The rationale and replacement metadata originate in an agent proposal and remain unaccepted until developer review.',
    },
  },
  {
    name: 'preview_contract_bundle',
    title: 'Preview contract bundle',
    summary: 'Open deterministic projections of the accepted registry.',
    description:
      'Generate and visibly open WebMCP registration metadata, canonical contract JSON, Markdown, and an explicitly non-network OpenAPI 3.1 documentation projection from the accepted registry.',
    revision: 1,
    inputSchema: EMPTY_INPUT_SCHEMA,
    outputSchema: successOutputSchema({
      type: 'object',
      properties: {
        formats: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['registration', 'contract-json', 'markdown', 'openapi'],
          },
          minItems: 4,
          maxItems: 4,
          uniqueItems: true,
        },
        opened: { const: true },
        acceptedRevision: { type: 'integer', minimum: 1 },
        note: { type: 'string' },
      },
      required: ['formats', 'opened', 'acceptedRevision', 'note'],
      additionalProperties: false,
    }),
    annotations: { readOnlyHint: false },
    sideEffect: 'opens-artifact-preview',
    examples: [
      {
        title: 'Open every accepted-registry projection',
        input: {},
        output: {
          ok: true,
          data: {
            formats: [
              'registration',
              'contract-json',
              'markdown',
              'openapi',
            ],
            opened: true,
            acceptedRevision: 1,
            note: 'The OpenAPI 3.1 file is a documentation projection only and creates no HTTP endpoint.',
          },
        },
      },
    ],
    errors: [
      {
        code: 'ARTIFACT_GENERATION_FAILED',
        summary: 'The accepted registry could not be serialized safely.',
        recovery:
          'Inspect the accepted contract schemas and examples, then retry after correcting non-JSON values.',
      },
    ],
    states: [
      'catalog_loaded',
      'audit_ready',
      'revision_staged',
      'artifact_preview',
    ],
    prerequisites: [
      'Only accepted contracts are projected; a staged revision remains excluded until human acceptance.',
    ],
    privacy: {
      outputSource: 'developer',
      note: 'Generated artifacts contain developer-authored contract descriptions, examples, and recovery guidance; no HTTP endpoint is created.',
    },
  },
] as const satisfies readonly WorkbenchToolContract[]

/** Deeply immutable canonical source for the five live Second Surface tools. */
export const SECOND_SURFACE_TOOL_CONTRACTS = cloneContracts(
  SECOND_SURFACE_SEED,
)

export type SecondSurfaceToolName =
  (typeof SECOND_SURFACE_TOOL_CONTRACTS)[number]['name']

/** Fixed executor-bound order used by registration and every projection. */
export const SECOND_SURFACE_TOOL_NAMES = Object.freeze(
  SECOND_SURFACE_TOOL_CONTRACTS.map((contract) => contract.name),
) as readonly SecondSurfaceToolName[]

/** Constant-time lookup over the accepted seed without duplicating contracts. */
export const SECOND_SURFACE_TOOL_CONTRACT_BY_NAME = Object.freeze(
  Object.fromEntries(
    SECOND_SURFACE_TOOL_CONTRACTS.map((contract) => [contract.name, contract]),
  ) as unknown as Readonly<
    Record<SecondSurfaceToolName, WorkbenchToolContract<SecondSurfaceToolName>>
  >,
)
