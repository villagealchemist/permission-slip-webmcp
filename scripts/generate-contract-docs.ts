import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  DISCLOSURE_MODEL,
  HUMAN_ONLY_CAPABILITIES,
  WEBMCP_TOOL_CONTRACTS,
  WORKFLOW_INVARIANTS,
} from '../src/contracts/index.ts'

const outputDirectory = fileURLToPath(
  new URL('../docs/generated/', import.meta.url),
)

const reference = {
  schemaVersion: 2,
  name: 'Permission Slip Village Alchemist inquiry reference',
  description:
    'Judge reference for the five browser tools in this one fictional project-inquiry demo.',
  registration: {
    surface: 'document.modelContext.registerTool',
    topLevelDocumentOnly: true,
    progressiveEnhancement: true,
    runtimePolyfill: false,
  },
  networkSubmission: false,
  humanOnlyActions: HUMAN_ONLY_CAPABILITIES.map(({ name, title, reason }) => ({
    name,
    title,
    reason,
  })),
  workflowInvariants: WORKFLOW_INVARIANTS,
  disclosure: {
    required: DISCLOSURE_MODEL.required.map(({ name, description }) => ({
      name,
      description,
    })),
    optional: DISCLOSURE_MODEL.optional.map(({ name, description }) => ({
      name,
      description,
    })),
    neverCollected: DISCLOSURE_MODEL.neverCollected,
  },
  tools: WEBMCP_TOOL_CONTRACTS.map((contract) => ({
    name: contract.name,
    title: contract.title,
    description: contract.description,
    readOnly: contract.readOnly,
    humanPrerequisite: contract.humanPrerequisite,
    privacy: contract.privacy,
  })),
}

await mkdir(outputDirectory, { recursive: true })
await writeFile(
  `${outputDirectory}webmcp-reference.json`,
  `${JSON.stringify(reference, null, 2)}\n`,
)

console.log(`Generated the inquiry reference under ${outputDirectory}`)
