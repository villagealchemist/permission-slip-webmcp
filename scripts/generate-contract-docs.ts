import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  CONTRACT_ERRORS,
  DISCLOSURE_MODEL,
  DOMAIN_MODEL,
  HUMAN_ONLY_CAPABILITIES,
  WEBMCP_TOOL_CONTRACTS,
  WORKFLOW_INVARIANTS,
  WORKFLOW_STATES,
} from '../src/contracts/index.ts'

const outputDirectory = fileURLToPath(
  new URL('../docs/generated/', import.meta.url),
)

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function buildContractManifest() {
  return {
    schemaVersion: 1,
    name: 'Permission Slip WebMCP contracts',
    description:
      'Canonical documentation projection of the browser-registered Permission Slip tools. It does not define network endpoints.',
    registration: {
      surface: 'document.modelContext.registerTool',
      topLevelDocumentOnly: true,
      progressiveEnhancement: true,
      runtimePolyfill: false,
    },
    networkEndpoint: false,
    workflow: {
      states: WORKFLOW_STATES,
      invariants: WORKFLOW_INVARIANTS,
      humanOnlyCapabilities: HUMAN_ONLY_CAPABILITIES,
    },
    disclosureModel: DISCLOSURE_MODEL,
    domainModel: DOMAIN_MODEL,
    errors: CONTRACT_ERRORS,
    tools: WEBMCP_TOOL_CONTRACTS,
  }
}

function buildOpenApiProjection() {
  const paths = Object.fromEntries(
    WEBMCP_TOOL_CONTRACTS.map((contract) => [
      `/__webmcp_projection__/${contract.name}`,
      {
        post: {
          operationId: contract.name,
          summary: contract.summary,
          description: contract.description,
          tags: ['WebMCP documentation projection'],
          'x-webmcp-tool': true,
          'x-documentation-projection': true,
          'x-network-endpoint': false,
          'x-webmcp-read-only': contract.readOnly,
          'x-webmcp-side-effect': contract.sideEffect,
          'x-webmcp-allowed-states': contract.allowedStates,
          'x-webmcp-state-transitions': contract.transitions,
          'x-webmcp-human-approval-required':
            contract.humanApprovalRequired,
          'x-webmcp-human-prerequisite': contract.humanPrerequisite,
          'x-webmcp-disclosure-policy': contract.privacy,
          'x-webmcp-errors': contract.errors,
          'x-webmcp-related-domain-operations': contract.relatedOperations,
          requestBody: {
            required: true,
            description:
              'WebMCP tool input projected into an OpenAPI request body for documentation only.',
            content: {
              'application/json': {
                schema: contract.inputSchema,
                examples: Object.fromEntries(
                  contract.examples.map((example, index) => [
                    `example_${index + 1}`,
                    {
                      summary: example.title,
                      description: example.description,
                      value: example.input,
                    },
                  ]),
                ),
              },
            },
          },
          responses: {
            '200': {
              description:
                'WebMCP result envelope projected as a response for documentation only; no HTTP response exists.',
              content: {
                'application/json': {
                  schema: contract.outputSchema,
                  examples: Object.fromEntries(
                    contract.examples.map((example, index) => [
                      `example_${index + 1}`,
                      {
                        summary: example.title,
                        description: example.description,
                        value: example.result,
                      },
                    ]),
                  ),
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
      title: 'Permission Slip WebMCP Documentation Projection',
      version: '0.1.0',
      description:
        'This file is an OpenAPI 3.1 documentation projection of in-page WebMCP tools. It is not an HTTP API, creates no routes, and describes no network endpoints. The application invokes these operations through document.modelContext in the browser.',
    },
    servers: [],
    tags: [
      {
        name: 'WebMCP documentation projection',
        description:
          'Synthetic operations that make browser tool contracts explorable with conventional documentation software.',
      },
    ],
    paths,
    'x-webmcp-tool': true,
    'x-documentation-projection': true,
    'x-network-endpoint': false,
    'x-source-registry': 'src/contracts/registry.ts',
  }
}

await mkdir(outputDirectory, { recursive: true })
await Promise.all([
  writeFile(
    `${outputDirectory}webmcp-contracts.json`,
    serialize(buildContractManifest()),
  ),
  writeFile(
    `${outputDirectory}openapi.json`,
    serialize(buildOpenApiProjection()),
  ),
])

console.log(`Generated contract documentation under ${outputDirectory}`)
