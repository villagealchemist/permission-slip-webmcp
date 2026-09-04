# Second Surface delivery guide

- Keep the product browser-only: no backend, database, authentication, remote API, analytics, telemetry, or arbitrary code execution.
- Second Surface is narrowly about documenting and auditing WebMCP page tools. Keep every claim inside that product boundary.
- One accepted contract registry must drive runtime `document.modelContext.registerTool()` metadata, the visible explorer, deterministic findings, generated JSON, Markdown, and the OpenAPI documentation projection.
- The five registered workbench tools are `list_tool_contracts`, `get_tool_contract`, `audit_tool_contracts`, `propose_contract_revision`, and `preview_contract_bundle`.
- Agent tools may inspect, audit, stage a bounded revision, and preview artifacts. Only visible human controls may accept or reject a staged revision or reset the catalog.
- Reject unknown patch fields and invalid schemas atomically. Never infer or invent behavioral semantics.
- Treat output schemas and richer lifecycle metadata as Second Surface documentation extensions; do not imply that every field is passed to `registerTool()`.
- The OpenAPI 3.1 artifact is documentation-only. Preserve explicit `x-webmcp-*`, `x-documentation-projection: true`, and `x-network-endpoint: false` markers and never describe synthetic paths as HTTP endpoints.
- Static audit findings describe contract data only. They cannot prove runtime behavior, side effects, privacy, security, or semantic truth.
- WebMCP is progressive enhancement. Register imperatively on the top-level `document.modelContext`; do not add a runtime polyfill or depend on tool-introspection APIs.
- Before delivery run documentation generation, typecheck, lint, tests, production build, browser smoke tests, and a confidentiality/leak scan.
- Do not push, deploy, or change external services without explicit authorization.
