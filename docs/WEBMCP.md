# WebMCP reference

Permission Slip uses WebMCP for one task: helping a person prepare a Village
Alchemist project inquiry in the same page where the person verifies, permits, and
approves it.

The application exposes no HTTP submission API. The ordinary form remains fully
usable when WebMCP is unavailable.

## Registration

On startup, the top-level page:

1. checks for `document.modelContext.registerTool`;
2. constructs the five product-specific tools;
3. registers them imperatively with one lifecycle `AbortController`; and
4. reports unsupported, registering, ready, error, or stopped status in the UI.

Every invocation resolves the current shared store rather than a captured render.
Declared schemas document the expected shape, while runtime and domain validation
enforce the actual boundary. Read operations carry `readOnlyHint`; operations that
return human-authored values carry `untrustedContentHint`.

Permission Slip does not install a WebMCP polyfill, register from an iframe, or
create a network endpoint as a fallback.

## Result envelope

Successful calls return:

```json
{
  "ok": true,
  "data": {}
}
```

Rejected calls return a structured, truthful failure:

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

Validation failures may include safe field names and issue descriptions. They do
not convert a rejected operation into partial success.

## Tool catalog

### `get_intake_requirements`

- **Mode:** read-only.
- **Input:** an empty object.
- **Purpose:** read the current project-inquiry fields, optional field policy,
  response-permission state, workflow status, and next-step guidance before
  drafting.
- **Does not do:** return hidden draft values, verify facts, or change state.

An agent should call this first. A value mentioned in chat is not automatically an
allowed or verified inquiry value.

### `draft_intake`

- **Mode:** local state change.
- **Input:** one complete proposed inquiry using only the current accepted fields.
- **Purpose:** turn the person’s rough project description into a structured,
  validated draft visible in the page.
- **Transition:** a successful call moves the workflow to draft and invalidates an
  older review or approval.
- **Does not do:** confirm the requested next step, grant response permission,
  permit ongoing updates, mark assistant suggestions as human-verified, approve,
  or submit.

The write is atomic. Unknown fields, malformed values, missing required values, or
unauthorized optional values reject the whole proposal. Missing information stays
missing; the tool must not fabricate a fact to make the draft complete.

### `prepare_submission_review`

- **Mode:** local state change.
- **Input:** an empty object.
- **Purpose:** validate the current inquiry and freeze the exact candidate
  disclosure for visible review.
- **Output:** the review identifier, digest, and summary of the exact frozen
  values, requested next step, permissions, and withheld information.
- **Transition:** moves a valid draft to review pending and clears any former
  approval.
- **Does not do:** verify values for the person, create permission, approve, or
  finalize.

Review preparation requires the human-only prerequisites to be complete, including
confirmation of a relevant requested next step and the direct project-response
decision. Preparing a review is never treated as approval.

### `submit_approved_intake`

- **Mode:** consequential browser-local finalization; no application network
  request.
- **Input:** the exact current review identifier.
- **Purpose:** finalize only an unchanged review that the person already approved
  through the visible page.
- **Output:** confirmation, receipt identifier, review identifier, and submitted
  status.
- **Human prerequisite:** matching approval for the current review ID, revision,
  canonical snapshot, and digest.
- **Does not do:** deliver an inquiry to Village Alchemist, infer approval from
  chat, or bypass a stale review.

Immediately before finalization, the operation checks current qualification,
permissions, review identity, revision, canonical snapshot, and digest. The receipt
is created from the frozen review rather than mutable form state. Repeating the
same approved finalization returns the existing result instead of creating a
duplicate receipt.

### `get_disclosure_receipt`

- **Mode:** read-only.
- **Input:** an optional receipt identifier; omit it for the latest receipt on the
  current browser origin.
- **Purpose:** return the finalized local record, including outcome, exact approved
  values, requested next step, permissions granted and withheld, provenance,
  destination, timestamp, review revision, and digest.
- **Does not do:** list another origin or device, prove local storage integrity, or
  confirm remote delivery.

## Deliberately human-only actions

The following visible actions are intentionally absent from the WebMCP registry:

- verify a proposed value;
- confirm the requested next step;
- permit or withhold a direct response about the project;
- permit or withhold optional ongoing updates;
- approve a frozen review;
- return to editing; and
- reset browser-local state.

This asymmetry is the product’s authority boundary. Chat text such as “I approve”
does not create in-page approval, and the agent cannot invoke an approval operation
because no such tool is registered.

The boundary does not claim that developer tools, extensions, page scripts, or
general-purpose browser automation cannot manipulate a local page.

## Expected rejections

Common structured failures include:

| Situation | Required behavior |
| --- | --- |
| Unknown or malformed draft field | Reject the complete draft and identify the safe correction. |
| Unauthorized optional value | Reject atomically; only the person can change permission. |
| Missing or ambiguous required value | Keep the draft visible and explain what must be supplied or verified. |
| No confirmed relevant next step | Do not qualify or prepare a submittable review. |
| No project-response decision | Wait for the visible human control. |
| Submission before approval | Return approval required and leave business state unchanged. |
| Edit after review | Reject the stale review and require a fresh review and approval. |
| Digest mismatch | Reject finalization and require a fresh review. |
| Repeated approved finalization | Return the existing receipt without creating another. |
| Missing receipt | Explain that no matching browser-local receipt exists. |
| State changed during async work | Reject the stale operation instead of overwriting newer state. |

Rejected mutations must never be described as successful, and a tool failure must
not manufacture a success receipt.

## Ordinary-browser fallback

If `document.modelContext` is unavailable, registration reports an unsupported
state and the application continues as a normal form. The person can draft, verify,
set permissions, prepare a review, approve, complete the same simulated local
finalization, inspect the receipt, and reset.

## Storage and network boundary

WebMCP handlers and human controls share versioned `localStorage` state for the
current origin. When storage is unavailable, the page safely falls back to
in-memory state for that session.

No tool creates a backend request. Hosted asset loading still uses the network,
but drafting, review, approval, simulated submission, receipt retrieval, and reset
do not. The receipt therefore describes a browser-local demonstration, not a
delivered business inquiry.

The SHA-256 digest detects snapshot changes. It does not prove identity, human
understanding, local storage integrity, or a trusted timestamp.
