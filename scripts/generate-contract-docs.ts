import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  SECOND_SURFACE_TOOL_CONTRACTS,
  buildArtifactBundle,
} from '../src/contracts/index.ts'

const outputDirectory = fileURLToPath(
  new URL('../docs/generated/', import.meta.url),
)

const bundle = buildArtifactBundle(SECOND_SURFACE_TOOL_CONTRACTS)
const outputs = [
  ['webmcp-contracts.json', bundle.contractJson],
  ['webmcp-reference.md', bundle.markdown],
  ['openapi.json', bundle.openApiJson],
] as const

await mkdir(outputDirectory, { recursive: true })
await Promise.all(
  outputs.map(([filename, content]) =>
    writeFile(`${outputDirectory}${filename}`, content, 'utf8'),
  ),
)

console.log(
  `Generated ${outputs.length} accepted-registry projections under ${outputDirectory}`,
)
