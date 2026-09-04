import type {
  ContractArtifactBundle,
  RegistrationMetadata,
  WorkbenchContractExample,
  WorkbenchToolContract,
} from './workbenchContract'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  )
}

/** Stable key-sorted JSON used for artifacts, comparisons, and tests. */
export function stableStringify(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value), null, 2)
  if (serialized === undefined) {
    throw new TypeError('The projection value is not JSON serializable.')
  }
  return `${serialized}\n`
}

function examplesByTitle(
  examples: readonly WorkbenchContractExample[],
  member: 'input' | 'output',
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    examples.map((example, index) => [
      `example_${index + 1}`,
      {
        summary: example.title,
        ...(example.description ? { description: example.description } : {}),
        value: example[member],
      },
    ]),
  )
}

function revisionMap(
  contracts: readonly WorkbenchToolContract[],
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    contracts.map((contract) => [contract.name, contract.revision]),
  )
}

/** Exact metadata fields passed to document.modelContext.registerTool(). */
export function buildRegistrationMetadata(
  contracts: readonly WorkbenchToolContract[],
): readonly RegistrationMetadata[] {
  return Object.freeze(
    contracts.map((contract) =>
      Object.freeze({
        name: contract.name,
        title: contract.title,
        description: contract.description,
        inputSchema: contract.inputSchema,
        annotations: contract.annotations,
      }),
    ),
  )
}

/** Compatibility name used by early workbench integration. */
export const buildRegistrationProjection = buildRegistrationMetadata

/** Canonical machine-readable documentation projection. */
export function buildContractManifest(
  contracts: readonly WorkbenchToolContract[],
): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    name: 'Second Surface WebMCP contract registry',
    description:
      'Accepted contracts for Second Surface’s five in-page WebMCP tools and their documentation extensions.',
    registration: {
      surface: 'document.modelContext.registerTool',
      topLevelDocumentOnly: true,
      progressiveEnhancement: true,
      runtimePolyfill: false,
    },
    networkEndpoint: false,
    toolCount: contracts.length,
    revisions: revisionMap(contracts),
    tools: contracts,
  }
}

function markdownJson(value: unknown): string {
  return stableStringify(value).trimEnd()
}

/** Human-readable reference generated from the same accepted contracts. */
export function buildMarkdownReference(
  contracts: readonly WorkbenchToolContract[],
): string {
  const lines = [
    '# Second Surface WebMCP reference',
    '',
    '> Documentation for in-page WebMCP tools registered with `document.modelContext`. This is not an HTTP API and creates no network endpoints.',
    '',
  ]

  for (const contract of contracts) {
    lines.push(
      `## \`${contract.name}\` — ${contract.title}`,
      '',
      `Revision ${contract.revision} · ${contract.annotations.readOnlyHint ? 'read-only' : 'local state change'} · side effect: \`${contract.sideEffect}\``,
      '',
      contract.description,
      '',
      `**Summary:** ${contract.summary}`,
      '',
      `**States:** ${contract.states.length ? contract.states.map((state) => `\`${state}\``).join(', ') : 'None declared'}`,
      '',
      `**Prerequisites:** ${contract.prerequisites.length ? contract.prerequisites.join(' ') : 'None.'}`,
      '',
      `**Output source:** ${contract.privacy.outputSource}. ${contract.privacy.note}`,
      '',
      '### Input schema',
      '',
      '```json',
      markdownJson(contract.inputSchema),
      '```',
      '',
      '### Documented output schema',
      '',
      'This schema is a Second Surface documentation extension; it is not a native `registerTool()` field in the target browser surface.',
      '',
      '```json',
      markdownJson(contract.outputSchema),
      '```',
      '',
      '### Examples',
      '',
    )
    for (const example of contract.examples) {
      lines.push(
        `- **${example.title}:** ${example.description ?? 'Documented input and output.'}`,
      )
    }
    lines.push('', '### Errors', '')
    if (contract.errors.length === 0) {
      lines.push('- None documented.')
    } else {
      for (const error of contract.errors) {
        lines.push(
          `- \`${error.code}\`: ${error.summary}${error.recovery ? ` Recovery: ${error.recovery}` : ''}`,
        )
      }
    }
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * OpenAPI-shaped documentation only. Synthetic paths make the registry usable
 * in documentation viewers; they are not HTTP operations or network endpoints.
 */
export function buildOpenApiProjection(
  contracts: readonly WorkbenchToolContract[],
): Readonly<Record<string, unknown>> {
  const paths = Object.fromEntries(
    contracts.map((contract) => [
      `/__webmcp_projection__/${contract.name}`,
      {
        post: {
          operationId: contract.name,
          summary: contract.summary,
          description: contract.description,
          tags: ['WebMCP documentation projection'],
          'x-webmcp-tool': true,
          'x-webmcp-revision': contract.revision,
          'x-webmcp-annotations': contract.annotations,
          'x-webmcp-read-only':
            contract.annotations.readOnlyHint === true,
          'x-webmcp-side-effect': contract.sideEffect,
          'x-webmcp-states': contract.states,
          'x-webmcp-prerequisites': contract.prerequisites,
          'x-webmcp-privacy': contract.privacy,
          'x-webmcp-errors': contract.errors,
          'x-documentation-projection': true,
          'x-network-endpoint': false,
          requestBody: {
            required: true,
            description:
              'WebMCP tool input represented as an OpenAPI request body for documentation only.',
            content: {
              'application/json': {
                schema: contract.inputSchema,
                examples: examplesByTitle(contract.examples, 'input'),
              },
            },
          },
          responses: {
            '200': {
              description:
                'Documented WebMCP output represented as an OpenAPI response for documentation only; no HTTP response exists.',
              content: {
                'application/json': {
                  schema: contract.outputSchema,
                  examples: examplesByTitle(contract.examples, 'output'),
                },
              },
            },
          },
        },
      },
    ]),
  )

  return {
    openapi: '3.1.0',
    info: {
      title: 'Second Surface WebMCP Documentation Projection',
      version: `1.${Math.max(0, ...contracts.map((contract) => contract.revision))}.0`,
      description:
        'An OpenAPI 3.1 documentation projection of in-page WebMCP contracts. It is not an HTTP API, creates no routes, and describes no network endpoints.',
    },
    servers: [],
    tags: [
      {
        name: 'WebMCP documentation projection',
        description:
          'Synthetic documentation records for tools invoked through document.modelContext in the page.',
      },
    ],
    paths,
    'x-webmcp-tool': true,
    'x-webmcp-registry-revisions': revisionMap(contracts),
    'x-documentation-projection': true,
    'x-network-endpoint': false,
    'x-source-registry': 'src/contracts/registry.ts',
  }
}

/** Generates every accepted-registry view in one deterministic in-memory step. */
export function buildArtifactBundle(
  contracts: readonly WorkbenchToolContract[],
): ContractArtifactBundle {
  const registrationMetadata = buildRegistrationMetadata(contracts)
  const manifest = buildContractManifest(contracts)
  const markdown = buildMarkdownReference(contracts)
  const openApi = buildOpenApiProjection(contracts)
  return Object.freeze({
    registrationMetadata,
    registrationJson: stableStringify(registrationMetadata),
    manifest,
    contractJson: stableStringify(manifest),
    markdown,
    openApi,
    openApiJson: stableStringify(openApi),
  })
}

/** Compatibility name used by early workbench integration. */
export const buildContractBundle = buildArtifactBundle
