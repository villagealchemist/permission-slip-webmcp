# Permission Slip — submission materials

## Submission fields

**Project name:** Permission Slip

**Tagline:** Let the agent help. Keep the final say.

**Short description:** Permission Slip lets an agent prepare a visible intake while
the person controls optional disclosure, approves one exact snapshot, and receives
a local-only disclosure receipt.

**Live app URL:** `[ADD PUBLIC HTTPS URL]`

**Public repository URL:**
`https://github.com/villagealchemist/permission-slip-webmcp` — verify that it is
public and that GitHub detects the MIT license before submission.

**Public demo video URL:** `[ADD PUBLIC YOUTUBE URL]`

## Full Devpost description

### Inspiration

Most agent-enabled forms optimize for completion. We wanted to explore a different
question: how can a person delegate the tedious parts of a consequential form
without silently delegating the decision about what to disclose?

WebMCP is unusually well suited to that problem. The agent and the person can work
through the same live page, but the site still defines narrow actions, validates
their inputs, and keeps meaningful decisions visible. Permission Slip turns those
properties into a concrete consent pattern.

### What it does

Permission Slip is a privacy-first intake demo for a fictional community workshop
at a creative sanctuary. The agent can inspect the requirements, draft a complete
inquiry, update the same form the person sees, and prepare an exact disclosure for
review.

Optional details such as phone, budget, social handle, and notes each begin behind
a human-controlled disclosure toggle. If an agent supplies an unauthorized
optional field, the entire draft operation is rejected without a partial update.
The agent cannot change those permissions through a site tool.

When the draft is ready, the site freezes a canonical snapshot, gives it a unique
review ID, and computes a SHA-256 digest. Submission remains blocked until the
person approves that exact snapshot in the visible page. Any edit or permission
change invalidates the review or approval. A successful simulated submission
creates a receipt showing exactly what was disclosed, what stayed withheld, when
the action occurred, and that the destination was local only.

### Why WebMCP makes it better

Without WebMCP, an agent has to infer labels and operate the visual form one control
at a time. It may miss a privacy cue, use a stale value, or blur the distinction
between preparing and finalizing.

Permission Slip exposes five purpose-built operations with narrow JSON Schemas and
structured results. The agent can reliably learn the current permissions, recover
from a rejected disclosure, and prepare a review, while the person watches the
same state change in the page. The consequential transition remains a deliberate
collaboration: the person approves; the agent submits only the matching snapshot.

This is difficult to express with a remote MCP server because the important context
is the live interface itself—the current draft, the disclosure toggles, the frozen
review, and the person's visible approval.

### How we built it

Permission Slip is a strict TypeScript, React, and Vite single-page application.
Framework-independent domain modules own validation, canonical serialization,
digest generation, state transitions, and receipts. A versioned external store
persists demo state in `localStorage` and provides one source of truth to React and
the WebMCP adapters.

The top-level page progressively registers five imperative WebMCP tools through
`document.modelContext.registerTool()`:

- `get_intake_requirements`
- `draft_intake`
- `prepare_submission_review`
- `submit_approved_intake`
- `get_disclosure_receipt`

Read operations carry `readOnlyHint`. Tool schemas disallow unknown properties,
and handlers independently validate all inputs and disclosure permissions before
committing one complete state update. Registration has an abort-controlled
lifecycle, and callbacks always read current store state rather than stale React
closures. Tools that return human-authored intake values carry
`untrustedContentHint`, and same-origin tabs synchronize durable state before
operations so a stale approval cannot overwrite a newer draft.

The project makes no intake API call. Drafts, reviews, approvals, activity, and
receipts remain in local browser storage, and the simulated Submit action sends no
data from the page to a destination. An external browser agent may separately
process prompts and tool traffic under its own terms, which is why the demo uses
only fictional data. The UI also implements the complete flow without WebMCP, so
site tools are a progressive enhancement instead of a runtime dependency.

### Challenges

The hardest part was preserving one consent invariant across two actors and two
interfaces. A review has to remain valid while the person and agent can both edit
the live page, and an asynchronous digest must never bless a stale draft. We made
the state transitions explicit, canonicalized the reviewed disclosure, and
rechecked review ID, revision, digest, and approval at submission time.

The other challenge was drawing an honest boundary around an experimental browser
API. JSON Schema is useful metadata, but runtime validation and authorization still
belong to the application. Likewise, SHA-256 can bind approval to a snapshot without
turning `localStorage` into tamper-proof storage or proving human identity.

### Accomplishments

- A complete human-agent workflow rather than a standalone tool-call proof of
  concept.
- Atomic rejection of unauthorized optional disclosure.
- Exact-snapshot review and approval invalidation after edits.
- A local receipt that makes disclosed and withheld information equally visible.
- One domain model shared by the ordinary UI and five WebMCP tools.
- Graceful operation in browsers without WebMCP.
- Focused automated coverage of the consent state machine, persistence, and tool
  registration.

### What we learned

Human approval is more useful when it names a concrete artifact. “The user approved
this form” is ambiguous; “the user approved review R with digest D, and the draft
still matches D” is testable.

We also learned that privacy can be demonstrated as a positive product outcome.
The withheld fields are not missing data—they are part of the receipt and part of
the success story.

### What is next

Permission Slip deliberately stops before production infrastructure. A real system
would need authenticated identities, server-side authorization and audit storage,
destination verification, retention controls, stronger replay protection, and an
accessibility and security review. The useful next experiment is to apply the same
exact-snapshot consent pattern to a real service without weakening the visible
human gate.

### Technologies used

Vite, React, TypeScript, plain CSS, WebMCP, `webmcp-types`, Web Crypto API,
`localStorage`, Vitest, ESLint, npm, and GitHub Actions.

## Judging alignment

| Criterion | Evidence in Permission Slip |
| --- | --- |
| WebMCP Leverage | Five complementary read/write tools form a recoverable multi-step workflow, update the live UI, and share its current permissions and state. |
| Execution | A coherent responsive product works manually and through WebMCP, persists locally, rejects unsafe transitions, and is covered by automated checks. |
| Potential Impact | The project offers a specific consent pattern for any workflow where agents help prepare information but people retain disclosure and finalization decisions. |
| Creativity & Ambition | It treats withholding as a first-class outcome and binds human approval to one visible, digestible snapshot rather than a vague session-level confirmation. |

## Demo video: 2 minutes 30 seconds target

Record at 1080p with the deployed app and ChatGPT's built-in browser visible side by
side. Use only the fictional Maya Chen data. Keep the cursor deliberate, browser
zoom legible, and narration continuous. Pre-stage both windows and use honest jump
cuts to remove model wait time while preserving the order of calls and results. Do
not add copyrighted music.

| Time | Picture | Narration / action |
| --- | --- | --- |
| 0:00–0:12 | Hero, local-only notice, and WebMCP status | “Most agent-enabled forms optimize for completion. Permission Slip optimizes for informed delegation: the agent can help, while the person keeps the final say.” |
| 0:12–0:27 | Required, optional, and never-collected lists; phone toggle off | “This fictional workshop intake separates required details, optional details the human may authorize, and categories the site never collects. Phone begins unauthorized, and the final submit action is local only.” |
| 0:27–0:40 | Site tools panel showing five tools | “The top-level page exposes five narrow WebMCP tools. The ordinary interface and every tool use the same state machine.” |
| 0:40–1:02 | Paste the Maya prompt; agent reads requirements and drafts | “I ask the agent to prepare a 20-person workshop inquiry and explicitly tell it to respect the site's current permissions.” |
| 1:02–1:20 | Phone is withheld, or a deliberate phone test is rejected before a compliant retry updates the form | “A compliant agent can withhold phone immediately. If it supplies phone, Permission Slip rejects the whole operation—no partial mutation—and explains how to retry. The accepted draft appears in the exact form I see.” |
| 1:20–1:38 | Agent prepares review; review ID, digest, disclosed/withheld groups appear | “The agent can prepare, but not approve. Review freezes a canonical snapshot with a unique ID and SHA-256 digest. Required disclosure and withheld phone are shown separately.” |
| 1:38–1:50 | Pre-approval submit call returns blocked | “Even with the review ID, submission fails because human approval does not yet exist. State remains unchanged.” |
| 1:50–2:04 | Human clicks Approve | “I—not a WebMCP approval tool—approve this exact visible disclosure. An edit now would invalidate the approval.” |
| 2:04–2:20 | Agent submits and fetches receipt | “Now the agent submits the still-matching snapshot locally and retrieves a receipt.” |
| 2:20–2:30 | Receipt close-up: disclosed, withheld, local destination, no transmission | “The receipt records both what was shared and what was protected. Permission Slip: let the agent help; keep the final say.” |

### Prompt used in the video

```text
Help me prepare an inquiry for a 20-person creative coding and mentorship workshop on October 10, 2026. The goal is to pair early-career developers with local mentors for a collaborative workshop. My name is Maya Chen and my email is maya.chen@example.com. My phone is 215-555-0134, but use only information the site says is required or currently authorized. Prepare the inquiry for my review, but do not submit it until I approve the exact disclosure in the page.
```

If the agent correctly withholds phone, use this optional follow-up only when a
deterministic guardrail-rejection shot is useful:

```text
For a deliberate policy test, call draft_intake with the same complete draft plus phone 215-555-0134 while the phone disclosure toggle remains off. After the expected rejection, retry the same complete draft without phone.
```

For the deliberate gate shot, follow with:

```text
Call submit_approved_intake with the review ID now so I can verify that the local demo rejects submission before human approval.
```

After clicking the visible approval control yourself, follow with:

```text
Submit the approved review now, then retrieve the disclosure receipt and summarize what was disclosed and withheld.
```

## Known limitations and compatibility

- WebMCP is an experimental proposed standard, and ChatGPT's built-in browser
  currently implements a subset.
- At submission time, official OpenAI documentation recommends the latest ChatGPT
  desktop app with GPT-5.6 Sol or GPT-5.6 Terra. GPT-5.6 Luna has WebMCP disabled;
  site tools are not available in Enterprise or Edu workspaces; rollout may vary.
- Permission Slip registers imperative tools in the top-level page. It does not use
  unsupported declarative form tools or iframe registration.
- The local in-app-browser probe discovered and exercised all five tools. That
  browser build omitted the draft API's invocation context argument; handlers
  therefore retain cancellation when a signal exists and use an inert fallback
  when it does not. The deployed origin still needs a final compatibility pass.
- The simulated submission and receipt exist only in `localStorage` for one browser
  origin. There is no real destination, cross-device history, or network delivery.
- If `localStorage` is unavailable, the app safely falls back to in-memory state for
  that page session, without reload persistence.
- An external browser agent may process prompts, tool inputs, and tool results under
  its own terms. The no-network claim is limited to Permission Slip's simulated
  submission path, and all supplied demo information is fictional.
- The digest demonstrates snapshot consistency, not human identity, non-repudiation,
  or tamper-proof storage.
- Approval is intentionally absent from the WebMCP tool surface. The demo does not
  claim to prevent every general-purpose browser automation path.
- The fictional scenario is safe for demonstration; this prototype has not been
  security-certified for real personal or regulated data.

## Final submission checklist

### Product and verification

- [ ] Run `npm ci` from a fresh clone.
- [x] Run `npm run typecheck` with no errors.
- [x] Run `npm run lint` with no errors.
- [x] Run `npm run test` with no failures.
- [x] Run `npm run build` successfully and smoke-test `npm run preview`.
- [x] Test the complete ordinary-form flow in a browser without WebMCP.
- [ ] Test all five tools in the latest ChatGPT desktop app with GPT-5.6 Sol or
      GPT-5.6 Terra.
- [x] Confirm a phone disclosure is rejected while unauthorized and does not
      partially mutate the draft.
- [x] Confirm submission fails before approval and succeeds after approval.
- [x] Confirm an edit invalidates the review/approval.
- [x] Confirm the receipt is accurate and the simulated submit makes no network
      request.
- [x] Check keyboard operation and narrow/mobile layout.

### Repository and deployment

- [ ] Make the repository public and verify the URL above while signed out.
- [ ] Verify GitHub detects `LICENSE` as MIT and displays it at the top of the
      repository page/About area.
- [ ] Confirm the public repository contains all source, assets, and setup
      instructions required for a fresh clone.
- [ ] Review the public tree and history for secrets, real personal information,
      generated clutter, and unfinished core TODOs.
- [ ] Deploy the `dist` build to an unauthenticated HTTPS URL.
- [ ] Verify direct load, reload, five-tool discovery, and the full flow on the live
      origin.
- [ ] Keep the app free and available through September 21, 2026 at 5:00 PM Pacific.

### Video and Devpost

- [ ] Verify entrant eligibility, join the challenge on Devpost, and save a draft
      submission early.
- [ ] Record a clear demo with audio that stays under 3:00.
- [ ] Use only original project visuals and voice; do not add unlicensed music,
      trademarks, or third-party copyrighted material.
- [ ] Upload the video publicly to YouTube and verify playback while signed out.
- [ ] Replace every bracketed URL placeholder in this file.
- [ ] Replace the screenshot and video placeholders in `README.md`.
- [ ] Paste the English description and technologies into Devpost.
- [ ] Confirm the live URL, public repository URL, and public YouTube URL are exact.
- [ ] Submit before September 3, 2026 at 1:00 PM Pacific / 4:00 PM Eastern.
- [ ] Reopen the submitted entry and capture proof that Devpost received it.
