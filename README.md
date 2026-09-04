# Permission Slip

> The agent can prepare the inquiry. It cannot give itself permission to send it.

Permission Slip is a browser-only Village Alchemist project-inquiry demo built
with WebMCP. A person can describe a project in natural language, let an agent
turn that request into a structured inquiry, verify the exact result in the page,
and decide what follow-up is allowed. Only the visible human interface can grant
permission or approve the frozen submission snapshot.

The final action is deliberately simulated. It creates a receipt in versioned
`localStorage` for the current browser origin and sends no inquiry to Village
Alchemist or any other recipient. Use only the supplied fictional Maya Chen data.

## The problem

An agent can remove the repetitive work from a business inquiry, but preparing a
useful draft is not the same as authorizing contact or approving disclosure.
Permission Slip keeps those responsibilities separate:

- the agent can inspect requirements, prepare a draft, explain missing details,
  freeze a review, submit an already approved review, and retrieve its receipt;
- the person verifies the draft, confirms the requested project next step,
  permits or withholds a direct project response, controls optional ongoing
  updates, and approves the exact frozen snapshot; and
- the page applies the same validation and state transitions regardless of
  whether an operation began in the form or through WebMCP.

The result is one concrete lead-intake experience, not a generic form filler: a
Village Alchemist collaboration inquiry with an explicit requested next step and
an understandable record of what the person approved.

## The 90-second journey

1. A person gives ChatGPT a rough project goal, constraints, contact details, and
   the next step they want from Village Alchemist.
2. ChatGPT discovers the page tools and calls `get_intake_requirements` before
   drafting.
3. `draft_intake` writes a structured proposal into the same visible draft the
   person can edit.
4. The page identifies person-provided, assistant-suggested, automatically
   captured, and explicitly verified information without inventing missing facts.
5. The person verifies the inquiry, confirms the requested next step, allows a
   direct project response, and separately withholds or permits ongoing updates.
6. `prepare_submission_review` freezes the exact disclosure and produces a review
   ID, revision, and SHA-256 digest.
7. The person approves that exact snapshot in the visible page. There is no agent
   tool for approval or permission changes.
8. `submit_approved_intake` finalizes only the approved snapshot into browser-local
   state, and `get_disclosure_receipt` returns the resulting receipt.

## Human authority and snapshot safety

The human interface and WebMCP handlers share one store and the same inquiry
operations. The important rules are enforced beneath both entry points:

- A draft is not a qualified inquiry until the person explicitly confirms a
  relevant requested next step.
- Permission for a direct response about this project is explicit and human-only.
- Optional ongoing-update permission is separate, defaults off, and is never
  bundled into the project-response decision.
- Preparing a review never approves it.
- Approval binds one review ID, draft revision, exact snapshot, and digest.
- Any disclosure-affecting edit or permission change invalidates the review and
  approval.
- Submission consumes the frozen reviewed snapshot, never mutable form state.
- A retry for the same approved review cannot create a second inquiry receipt.
- Receipts preserve the approved values, requested next step, permissions,
  provenance, destination, outcome, time, review binding, and fields withheld.

### Honest security boundary

The SHA-256 digest is a consistency check, not proof of identity, comprehension,
or time. `localStorage`, page JavaScript, browser extensions, developer tools, and
the local clock are not tamper-proof. Keeping approval out of the WebMCP tool list
is an intentional product boundary; it is not a claim that general-purpose
browser automation can never activate a visible control.

## WebMCP tools

The top-level page registers five product-specific tools through
`document.modelContext.registerTool()`:

| Tool | What it does | What it cannot do |
| --- | --- | --- |
| `get_intake_requirements` | Reads the current inquiry requirements, allowed fields, permission state, and workflow status. | It does not read hidden draft values or change state. |
| `draft_intake` | Validates and atomically replaces the visible proposed inquiry. | It cannot grant permissions, mark a person as verified, approve, or submit. |
| `prepare_submission_review` | Validates the draft and freezes the exact candidate disclosure for review. | It does not approve the review or authorize contact. |
| `submit_approved_intake` | Finalizes one unchanged, visibly approved review into browser-local state. | It cannot bypass human approval and it sends no network submission. |
| `get_disclosure_receipt` | Reads a named receipt or the latest receipt on this browser origin. | It cannot list another browser’s state or prove the record was not edited locally. |

Read operations are marked read-only. Tool inputs use closed schemas and are
validated again at runtime. Calls return either an `{ "ok": true, "data": ... }`
result or a structured `{ "ok": false, "error": ... }` result with a safe recovery
step. When WebMCP is unavailable, the same human workflow remains usable as an
ordinary form; the app does not install a runtime polyfill.

## Browser-local data promise

Only normal loading of the hosted HTML, CSS, and JavaScript assets uses the
network. Drafting, reviewing, approving, simulated submission, receipt lookup,
and reset do not initiate an application submission request.

- Drafts, permissions, reviews, approvals, provenance, activity, and receipts are
  stored in a versioned `localStorage` envelope for the current origin.
- A receipt normally survives refreshes on that same origin until local state is
  cleared. It is not remote or cross-device durability.
- If storage is unavailable, the page continues in memory for the current session
  and says so honestly.
- Activity records actors, outcomes, and field names without copying inquiry
  values into the timeline.
- There is no backend, database, account, authentication, email delivery, CRM,
  analytics, telemetry, payment flow, or OpenAI API call.
- Reset clears this application’s browser-local demo state.

An external agent provider may process chat messages, tool inputs, and tool results
under its own terms. Permission Slip controls only what this page accepts, reviews,
and stores.

## Run locally

Node.js 22 and npm are recommended; CI uses Node.js 22.

```bash
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`.

Before delivery, run every required gate:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run preview -- --host 127.0.0.1
```

The production bundle is written to `dist/`.

## Exact fictional prompt

Use this single prompt for rehearsal and recording:

```text
Help me prepare a Village Alchemist project inquiry. My name is Maya Chen and my email is maya.chen@example.com. I want to turn a rough product idea into a working prototype in eight weeks, with a $15,000–$25,000 constraint. The concept and core audience are defined, but the product flow and technical approach still need shaping. I am requesting a 30-minute discovery call and prefer a reply by email. Use the budget only if I enable its visible inclusion control; otherwise omit it. Draft the inquiry for my review, but do not verify my facts, grant permissions, approve it, or submit it for me.
```

## Exact 60–90 second demo

| Time | Action | Narration |
| --- | --- | --- |
| 0:00–0:08 | Open the empty page with its WebMCP-ready indicator visible. | “Permission Slip turns a rough request into a qualified project inquiry, while the person keeps every consequential decision.” |
| 0:08–0:12 | Turn on the visible “Include budget or constraints” control. | “Maya alone decides whether this optional context can enter the inquiry.” |
| 0:12–0:24 | Paste the fictional prompt and let the agent inspect requirements and draft. | “The agent discovers what this page accepts, then structures Maya’s goal, background, timeline, authorized budget, contact preference, and requested discovery call in the live form.” |
| 0:24–0:35 | Point to the updated draft and provenance labels. | “The page shows where each value came from. The agent can suggest; it cannot silently verify facts or invent what Maya did not provide.” |
| 0:35–0:50 | In the page, verify the draft, confirm the discovery-call next step, allow a project response by email, and leave ongoing updates off. | “These are human-only controls. Permission to answer this inquiry is explicit, and optional ongoing updates remain separate and off.” |
| 0:50–1:03 | Have the agent prepare the review; show the destination, exact values, permissions, review ID, revision, and digest. | “The review freezes exactly what will be finalized. Any edit now invalidates this approval boundary.” |
| 1:03–1:12 | Click the visible approval control yourself. | “Only the person can approve this exact snapshot.” |
| 1:12–1:25 | Ask the agent to submit the approved review and retrieve the receipt. | “The agent can complete only the review Maya approved. A retry resolves to the same browser-local result.” |
| 1:25–1:30 | Show the receipt and local-only statement. | “The receipt records the requested next step, permissions, provenance, and digest. This demo sends no network submission.” |

## Ordinary-browser fallback

In a browser without `document.modelContext`, complete the same flow manually:

1. Load the fictional rehearsal data or enter it in the form.
2. Verify the proposed values and requested next step.
3. Permit a direct project response and leave ongoing updates withheld.
4. Prepare the exact review.
5. Approve it through the visible human control.
6. Complete the simulated local submission and inspect the receipt.
7. Reload to confirm same-origin persistence, then use the human-only reset.

## Static Cloudflare preview

The app can be hosted as prebuilt static assets on an isolated Cloudflare Workers
version preview. Hosting does not add a backend or change the simulated submission
into a network delivery.

Judge-ready preview:
[judge-demo-permission-slip-webmcp-judge-preview.mjohnson1307.workers.dev](https://judge-demo-permission-slip-webmcp-judge-preview.mjohnson1307.workers.dev)

1. Run `npm ci` and all four verification gates above.
2. Build `dist/` with `npm run build`.
3. Validate the checked-in assets-only configuration:

   ```bash
   npx wrangler@latest deploy --dry-run
   ```

4. The first time only, create the uniquely named static Worker with
   `npx wrangler@latest deploy`. It has no custom domain, route, binding, or
   server-side code. Then upload the traffic-isolated judge version:

   ```bash
   npx wrangler@latest versions upload --preview-alias judge-demo
   ```

5. Use only the generated versioned or aliased `workers.dev` preview URL. Do not
   promote the version, attach a production route or custom domain, add Worker
   code, create a database, or enable analytics for this demo.
6. Smoke-test direct navigation, refresh, responsive layout, all five site tools,
   the complete approved flow, stale-review rejection, retry behavior, and receipt
   recovery on the deployed origin.
7. Inspect console and network activity and confirm the simulated submission sends
   no application request.

See Cloudflare’s current [Static Assets](https://developers.cloudflare.com/workers/static-assets/)
and [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
documentation before deployment.

## Honest limitations

- The inquiry is not delivered to Village Alchemist; submission is simulated.
- Receipts exist only in browser storage for one origin and can be changed or
  deleted by anyone with local page or storage access.
- There is no identity verification, trusted timestamp, signed receipt, remote
  destination verification, retention policy, or cross-device recovery.
- WebMCP availability depends on the browser or host application. The form remains
  the supported fallback.
- This demonstration uses fictional data and must not be used for real personal or
  confidential information.

## Focused documentation

- [WebMCP reference](./docs/WEBMCP.md)
- [Inquiry workflow](./docs/ARCHITECTURE.md)
- [Privacy model](./docs/PRIVACY_MODEL.md)
- [Submission and recording copy](./SUBMISSION.md)

## References

- [OpenAI: Site tools (WebMCP)](https://learn.chatgpt.com/docs/webmcp)
- [WebMCP draft specification](https://webmachinelearning.github.io/webmcp/)
- [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/)
- [Challenge rules](https://webmcp.devpost.com/rules)

## License

[MIT](LICENSE) © 2026 Village Alchemist
