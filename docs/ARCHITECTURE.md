# Second Surface architecture

Second Surface is a static, browser-only WebMCP workbench. It has no server-side
application state.

```text
accepted contract registry
        │
        ├── visible catalog and living reference
        ├── deterministic audit
        ├── WebMCP registration metadata + fixed executors
        ├── contract JSON
        ├── Markdown reference
        └── OpenAPI 3.1 documentation projection
```

## Ownership

- `src/contracts` defines the five accepted contracts, audit rules, structured
  patch shape, and pure projections.
- `src/workbench` owns browser-local accepted state, selected tool, current
  findings, one staged revision, and artifact previews.
- `src/webmcp` validates invocation input, binds fixed handlers, and owns the
  top-level registration lifecycle.
- `src/contract-explorer` renders the same live state and provides the only
  Accept, Reject, and Reset controls.

## Accepted and staged state

A proposed revision is computed against one accepted revision. Validation either
produces a complete candidate or rejects the patch without changing state.
Staging never changes live registration or generated artifacts. Visible developer
acceptance replaces the accepted snapshot, increments its revision, clears the
stage, recomputes findings, and re-registers metadata through a fresh controller
lifecycle. Rejection clears only the stage.

Tool names are fixed because each registered operation has a fixed executor. A
structured patch cannot add, remove, or rename an executable tool.

## Projection boundary

`registerTool()` receives the supported name, title, description, input schema,
and annotations. Output schemas, examples, errors, recovery guidance, states,
prerequisites, side-effect classifications, and privacy notes are documentation
extensions used by the workbench and generated references.

The OpenAPI paths are synthetic documentation records. Explicit extensions mark
them as WebMCP tools, documentation projections, and non-network endpoints.

## Honest audit boundary

Audit rules compare declared data. They can identify missing descriptions,
schema inconsistencies, invalid examples, and contradictory annotations. They
cannot verify what an executor actually does, establish security or privacy
properties, or decide whether a behavioral claim is true. Those questions stay
with the developer reviewing the implementation.
