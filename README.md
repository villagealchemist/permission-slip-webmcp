# Permission Slip

> Let the agent help. Keep the final say.

Permission Slip is a browser-only WebMCP demonstration of informed delegation. An
agent can inspect an intake form, draft an inquiry in the same interface a person
sees, and prepare an exact disclosure for review. Only the person can approve that
review. Submission succeeds only while the approved snapshot is unchanged.

The demo uses a fictional community-workshop inquiry and simulated local
submission. It has no backend, and its Submit action sends no intake data from the
page to a server. Never use real personal information in this prototype.

## Why this exists

Most agent-enabled forms optimize for completion. Permission Slip optimizes for
informed delegation.

A conventional form leaves two awkward choices: make the person enter everything
manually, or let an agent act without a precise, visible boundary around what it
will disclose. Permission Slip demonstrates a third pattern:

1. The site publishes narrow, structured tools.
2. The agent drafts into the live human interface.
3. The site freezes the exact proposed disclosure and computes its SHA-256 digest.
4. The person approves that snapshot in the page.
5. The agent may submit only the still-matching approved snapshot.
6. The site produces a receipt showing what was disclosed and withheld.

## The consent model

The application has five workflow states:

| State | Meaning |
| --- | --- |
| `empty` | No draft has been created. |
| `draft` | The intake is being edited and has no current review. |
| `review_pending` | A frozen disclosure snapshot is waiting for human approval. |
| `approved` | The human approved that exact review and digest. |
| `submitted` | The approved snapshot was saved locally and a receipt was created. |

The important invariants are shared by the ordinary UI and the WebMCP handlers:

- Creating a review freezes a canonical snapshot and assigns a unique `reviewId`.
- Approval applies only to that `reviewId`, snapshot digest, and draft revision.
- Editing a field or changing an optional-disclosure permission invalidates an
  outstanding review or approval.
- The approval control is visible in the webpage and is not a WebMCP tool.
- An unauthorized optional field rejects the entire agent draft; no partial update
  is applied.
- Submission checks the review, approval, current draft, and digest again before
  writing a receipt.
- Failed operations return structured explanations that tell the agent how to
  recover.

Optional fields are `phone`, `budget range`, `social handle`, and `additional
notes`. Each has a human-controlled disclosure toggle. The agent can use an
optional value only after its toggle is enabled; it cannot change those
permissions through WebMCP.

Street addresses, employers, precise live location, payment information, and
unrelated private conversation history are deliberately outside the data model.

### Honest security boundary

Permission Slip is a consent-pattern demonstration, not an identity or security
system. A digest detects a changed snapshot; it does not prove who clicked Approve.
`localStorage`, page JavaScript, and browser developer tools are not tamper-proof.
The lack of an approval WebMCP tool is an intentional interface boundary, not a
claim that general-purpose browser automation can never activate a visible control.

## WebMCP tools

The top-level page registers five tools through the imperative
`document.modelContext.registerTool()` API:

| Tool | Mode | Contract |
| --- | --- | --- |
| `get_intake_requirements` | Read | Returns required, optional, authorized, and never-collected fields plus workflow status and approval guidance. |
| `draft_intake` | Write | Atomically validates and writes a complete proposed draft to the visible form. Unauthorized optional or unknown fields reject the whole operation. |
| `prepare_submission_review` | Write | Validates the draft, freezes the exact disclosure, creates a `reviewId` and SHA-256 digest, and moves the page to human review. |
| `submit_approved_intake` | Write | Accepts a `reviewId` and performs a local simulated submission only after matching human approval and freshness checks pass. |
| `get_disclosure_receipt` | Read | Returns a requested receipt or the latest one, including disclosed fields, withheld optional fields, digest, time, and local-only destination. |

The two read operations use the WebMCP `readOnlyHint`. Every input schema is
narrow, documents its fields, and sets `additionalProperties: false`. Handlers
also validate at runtime because a schema declaration is not an authorization
boundary. Calls return either `{ "ok": true, "data": { ... } }` or a structured
`{ "ok": false, "error": { "code", "message", "retryable", "details" } }`
result so an agent can distinguish a correctable rejection from success.
Tools that return human-authored intake values also set `untrustedContentHint`.

When WebMCP is unavailable, the same page remains usable as an ordinary form.
There is no runtime polyfill.

## Local-only data promise

Only the normal loading of the hosted HTML, CSS, and JavaScript assets uses the
network. Permission Slip makes no application-initiated request when drafting,
reviewing, approving, submitting, reading a receipt, or resetting the demo.

- Drafts, reviews, approvals, activity, and receipts stay in versioned
  `localStorage` for the current browser origin.
- Open tabs synchronize before operations and on browser storage events so one
  tab cannot finalize an approval made stale by an edit in another tab.
- Activity entries record actors, outcomes, and field names rather than copying raw
  intake values into the timeline.
- If browser storage is unavailable, the workflow safely continues in memory for
  the current page session, but it will not survive a reload.
- “Submit” is explicitly simulated and writes locally.
- There is no backend, database, account, authentication, analytics, telemetry,
  email, payment flow, or OpenAI API call.
- Reset removes the locally persisted demo state.

Use the supplied fictional Maya Chen scenario rather than real information.

This promise describes Permission Slip's own application and simulated submission
path. If you use ChatGPT or another browser agent, that service may process chat
messages, tool inputs, and tool results under its own terms and privacy policy.

## Architecture

The implementation keeps business rules independent of React and gives the human
interface and WebMCP adapters one source of truth.

```text
src/
├── components/      # Human-visible workflow and presentation
├── domain/          # Types, validation, canonical snapshots, digest, state engine
├── store/           # Versioned local persistence and React subscription bridge
├── webmcp/          # Tool schemas, adapters, and registration lifecycle
├── test/            # Shared browser-test setup
├── App.tsx          # One-page experience
└── main.tsx         # Top-level application entry
```

Domain operations compute and validate a complete next state before the store
commits it. Registered tool callbacks read from the current store rather than from
a captured React render, avoiding stale state. An `AbortController` owns the
registration lifecycle so hot reloads and teardown do not leave duplicate tools.

## Run locally

Node.js 22 and npm are recommended; CI uses Node.js 22.

```bash
npm ci
npm run dev
```

Open the URL Vite prints. To bind explicitly for a local in-app-browser test:

```bash
npm run dev -- --host 127.0.0.1
```

Then open `http://127.0.0.1:5173/`.

### Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run typecheck` | Run the strict TypeScript project build without pretty output. |
| `npm run lint` | Run ESLint across the repository. |
| `npm run test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run build` | Type-check and create the production bundle in `dist/`. |
| `npm run preview` | Serve the production bundle locally for a final smoke test. |

## Test with ChatGPT site tools

At the time of the WebMCP Challenge, official OpenAI documentation says site tools
work in the latest ChatGPT desktop app with GPT-5.6 Sol or GPT-5.6 Terra. GPT-5.6
Luna currently has WebMCP disabled, and site tools are not available in Enterprise
or Edu workspaces. Availability also depends on rollout.

1. Run the app locally as above, or deploy the static build to HTTPS.
2. In the latest ChatGPT desktop app, select GPT-5.6 Sol or GPT-5.6 Terra.
3. Open the app URL in ChatGPT's built-in browser.
4. Select **Site tools** in the browser address bar, then **Available site tools**.
5. Confirm that all five tool names listed above are present.
6. Copy the fictional prompt below into the chat beside the open page.

```text
Help me prepare an inquiry for a 20-person creative coding and mentorship workshop on October 10, 2026. The goal is to pair early-career developers with local mentors for a collaborative workshop. My name is Maya Chen and my email is maya.chen@example.com. My phone is 215-555-0134, but use only information the site says is required or currently authorized. Prepare the inquiry for my review, but do not submit it until I approve the exact disclosure in the page.
```

7. Confirm the agent calls `get_intake_requirements` and drafts into the visible
   form. Phone begins unauthorized. If the first draft includes it, the expected
   result is an atomic rejection followed by a retry without phone.
8. Have the agent call `prepare_submission_review`. Confirm that the page shows the
   exact disclosed and withheld fields, a `reviewId`, and a digest.
9. Before approving, explicitly ask the agent to call `submit_approved_intake` with
   that review ID to test the gate. It must return a structured approval-required
   failure and leave state unchanged.
10. Choose **Return to editing**, change one field, and confirm the old review ID
    can no longer be submitted. Prepare a fresh review for the changed draft.
11. Click **Approve this exact disclosure** yourself in the webpage.
12. Ask the agent to submit the newly approved review and retrieve the disclosure
    receipt.
13. Confirm the receipt says **Local demonstration only**, lists phone as withheld,
    and states that the simulated submission caused no network transmission.

ChatGPT's built-in browser currently supports only part of the proposed WebMCP
standard. Permission Slip therefore uses imperative JavaScript registration in the
top-level page, not declarative form attributes or iframe registration.

### Local compatibility probe

On September 3, 2026, the local app was opened in ChatGPT's in-app browser. The
browser discovered all five registered tools, and a complete tool-driven flow
passed: unauthorized phone rejection, compliant draft, frozen review,
pre-approval submission rejection, visible human approval, submission, and receipt
retrieval. That browser build omitted the draft specification's optional invocation
context argument, so Permission Slip supplies an inert fallback signal when it is
absent while preserving real cancellation signals when provided.

Chrome DevTools Protocol network traces around successful simulated submissions
from both development and final production-preview builds recorded zero
`Network.requestWillBeSent` events. A second check must still be run against the
final deployed HTTPS origin because browser builds and hosting headers can differ.

The challenge rules also permit Chrome 149 or later with
`chrome://flags/#enable-webmcp-testing` enabled and the browser restarted. The
ChatGPT path above is the primary end-to-end agent test because it includes a
compatible agent as well as the browser API.

### Ordinary-browser fallback

Open the app in a browser without `document.modelContext`. The support indicator
should explain that WebMCP is unavailable, while the form, review, human approval,
local submission, receipt, and reset workflow remain usable:

1. Leave every optional-disclosure toggle off and complete the six required Maya
   Chen fields.
2. Click **Prepare exact review** and confirm that required fields appear under
   Required information while all four optional fields appear under Withheld.
3. Choose **Return to editing**, change a field, and prepare a new review. Confirm
   that it has a new review ID and digest.
4. Click **Approve this exact disclosure**, then **Complete local submission**.
5. Confirm the receipt matches the frozen review and says **Local demonstration
   only**.
6. Copy the receipt JSON, reload the page to verify persistence, then use the
   human-only **Reset local demo** control and confirm the demo returns to `empty`.

## Deploy the static build

No deployment is performed by this repository. Any static HTTPS host can serve the
app:

1. Run `npm ci`.
2. Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
3. Configure the host's build command as `npm run build` and publish directory as
   `dist` using Node.js 22.
4. Deploy without authentication so challenge judges can open the live URL.
5. Open the production URL directly and after a reload.
6. Repeat the five-tool ChatGPT test above against the deployed origin.
7. In browser developer tools, confirm the simulated submission produces no
   network request.

Keep the deployed app available through the challenge judging period.

## Demo media

- **Product screenshot:** `[ADD FINAL DEPLOYED SCREENSHOT]`
- **Public demo video:** `[ADD PUBLIC YOUTUBE URL]`

## References

- [OpenAI: Site tools (WebMCP)](https://learn.chatgpt.com/docs/webmcp)
- [WebMCP draft specification](https://webmachinelearning.github.io/webmcp/)
- [WebMCP repository and TypeScript types guidance](https://github.com/webmachinelearning/webmcp)
- [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/)
- [Challenge requirements and rules](https://webmcp.devpost.com/rules)

## License

[MIT](LICENSE) © 2026 Village Alchemist
