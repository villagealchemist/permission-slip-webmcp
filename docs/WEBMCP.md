# WebMCP reference

Permission Slip uses WebMCP because the agent and person need to collaborate on
the same live page and the same local workflow state. A separate MCP server would
add a second state boundary and is unnecessary for this browser-only
demonstration. Permission Slip exposes no HTTP API.

The [canonical contract registry](../src/contracts/registry.ts) is the source for
tool names, descriptions, JSON Schemas, examples, workflow metadata, errors, and
privacy declarations. Runtime WebMCP registration and generated documentation
project that registry rather than maintaining separate schemas.

## Discovery and registration

On application startup, the controller:

1. checks for a top-level `document.modelContext.registerTool` function;
2. constructs the five runtime tools from the canonical contracts and their
   existing executors;
3. registers them imperatively with one lifecycle `AbortController`; and
4. reports `unsupported`, `registering`, `ready`, `error`, or `stopped` to the UI.

Calls are validated again at runtime because a declared JSON Schema is not an
authorization boundary. Each invocation resolves the current store adapter, runs
the domain state engine behind the shared human/agent store, and returns JSON-safe
data.
Stopping the controller aborts its registrations. When an execution signal is
provided, asynchronous review and submission work checks it before committing.
The two read tools carry `readOnlyHint`; tools that return human-authored snapshot
values carry `untrustedContentHint`.

The current browser registration type accepts an input schema but has no
`outputSchema` registration field. Output schemas therefore remain canonical
contract metadata for the Explorer, generated artifacts, tests, and future
projections; handlers return the documented envelope directly.

This follows the current [OpenAI Site tools guidance](https://learn.chatgpt.com/docs/webmcp):
imperative JavaScript registration in the top-level page, narrow inputs, existing
application validation and permissions, and a preserved ordinary-browser UI.

## Result envelope

Success:

```json
{
  "ok": true,
  "data": {}
}
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "APPROVAL_REQUIRED",
    "message": "The human has not approved this review in the webpage.",
    "retryable": true,
    "details": {
      "retry": "Wait for the human to approve the exact visible disclosure before retrying."
    }
  }
}
```

Domain failures may add `details.fields` and `details.issues`. Contract-validation
failures use `details.issues` with a JSON path, code, and message. Cancellation is
propagated as an aborted execution rather than reported as a successful tool
result.

## Tool catalog

### `get_intake_requirements`

- **Mode:** read-only
- **Input:** `{}`; additional properties are rejected.
- **Successful states:** all workflow states.
- **Output:** required field names, optional field names, currently authorized
  optional fields, never-collected categories, current workflow status, and
  instructions.
- **Transition:** none.
- **Disclosure:** classifications and workflow metadata; no intake values.

Use this first. Authorization is stateful, so an agent should not infer that an
optional field is allowed from prior conversation.

### `draft_intake`

- **Mode:** state-changing local draft replacement.
- **Input:** one complete object with six required fields and, only when currently
  authorized, up to four optional fields. `additionalProperties` is `false`.
- **Successful states:** `empty`, `draft`, `review_pending`, and `approved`.
- **Output:** accepted field names, withheld optional field names, `draft` status,
  and the recommended next action.
- **Transition:** any successful non-terminal call moves to `draft`; an existing
  review and approval are invalidated.
- **Disclosure:** the six required values plus only optional values already
  authorized by the human.

The write is atomic. Unknown properties, malformed values, missing required
properties, or one unauthorized optional property reject the complete proposal.
The tool cannot authorize a field, approve, or submit.

If the human previously entered an optional value and later turned its disclosure
toggle off, an agent replacement preserves that local value privately. It remains
absent from the frozen review and tool results unless the human reauthorizes it.

### `prepare_submission_review`

- **Mode:** state-changing local review preparation.
- **Input:** `{}`; additional properties are rejected.
- **Successful states:** `draft`, `review_pending`, or `approved`, provided the
  current draft is complete and valid.
- **Output:** `reviewId`, SHA-256 digest, exact disclosed values, withheld optional
  field names, and the required human action.
- **Transition:** creates or replaces the frozen review and moves to
  `review_pending`; any former approval is cleared.
- **Disclosure:** the exact candidate snapshot that the human must inspect.

Preparing a review is not approval. A replacement review gets a new identity and
must be approved separately.

### `submit_approved_intake`

- **Mode:** consequential local finalization; no network transmission.
- **Input:** `{ "reviewId": "..." }` with no additional properties.
- **Successful state:** `approved` only, with a matching live review, revision,
  approval, canonical snapshot, and recomputed digest.
- **Output:** confirmation, receipt ID, review ID, and `submitted` status.
- **Transition:** `approved` to `submitted`.
- **Human prerequisite:** the person must use the visible UI to approve the exact
  frozen review.
- **Disclosure:** finalizes only that reviewed snapshot into local application
  state, persisted in browser storage when available.

The supplied review ID is necessary but not sufficient. The operation repeats
freshness and integrity checks immediately before creating the receipt.

### `get_disclosure_receipt`

- **Mode:** read-only.
- **Input:** optional `receiptId`; omit it for the latest receipt. Additional
  properties are rejected.
- **Successful state:** `submitted`, when a matching local receipt exists.
- **Output:** receipt and review IDs, timestamp, exact disclosed values, withheld
  optional fields, never-collected categories, snapshot digest, local-only
  destination, and the no-network statement.
- **Transition:** none.
- **Disclosure:** the already finalized local snapshot and its disclosure audit
  metadata.

## Structured error taxonomy

| Code | Meaning | Typical recovery |
| --- | --- | --- |
| `INVALID_INPUT` | Tool or domain input is malformed or incomplete for that operation. | Correct every reported issue and retry the complete call. |
| `UNKNOWN_FIELDS` | A draft contains properties outside the intake model. | Use only fields returned by `get_intake_requirements`. |
| `UNAUTHORIZED_OPTIONAL_FIELDS` | The agent supplied an optional field whose human toggle is off. | Omit it; only the human can change disclosure permissions. |
| `INCOMPLETE_DRAFT` | The current draft cannot form a valid review. | Complete or correct reported fields, then prepare again. |
| `REVIEW_NOT_FOUND` | Submission or approval has no current review. | Prepare a fresh review. |
| `APPROVAL_REQUIRED` | A current review exists but lacks matching human approval. | Wait for approval in the visible UI. |
| `STALE_REVIEW` | Review ID, revision, approval, or current disclosure no longer matches. | Prepare and approve a fresh review. |
| `DIGEST_MISMATCH` | Current, reviewed, and approved digest values differ. | Prepare and approve a fresh review. |
| `DIGEST_UNAVAILABLE` | Web Crypto could not create or verify the digest. | Retry in a browser with Web Crypto support. |
| `RECEIPT_NOT_FOUND` | No requested or latest receipt exists. | Submit an approved intake or use a known receipt ID. |
| `STALE_OPERATION` | State changed while an asynchronous review or submit was in flight. | Inspect current state and retry. |
| `SUBMITTED_TERMINAL` | The local demonstration is already finalized. | Retrieve its receipt or ask the human to reset. |
| `TOOL_EXECUTION_FAILED` | An unexpected executor failure was caught. | Inspect the visible workflow before retrying. |
| `INVALID_TOOL_RESULT` | A result could not be represented as JSON. | Do not retry unchanged; inspect the implementation. |

Rejected mutating domain operations can append a value-free activity entry, but
they do not partially apply their intended draft/review/submission mutation.

## Deliberately absent tools

The following capabilities exist in the human interface but are intentionally
absent from the WebMCP registry:

- authorize or revoke optional-field disclosure;
- approve a frozen review;
- return to editing; and
- reset local state.

This asymmetry is part of the consent model. In particular, exposing
`approve_review` would collapse the human prerequisite into an agent-controlled
step. The absence of such a tool is an interface and authorization boundary, not
a claim that page JavaScript, developer tools, extensions, or general-purpose
browser automation cannot manipulate a local page.

## Ordinary-browser fallback

If `document.modelContext` is unavailable, registration reports `unsupported`
and the application continues as a normal form. The person can edit, set optional
disclosure permissions, prepare a review, approve it, complete the same simulated
local submission, inspect the receipt, return to editing, and reset. Permission
Slip does not install a WebMCP polyfill or create an alternate network API.

## Machine-readable reference

- `docs/generated/webmcp-contracts.json` is the native manifest of canonical tool
  contracts.
- `docs/generated/openapi.json` is an OpenAPI 3.1 **documentation projection**.
  Its synthetic operations are marked as WebMCP tools, documentation-only, and
  non-network endpoints. It is not callable HTTP API documentation.

Regenerate these artifacts with `npm run docs`; do not edit them by hand.
