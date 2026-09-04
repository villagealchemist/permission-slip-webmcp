# Privacy model

Permission Slip demonstrates explicit human control for one fictional Village
Alchemist project inquiry. It makes the proposed disclosure, requested next step,
contact permissions, and result visible before browser-local finalization.

It is not an identity system, secure vault, legal consent record, or guarantee
about what an external agent provider processes.

## Inquiry data

The smallest useful inquiry describes:

- the kind of project or collaboration;
- the desired outcome;
- relevant background;
- timeline and practical constraints;
- budget information when intentionally supplied;
- contact details and preferred response method;
- the specific next step the person wants; and
- limited entry or referral context captured by the page.

Missing or ambiguous facts remain missing or ambiguous. Assistant suggestions are
not presented as verified facts.

## Permission classes

| Decision or value | Rule |
| --- | --- |
| Required project information | Must be valid before a review can be prepared and appears in the frozen review. |
| Optional inquiry values | Included only when present and permitted by the matching human control. |
| Requested next step | Must be explicitly confirmed by the person before the draft can qualify as an inquiry. |
| Direct project response | Human-only permission governing whether Village Alchemist may respond about this specific fictional inquiry. |
| Ongoing updates | Separate optional permission, human-only and off by default; never bundled with project response. |
| Withheld information | The category may appear as withheld, but its value is absent from the review, tool result, and receipt. |
| Outside the inquiry | Unrelated private conversation, payment details, precise live location, and other unnecessary personal information are rejected rather than retained. |

An optional value may remain in the person’s local editable draft while its
disclosure control is off. That value is not copied into the frozen review or
receipt.

## Provenance

The page distinguishes:

- person-provided values;
- assistant-suggested values;
- automatically captured entry or referral context; and
- values the person explicitly verified.

Knowing a value does not grant permission to disclose it. A value typed in chat or
visible elsewhere remains subject to this page’s current field and permission
rules. The agent cannot mark its own suggestion as human-verified.

The receipt preserves provenance for the values in the approved snapshot. The
activity timeline keeps only actor, action, outcome, and field names so it does not
become a second store of inquiry values.

## Agent knowledge is not authority

For WebMCP:

- `get_intake_requirements` returns the current field and permission policy, not a
  hidden copy of the draft;
- `draft_intake` rejects unknown or unauthorized information atomically;
- `prepare_submission_review` returns the candidate frozen disclosure but grants
  no approval;
- `submit_approved_intake` requires a matching visible human approval; and
- `get_disclosure_receipt` returns only the finalized browser-local record.

No tool can verify a value for the person, confirm the requested next step, change
response permissions, approve a review, return to editing, or reset the demo.

This boundary controls only Permission Slip’s accepted inputs and outputs. It does
not erase information from chat history, prevent visual page inspection, or
control copies held by an external agent provider.

## Snapshot approval

Review preparation validates and normalizes the inquiry, applies the human’s
current permission choices, and freezes:

- the exact values to be finalized;
- field provenance and human-verification state;
- the confirmed requested next step;
- direct project-response permission;
- optional ongoing-update permission;
- the destination and local-only consequence;
- the current draft revision;
- a unique review ID; and
- a SHA-256 digest over the canonical snapshot.

Only the visible page can record approval. Any disclosure-affecting edit,
verification change, requested-next-step change, or permission change invalidates
the review and approval. Finalization checks the binding again and consumes the
frozen review, not live form values.

## What the digest means

The digest is a deterministic consistency check for the canonical browser-local
snapshot.

It does **not** prove:

- who clicked Approve;
- that the person understood the review;
- that the page or browser was uncompromised;
- that `localStorage` was not edited;
- when an event occurred independently of the local clock; or
- that a remote party received anything.

It is not a signature, credential, identity assertion, or tamper-proof audit log.

## Storage and transmission

Drafts, permissions, reviews, approvals, provenance, activity, and receipts are
stored in a versioned `localStorage` envelope for the page’s origin. State is
parsed defensively on load, and inconsistent or unsupported data is discarded.
Tabs on the same origin synchronize before operations and on storage events.

If browser storage is blocked or unavailable, the workflow remains in memory and
does not survive reload. Reset clears this application’s persisted state but
cannot erase screenshots, browser backups, extensions, chat history, developer
tool copies, or data held by an external agent provider.

Drafting, reviewing, approving, simulated submission, receipt lookup, and reset do
not initiate an application network request. The receipt’s destination is local
demonstration state on the current browser origin. Normal loading of hosted HTML,
CSS, and JavaScript assets still uses the network.

## Honest threat boundary

Permission Slip relies on the integrity of the browser page and its JavaScript.
It has no backend, database, authentication, access-control service, trusted clock,
signed log, remote destination, analytics, telemetry, email delivery, or OpenAI
API call. Anyone able to run script in the page’s origin or edit browser storage
can bypass or rewrite local state.

Keeping approval and permission controls out of WebMCP is a deliberate product
boundary. It does not guarantee that general-purpose browser automation cannot
activate a visible control. Use only the fictional Maya Chen rehearsal data.
