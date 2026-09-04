# Permission Slip — submission materials

## Devpost fields

**Project name:** Permission Slip

**Tagline:** The agent can prepare the inquiry. It cannot give itself permission
to send it.

**Short description:** Permission Slip turns a rough Village Alchemist project
request into a structured inquiry while keeping verification, contact permission,
the requested next step, optional ongoing updates, and final approval under visible
human control.

**Live app URL:**
[judge-demo-permission-slip-webmcp-judge-preview.mjohnson1307.workers.dev](https://judge-demo-permission-slip-webmcp-judge-preview.mjohnson1307.workers.dev)

This is an isolated Cloudflare version-preview alias with no custom domain or
production route.

**Public repository URL:**
[github.com/villagealchemist/permission-slip-webmcp](https://github.com/villagealchemist/permission-slip-webmcp)

**Public demo video URL:** Not recorded yet.

## Full description

### Inspiration

AI can turn an unstructured project idea into a much better inquiry, but drafting
is not consent. A person should not lose control of what is shared, what response
they requested, or whether a business may keep contacting them simply because an
agent helped complete a form.

Permission Slip makes that boundary visible inside one useful task: preparing a
Village Alchemist project or collaboration inquiry.

### What it does

A visitor describes a project in natural language. Through five WebMCP site tools,
the agent learns the accepted fields, prepares a structured draft in the live page,
and freezes the exact disclosure for review.

The person then:

- verifies the proposed values;
- confirms a relevant requested next step;
- explicitly permits or withholds a direct response about this project;
- separately chooses whether to receive optional ongoing updates; and
- approves the exact frozen review in the visible webpage.

The agent has no tool for those human decisions. After approval, it may finalize
only the matching review and retrieve a receipt showing the exact approved values,
requested next step, permissions granted and withheld, provenance, destination,
time, review binding, and outcome.

This is a browser-only demonstration. “Submit” writes the frozen snapshot and
receipt to versioned `localStorage` for the current origin. It sends no inquiry,
email, or application request to Village Alchemist or any other recipient.

### Why WebMCP matters

Without WebMCP, the person can still complete the whole form manually. With WebMCP,
the agent can transform a rough request into a validated draft directly in the
page, explain missing or unauthorized data, prepare an exact review, and retrieve
the completed receipt.

Both routes use one store and the same inquiry operations. WebMCP adds useful
assistance without creating a second consent path or an agent-only shortcut.

### Human authority

The page deliberately does not expose tools for:

- marking assistant suggestions as human-verified;
- confirming the requested business next step;
- permitting a project response;
- permitting optional ongoing updates;
- approving a frozen review;
- returning to editing; or
- resetting browser-local state.

Preparing a review is not approval. Approval binds one review ID, revision,
canonical snapshot, and SHA-256 digest. Any disclosure-affecting edit or permission
change invalidates it. Finalization consumes the frozen review rather than reading
mutable live form values.

### How it was built

- React and TypeScript provide the visible progressive inquiry flow.
- Shared inquiry operations enforce validation, qualification,
  review, permission, approval, retry, and receipt rules.
- One browser store is shared by React and every WebMCP handler.
- The top-level page registers five tools through
  `document.modelContext.registerTool()`.
- Versioned browser storage preserves the fictional rehearsal state and receipt on
  the same origin when storage is available.
- Vitest protects the human-only authority boundary, stale-review rejection,
  frozen-snapshot execution, optional-field rejection, provenance, receipt
  recovery, and tool behavior.

### What we are proud of

- The agent can prepare useful work without acquiring the authority to approve it.
- The requested next step is explicit, so a completed draft is not automatically a
  qualified inquiry.
- Direct project-response permission and optional ongoing updates are separate.
- The review shows an exact payload and invalidates cleanly after edits.
- Repeating finalization for the same approved review cannot create a duplicate
  receipt.
- The result remains understandable without WebMCP because the ordinary form uses
  the same operations.

### What we learned

The most important distinction was not “human versus agent.” It was preparation
versus authority. The useful agent actions are drafting, validating, explaining,
freezing, finalizing an already approved snapshot, and reading the receipt. The
decisions that establish intent and permission belong in visible human controls.

### Honest limitations

- Submission is simulated and is not delivered to Village Alchemist.
- The receipt is durable only while browser storage for that origin remains
  available. It is not server-backed or cross-device.
- `localStorage`, page JavaScript, developer tools, extensions, and the local clock
  are not tamper-proof.
- The digest detects changed canonical content; it does not prove identity,
  comprehension, or when approval occurred.
- There is no backend, database, authentication, CRM, email delivery, analytics,
  telemetry, payment flow, or remote record lookup.
- WebMCP availability depends on the browser or host application; the ordinary form
  is the fallback.
- All displayed contact and project details are fictional demonstration data.

## Exact recording prompt

```text
Help me prepare a Village Alchemist project inquiry. My name is Maya Chen and my email is maya.chen@example.com. I want to turn a rough product idea into a working prototype in eight weeks, with a $15,000–$25,000 constraint. The concept and core audience are defined, but the product flow and technical approach still need shaping. I am requesting a 30-minute discovery call and prefer a reply by email. Use the budget only if I enable its visible inclusion control; otherwise omit it. Draft the inquiry for my review, but do not verify my facts, grant permissions, approve it, or submit it for me.
```

## Exact 60–90 second recording script

| Time | Screen action | Voiceover |
| --- | --- | --- |
| 0:00–0:08 | Show the empty Village Alchemist inquiry and WebMCP status. | “Permission Slip lets an agent prepare a real project inquiry, while the person keeps the final say.” |
| 0:08–0:12 | Turn on the visible “Include budget or constraints” control. | “Maya alone decides whether this optional context can enter the inquiry.” |
| 0:12–0:24 | Paste the prompt. Let the agent inspect requirements and draft the inquiry. | “Maya gives ChatGPT one rough request. The agent discovers the site’s fields and turns it into a structured draft in the live page.” |
| 0:24–0:35 | Show the populated fields and provenance labels. | “The page shows what Maya provided, what the assistant suggested, what was captured automatically, and what still needs human verification.” |
| 0:35–0:50 | Verify the draft, confirm the discovery-call next step, permit a direct email response, and leave ongoing updates off. | “The agent cannot make these decisions. Maya explicitly requests a discovery call, allows a response about this project, and declines unrelated ongoing updates.” |
| 0:50–1:03 | Ask the agent to prepare review; show exact payload, destination, permissions, review ID, revision, and digest. | “The review freezes exactly what will be finalized. Changing anything would invalidate it.” |
| 1:03–1:12 | Click the visible approval control. | “Only Maya can approve this exact snapshot.” |
| 1:12–1:25 | Ask the agent to submit the approved review and retrieve the receipt. | “The agent can now complete only that approved review, and a retry cannot duplicate it.” |
| 1:25–1:30 | Hold on the receipt. | “The receipt records the approved values, requested next step, permissions, provenance, and digest. No network submission occurred.” |

## Recording checks

- Keep the capture between 60 and 90 seconds.
- Use one continuous browser window and one prompt.
- Keep the WebMCP-ready state visible before the first tool call.
- Make the human-only controls and pointer visible when verifying and approving.
- Hold the review long enough to show the exact destination and consequences.
- End on the receipt’s local-only destination and no-network statement.
- Do not imply that the inquiry reached a person, inbox, CRM, or database.
- Do not display real personal information, credentials, browser profiles, or
  unrelated tabs.

## Final submission checklist

- [x] Repository and deployed build contain only fictional demo data.
- [x] `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`
      pass with the current lockfile and installed dependencies.
- [x] The isolated HTTPS preview opens directly and survives refresh.
- [x] All five site tools register on the deployed top-level page.
- [x] Human UI and WebMCP calls reach the same inquiry operations.
- [x] The agent cannot verify values, grant permission, approve, reset, or return to
      editing.
- [x] A draft without an explicitly confirmed relevant next step cannot qualify.
- [x] Direct project-response permission and ongoing-update permission remain
      separate and human-only.
- [x] An edit after review invalidates approval.
- [x] Submission uses the frozen review and a retry does not duplicate the receipt.
- [x] The receipt survives a same-origin refresh when browser storage is available.
- [x] Browser inspection shows no application network request on simulated submit.
- [x] README limitations match the deployed behavior.
- [x] The live URL is added only after deployed-origin smoke testing.
- [x] The final public-text scan contains no prohibited private terminology or
      claims that this narrow inquiry demo represents a broader product.
