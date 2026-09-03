# Privacy model

Permission Slip demonstrates explicit, field-level disclosure consent for one
fictional workshop inquiry. It minimizes the application's intake surface and
makes the candidate disclosure visible before local finalization.

It is not an identity system, secure vault, legal consent record, or guarantee
about what an external agent provider processes.

## Data classes

| Class | Fields | Rule |
| --- | --- | --- |
| Required | `contactName`, `email`, `eventType`, `preferredDate`, `estimatedAttendeeCount`, `eventGoal` | Every field must be valid and is included in any prepared review. |
| Optional and human-authorized | `phone`, `budgetRange`, `socialHandle`, `additionalNotes` | A value is included only when it is present, valid, and the matching human toggle is enabled. The agent cannot change the toggle. |
| Withheld | Any optional field without both a value and current authorization | The field name is listed as withheld; its value is absent from the review and receipt. Revoking authorization invalidates an existing review or approval. |
| Never collected | Street address, employer, precise live location, payment information, unrelated private conversation history | These categories have no intake fields and are rejected if supplied to a tool. Their category names and reasons may be shown as policy metadata. |
| Workflow metadata | Status, revision, IDs, timestamps, digest, field provenance, authorization flags, and activity entries | Stored locally to enforce and explain the workflow. Activity records actor/action/outcome and field names, not raw intake values. |

Optional values may exist in the human's local draft while their toggles are off.
That allows a person to withhold a value without deleting it. Such a value is not
copied into the frozen review, review tool result, or disclosure receipt.

## Agent knowledge is not disclosure authorization

An agent may already know a value because a person typed it in chat, because it
appears elsewhere on the visible page, or because the agent obtained it outside
Permission Slip. That knowledge does not authorize the `draft_intake` tool to
place the value across Permission Slip's disclosure boundary.

For WebMCP:

- `get_intake_requirements` returns policy and field names, not draft values;
- unauthorized optional input rejects the entire agent draft;
- `prepare_submission_review` returns only the candidate frozen disclosure;
- `submit_approved_intake` returns identifiers and confirmation, not a broader
  copy of local state; and
- `get_disclosure_receipt` returns only the finalized snapshot and its audit
  metadata.

This boundary controls Permission Slip's accepted inputs and tool outputs. It
does not revoke information from the agent, prevent visual page inspection, or
control copies already present in chat history.

## Snapshot approval

Review preparation validates and normalizes the draft, then builds a snapshot in
a stable field order:

1. include all six required fields;
2. include each optional field only when authorized and present;
3. record disclosed, authorized-optional, and withheld-optional field names;
4. canonicalize the snapshot;
5. compute a SHA-256 digest with Web Crypto; and
6. freeze the snapshot with a unique `reviewId` and current draft revision.

Only the visible human UI can create an approval. The approval records the exact
review ID, revision, and digest. Any successful draft edit, agent replacement,
authorization change, or return to editing clears the review and approval.
Submission validates the current draft again, rebuilds and compares the canonical
snapshot, recomputes the digest, and requires the review and approval to match.

## What the digest means

The digest is a deterministic change detector for the canonical disclosure used
by this local workflow. It lets the application verify that the value being
finalized matches the value it reviewed.

The digest does **not** prove:

- who clicked Approve;
- that the human understood the disclosure;
- that the page or browser was uncompromised;
- that `localStorage` was not edited;
- when an event occurred independently of the local clock; or
- that a remote party received anything.

It is not a signature, credential, identity assertion, or tamper-proof audit log.

## Storage and transmission

Drafts, authorization flags, reviews, approvals, receipts, provenance, and
activity are stored in a versioned `localStorage` envelope for the page's origin.
State is parsed defensively on load, and inconsistent or unsupported persisted
data is discarded. Tabs on the same origin synchronize before operations and on
storage events. If storage is blocked or unavailable, the workflow remains
in-memory and will not survive reload.

Drafting, reviewing, approving, submitting, reading a receipt, and resetting do
not initiate an application network request. Submission is simulated: it appends
a local receipt whose destination is `Local demonstration only` and whose
statement is `No network transmission occurred.` Normal loading of deployed HTML,
CSS, and JavaScript assets still uses the network.

Reset removes the persisted demonstration state. It cannot erase copies from
browser backups, extensions, screenshots, chat history, developer tools, or an
external agent provider.

## Honest threat boundary

Permission Slip relies on the integrity of the browser page and its JavaScript.
It has no backend, database, authentication, access control service, trusted
clock, signed log, remote destination, analytics, telemetry, or OpenAI API call.
Anyone able to run script in the page's origin or edit browser storage can bypass
or rewrite local state.

The missing approval WebMCP tool deliberately keeps approval outside the agent
tool contract. It does not guarantee that general-purpose browser automation
cannot click the visible approval control. Likewise, ChatGPT or another agent may
process chat messages, tool arguments, and tool results according to that
provider's own terms. Use only fictional data in this demonstration.
