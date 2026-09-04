# WebMCP reference

Second Surface registers five tools imperatively on the top-level
`document.modelContext`. Registration is progressive enhancement: unsupported
browsers keep the complete visible workbench and receive no polyfill or alternate
network API.

## Tools

### `list_tool_contracts`

Returns compact accepted catalog records: names, summaries, revisions,
annotations, side-effect classes, and deterministic finding counts. Read-only.

### `get_tool_contract`

Returns one exact accepted contract and selects it in the visible workbench.
Read-only contract access; the visible selection is a presentation effect.

### `audit_tool_contracts`

Runs pure deterministic checks over the accepted registry and visibly populates
the audit panel. It does not call a model or external service.

### `propose_contract_revision`

Accepts one fixed tool name, rationale, and closed `changes` object. Unknown
fields or invalid nested structures reject atomically. A successful call stages a
candidate and real before/after diff; it never changes accepted contracts.

### `preview_contract_bundle`

Builds and visibly opens accepted-registry previews for runtime registration
metadata, contract JSON, Markdown, and an OpenAPI 3.1 documentation projection.
It creates no endpoint and executes no supplied code.

## Registration lifecycle

One controller run creates all five fixed handlers from the current accepted
registry. One `AbortController` owns that run. Readiness is published only after
every registration resolves. Any registration error aborts the shared signal so
partial success is not left active. Stopping invalidates in-flight completion and
aborts the run.

Each invocation resolves the current workbench adapter rather than a captured
state snapshot. Supplied invocation cancellation is preserved; browser builds
that omit invocation options receive an inert fallback signal.

## Runtime validation

Registration schemas document inputs. Handwritten validators enforce closed
objects, fixed tool names, a fixed patch allowlist, nested field types, and JSON
serializability before shared workbench operations run. Validation failure returns
a structured rejection and leaves the store unchanged.

The application does not depend on WebMCP tool-introspection or browser-side
execution helpers. Its accepted registry remains the reliable source.
