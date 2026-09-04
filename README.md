# Second Surface

> The self-documenting WebMCP explorer.

Every WebMCP-enabled website has two interfaces: the one people see and the one
agents use. Second Surface makes that agent-facing interface visible, auditable,
reviewable, executable, and self-documenting.

Second Surface is a browser-only workbench. Its five page tools inspect the exact
contract registry that registered them, run deterministic checks, stage a bounded
revision for developer review, and preview four documentation formats. A tool can
propose a correction; only a person using the visible page can accept or reject
it.

**Live judge preview:**
[judge-demo-second-surface-webmcp-preview.mjohnson1307.workers.dev](https://judge-demo-second-surface-webmcp-preview.mjohnson1307.workers.dev/)

## The golden path

1. `list_tool_contracts` returns the loaded catalog, revisions, annotations, and
   current finding counts.
2. `get_tool_contract` returns one exact contract and visibly selects it.
3. `audit_tool_contracts` runs static, deterministic checks and populates the
   audit panel.
4. `propose_contract_revision` validates a closed structured patch and stages a
   real before/after diff. It cannot accept its own proposal.
5. The developer accepts or rejects the staged revision in the page.
6. A fresh audit reports the accepted registry's new state.
7. `preview_contract_bundle` opens registration metadata, contract JSON, a
   Markdown reference, and an OpenAPI 3.1 documentation projection generated
   from that same accepted source.

Suggested prompt:

```text
Audit the WebMCP catalog currently loaded in Second Surface. Identify only problems supported by the contract data, propose the smallest revision that makes the tools unambiguous and testable, and stage the revision in the workbench. Do not invent behavior or accept your own changes.
```

## One accepted source

The accepted registry in [`src/contracts/registry.ts`](./src/contracts/registry.ts)
drives:

- the top-level `document.modelContext.registerTool()` metadata;
- the human-readable workbench;
- deterministic audit findings;
- the machine-readable contract manifest;
- the Markdown reference;
- the OpenAPI documentation projection; and
- executable examples and parity tests.

Output schemas, examples, recovery guidance, lifecycle notes, and privacy notes
are Second Surface documentation extensions. The current browser registration
surface receives only its supported registration fields. The UI labels that
distinction directly.

The OpenAPI 3.1 file is a **documentation projection only**. Its synthetic paths
are marked with `x-documentation-projection: true` and
`x-network-endpoint: false`. It is not an HTTP API and creates no routes.

## What the audit can and cannot say

The deterministic rules report facts available in contract data, including:

- missing or invalid names, titles, and descriptions;
- vague descriptions;
- missing or open object input schemas;
- undocumented properties and inconsistent required fields;
- examples that do not validate against their documented schemas;
- side-effect and read-only annotation conflicts;
- returned developer or external content without an untrusted-content hint;
- duplicate tool names;
- missing recovery guidance; and
- generated metadata or artifacts that disagree with the accepted registry.

Static metadata cannot prove actual runtime behavior, side effects, privacy,
security, or semantic truth. Those remain developer-review responsibilities.

## Browser and trust boundary

- No backend, account, database, remote API, analytics, telemetry, or cloud
  persistence is used.
- The audit is deterministic and calls no model or external service.
- Structured revisions accept a fixed field allowlist and reject unknown fields
  atomically.
- No arbitrary code is evaluated.
- WebMCP is progressive enhancement. In a browser without
  `document.modelContext`, the complete visible workbench remains usable.
- The workbench does not depend on `getTools()` or `executeTool()` support.

## Run locally

Node.js 22 and npm are recommended.

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

## Verify

```bash
npm run docs:contracts
npm run typecheck
npm run lint
npm run test
npm run build
```

The timed 60–90 second walkthrough is in [`DEMO.md`](./DEMO.md).

Generated contract files are written under `docs/generated/`:

- `webmcp-contracts.json`
- `webmcp-reference.md`
- `openapi.json`

## Project map

```text
src/contracts/          accepted contracts, deterministic audit, projections
src/workbench/          shared browser-local state and human review operations
src/webmcp/             runtime validation, tool bindings, registration lifecycle
src/contract-explorer/  the visible Second Surface workbench
scripts/                filesystem wrapper for deterministic documentation output
```

## License

[MIT](LICENSE) © 2026 Second Surface contributors
