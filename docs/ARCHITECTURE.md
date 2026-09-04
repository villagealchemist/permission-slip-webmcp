# Permission Slip inquiry workflow

This document describes only the Village Alchemist project-inquiry demonstration
implemented in this repository. It is not a specification for another product or
business.

## One state stream

The React interface and WebMCP tools operate on one `PermissionSlipStore`. Neither
surface reimplements inquiry rules.

```text
Visible React controls ─┐
                       ├─> PermissionSlipStore ─> inquiry domain operations
WebMCP tool handlers ──┘              │
                                      └─> versioned localStorage
```

Responsibilities stay narrow:

| Area | Responsibility |
| --- | --- |
| `src/domain` | Project-inquiry fields, validation, qualification, provenance, snapshot construction, digest checks, state transitions, retry behavior, and receipts. |
| `src/store` | One immutable state stream, browser persistence, cross-tab refresh, and separate human/agent capability surfaces. |
| `src/webmcp` | Top-level tool registration, input validation, abort handling, and adaptation to the agent-safe store surface. |
| `src/components` and `src/App.tsx` | Progressive inquiry presentation and every human-authority control. |
| `src/contracts` | The five in-page tool names, schemas, descriptions, and structured failures used by this demo. |

## Product state

The workflow uses five visible phases:

| State | Meaning |
| --- | --- |
| `empty` | No project inquiry draft exists. |
| `draft` | The inquiry is editable and has no current approved review. |
| `review_pending` | A complete normalized snapshot is frozen for human inspection. |
| `approved` | The person approved that exact review ID, revision, snapshot, and digest. |
| `submitted` | The approved snapshot was finalized into a browser-local receipt. |

A populated draft is not automatically a qualified inquiry. Qualification requires
the person to confirm a relevant requested next step. Permission for a direct
response about the project is a separate human decision, and optional ongoing
updates remain independently controlled.

## Shared inquiry operations

Both entry points reach the same concrete operations:

| Operation | Human UI | WebMCP | Authority effect |
| --- | --- | --- | --- |
| Read current requirements | Yes | `get_intake_requirements` | None |
| Update or replace the proposed inquiry | Yes | `draft_intake` | Invalidates an older review; grants no permission |
| Prepare an exact review | Yes | `prepare_submission_review` | Freezes a snapshot; does not approve |
| Finalize an approved review | Yes | `submit_approved_intake` | Requires an existing matching human approval |
| Read a receipt | Yes | `get_disclosure_receipt` | None |

The human interface additionally owns operations that are intentionally absent
from the agent surface:

- verify proposed values;
- confirm the requested project next step;
- permit or withhold a direct project response;
- permit or withhold optional ongoing updates;
- approve an exact review;
- return to editing; and
- reset browser-local state.

The store exposes a smaller frozen agent facade, so WebMCP handlers do not receive
references to those human-only operations.

## Provenance and verification

The inquiry keeps useful product-native provenance:

- information the person supplied;
- values the assistant suggested;
- limited entry or referral context captured by the page; and
- values the person explicitly verified.

Assistant suggestion is not human verification. Replacing or editing a value
updates its provenance, and the finalized receipt preserves the provenance for the
approved snapshot.

Activity entries record actor, action, outcome, and field names without copying raw
inquiry values into the visible timeline.

## Review binding

Review preparation:

1. validates every required inquiry value;
2. requires a human-confirmed relevant requested next step;
3. projects only permitted optional values;
4. records project-response and optional ongoing-update decisions;
5. normalizes the exact candidate payload in stable field order;
6. creates a unique review ID tied to the current draft revision;
7. computes a SHA-256 digest over the canonical snapshot; and
8. stores the frozen review without creating approval.

The visible approval action records the review ID, revision, and digest. Any
disclosure-affecting edit, verification change, requested-next-step change, or
permission change clears both review and approval.

## Frozen-snapshot finalization

Before finalization, the domain operation checks:

1. the supplied review ID identifies the current review;
2. the current status has matching visible human approval;
3. review, approval, and draft revisions agree;
4. the explicit-intent qualification rule still passes;
5. current permissions still match the reviewed permissions;
6. the canonical candidate still equals the frozen snapshot; and
7. the recomputed digest matches the reviewed and approved digest.

The receipt is constructed from the frozen review. Mutable form state is never the
execution payload.

A second finalization request for the same approved review resolves to the existing
receipt rather than creating a duplicate. A different or stale review is rejected
with a structured recovery step.

## Persistence and concurrency

The store writes a versioned envelope to `localStorage` for the current origin.
Persisted input is parsed defensively; malformed or internally inconsistent state
is discarded. Browser storage events and read-before-operation synchronization
help prevent a second tab from silently finalizing an approval made stale
elsewhere.

Asynchronous review and finalization operations capture their starting store
snapshot. If state changes while digest work is in flight, the result is rejected
instead of overwriting newer state.

This persistence is only for a repeatable browser demonstration:

- it normally survives refreshes on the same origin;
- it is unavailable on another origin, device, or cleared profile;
- it may fall back to in-memory state when browser storage is blocked; and
- it can be edited or erased through page scripts, extensions, developer tools, or
  direct storage access.

## Network boundary

The application has no backend, database, authentication, remote submission
endpoint, email delivery, CRM, analytics, or telemetry. Drafting, reviewing,
approving, finalizing, receipt lookup, and reset initiate no application network
request.

When hosted, the browser necessarily requests the static HTML, CSS, and JavaScript
files. That asset loading does not change the local-only submission boundary.

## Digest boundary

The digest detects a changed canonical snapshot. It does not prove who approved
the review, what the person understood, that the browser was uncompromised, that
`localStorage` was not edited, or when an event happened independently of the
local clock.
