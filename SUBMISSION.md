# Second Surface — submission draft

## Project name

Second Surface

## Tagline

The self-documenting WebMCP explorer.

## Short description

Second Surface makes a website's agent-facing WebMCP interface visible,
deterministically auditable, human-reviewable, and self-documenting from one
accepted contract registry.

## Inspiration

WebMCP gives agents a structured way to use a website, but the quality of that
experience depends on contracts developers rarely see as one coherent surface.
Tool names, descriptions, schemas, examples, annotations, recovery guidance, and
registration metadata can drift or contradict each other. Second Surface turns
those contracts into the product interface.

## What it does

The workbench loads a deliberately imperfect but executable five-tool catalog.
An agent can list and inspect exact contracts, run deterministic checks, and stage
a bounded structured revision. The page shows the resulting before/after diff and
projected issue count. A developer accepts or rejects the proposal in the visible
UI. The accepted registry then regenerates the runtime registration metadata,
contract JSON, Markdown reference, and OpenAPI 3.1 documentation projection.

## How it was built

- React, TypeScript, Vite, and Vitest
- top-level imperative WebMCP registration with `document.modelContext`
- one browser-local observable store shared by the UI and registered tools
- handwritten closed-object runtime validation for every tool input
- pure deterministic auditing and artifact projection functions
- Cloudflare Workers Static Assets for the isolated HTTPS preview

No backend, database, account, external model call, arbitrary code execution,
analytics, or telemetry is involved.

## The five site tools

| Tool | Purpose |
| --- | --- |
| `list_tool_contracts` | Return compact accepted catalog metadata and finding counts. |
| `get_tool_contract` | Return one exact contract and select it in the workbench. |
| `audit_tool_contracts` | Run deterministic checks and populate the audit panel. |
| `propose_contract_revision` | Validate and stage a fixed-field structured patch. |
| `preview_contract_bundle` | Open four accepted-registry documentation previews. |

## Golden demo prompt

```text
Audit the WebMCP catalog currently loaded in Second Surface. Identify only problems supported by the contract data, propose the smallest revision that makes the tools unambiguous and testable, and stage the revision in the workbench. Do not invent behavior or accept your own changes.
```

## Important accuracy notes

- Output schemas and richer lifecycle fields are documentation extensions; they
  are not all native registration fields.
- The OpenAPI file is documentation-only, describes no HTTP API, and creates no
  endpoint.
- Static contract metadata cannot prove real runtime side effects, security,
  privacy, or semantic truth.
- Second Surface does not claim to replace browser developer-tool inspection. Its
  focus is one-source documentation, deterministic auditing, reviewed revisions,
  and multi-format generation.

## Links

- Live app:
  `https://judge-demo-second-surface-webmcp-preview.mjohnson1307.workers.dev/`
- Source: `https://github.com/villagealchemist/permission-slip-webmcp`
- Demo route: follow the 60–90 second run card in `DEMO.md`.
