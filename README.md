# PORT AUTHORITY

> **The harbor master for WebMCP.**
> No agent docks on vibes.

Port Authority is a browser-only workbench for documenting and auditing the
tool contracts a page exposes through WebMCP. It turns the page’s agent-facing
surface into something a developer can inspect, redline, approve, and export.

An agent may inspect contracts, run deterministic checks, stage one bounded
revision, and preview documentation. It cannot approve its own proposal. Only
the visible human controls can grant clearance, return a revision, or reset the
manifest.

**Live application:**
[port-authority-webmcp-preview-0904a.mjohnson1307.workers.dev](https://port-authority-webmcp-preview-0904a.mjohnson1307.workers.dev/)

## The working loop

```text
ARRIVE → INSPECT → REDLINE → CLEAR → EXPORT
```

The accepted registry starts at revision 1 with six deterministic findings.
One is a deliberate, concrete contradiction in the documented
`propose_contract_revision` example:

```diff
- baseRevision: "1"
+ baseRevision: 1
```

The schema requires an integer, but the seeded example supplies a string. The
golden path is real application state, not a scripted mock:

1. The agent lists the five registered tools.
2. The agent audits the accepted manifest and receives six findings.
3. The agent inspects `propose_contract_revision` and confirms
   `INVALID_EXAMPLE` from declared contract data.
4. The agent stages the smallest allowed revision: the same example array with
   only `baseRevision` changed from `"1"` to `1`.
5. The accepted registry remains unchanged while the revision waits in **DRY
   DOCK**.
6. A human reviews the exact payload and selects **GRANT CLEARANCE — Accept
   this exact revision** or **RETURN TO SHIPPER — Reject without changing
   registry**.
7. After clearance, the accepted revision becomes 2, the audit count becomes
   five, and `INVALID_EXAMPLE` disappears.
8. **SHIP’S PAPERS** opens four synchronized projections of the accepted
   registry.

### Demo prompt

```text
Audit the loaded Port Authority manifest. List the WebMCP tools, run the deterministic contract inspection, and inspect propose_contract_revision. If the declared data confirms that its example uses a string where baseRevision requires an integer, stage the smallest bounded revision that changes "1" to 1. Do not infer runtime behavior and do not grant your own clearance.
```

After the human grants clearance:

```text
Reinspect the cleared manifest, report the remaining finding count, and open the four accepted artifact projections. Confirm whether the repaired example now matches its declared schema.
```

To reset the demo, select **RESET LOCAL CATALOG** and confirm the browser-local
reset. Reloading the page also starts a new in-memory session.

## Five registered berths

| WebMCP tool | What it may do |
| --- | --- |
| `list_tool_contracts` | List the five accepted contracts, revisions, annotations, side-effect classes, and finding counts. |
| `get_tool_contract` | Inspect one exact accepted contract and visibly select it in the workbench. |
| `audit_tool_contracts` | Run deterministic checks over declared contract data and populate **CUSTOMS INSPECTION**. |
| `propose_contract_revision` | Validate and stage one fixed-name, allowlisted metadata revision for human review. It cannot accept it. |
| `preview_contract_bundle` | Open four projections generated from the currently accepted registry. |

The tool names are fixed. Revision patches reject unknown fields, stale base
revisions, invalid schemas, empty changes, and attempts to rename executable
tools atomically.

## One accepted source

[`src/contracts/registry.ts`](./src/contracts/registry.ts) is the canonical
contract registry. That one accepted source drives:

- top-level `document.modelContext.registerTool()` metadata;
- the visible **HARBOR MAP** and registration explorer;
- deterministic audit findings;
- staged before/after revisions;
- registration metadata;
- the canonical JSON manifest;
- the Markdown reference; and
- the OpenAPI 3.1 documentation chart.

Output schemas, examples, recovery guidance, lifecycle states, prerequisites,
privacy notes, and side-effect classifications are Port Authority documentation
extensions. They are not presented as native `registerTool()` fields.

The OpenAPI artifact is documentation only. Synthetic paths carry explicit
`x-webmcp-*`, `x-documentation-projection: true`, and
`x-network-endpoint: false` markers. It creates no HTTP routes or network
endpoints.

## What the audit proves

Port Authority checks only facts supported by the accepted contract data,
including:

- missing, malformed, or vague contract fields;
- missing, open, or internally inconsistent input schemas;
- examples that do not validate against their declared schemas;
- conflicts between read-only annotations and declared side effects;
- missing untrusted-content hints for developer or external output;
- missing recovery guidance;
- duplicate tool names; and
- disagreements between the accepted registry and generated projections.

It does **not** prove runtime behavior, actual side effects, privacy, security,
or semantic truth. Those remain developer-review responsibilities.

## Browser and trust boundary

- Browser-only React application.
- No backend, database, account, authentication, remote API, analytics,
  telemetry, or cloud persistence.
- No arbitrary code execution.
- No model call or external service is used by the deterministic audit.
- Agents may inspect, audit, stage, and preview.
- Only visible human controls may accept, reject, or reset.
- WebMCP is progressive enhancement. The visible workbench remains usable when
  `document.modelContext` is unavailable.
- Runtime registration is imperative on the top-level
  `document.modelContext`; there is no WebMCP polyfill or dependency on
  introspection APIs.

## Run locally

Node.js 22 or newer and npm are recommended.

```bash
git clone https://github.com/villagealchemist/permission-slip-webmcp.git
cd permission-slip-webmcp
npm ci
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite in a WebMCP-capable browser to exercise the
five page tools. Other browsers receive the complete visual workbench.

## Verify

```bash
npm run docs:contracts
npm run typecheck
npm run lint
npm run test
npm run build
```

The current suite covers schema boundaries, atomic revision rejection, stable
audit findings, runtime output contracts, WebMCP registration, human-only
acceptance, and artifact projection consistency.

Static documentation generation writes these accepted-registry files under
`docs/generated/`:

- `webmcp-contracts.json`
- `webmcp-reference.md`
- `openapi.json`

The in-page **SHIP’S PAPERS** workbench additionally exposes live registration
metadata, so the browser presents four accepted projections.

## Project map

```text
src/contracts/          canonical registry, audit rules, revision boundary, projections
src/workbench/          shared browser-local state and human-only decisions
src/webmcp/             validation, fixed tool bindings, registration lifecycle
src/contract-explorer/  visible Port Authority workbench
scripts/                deterministic documentation generator
docs/                   architecture, privacy, and WebMCP notes
```

The implementation walkthrough is in [`DEMO.md`](./DEMO.md). Architectural and
trust-boundary details are in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md),
[`docs/WEBMCP.md`](./docs/WEBMCP.md), and
[`docs/PRIVACY_MODEL.md`](./docs/PRIVACY_MODEL.md).

## License

[MIT](./LICENSE) © 2026 Village Alchemist
