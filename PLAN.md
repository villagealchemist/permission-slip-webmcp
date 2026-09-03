# Permission Slip implementation plan

Deadline: September 3, 2026 at 4:00 PM Eastern.

## Milestones

- [x] Inspect the greenfield repository and current WebMCP documentation.
- [x] Decide the domain, store, WebMCP, UI, testing, and release architecture.
- [x] Scaffold strict Vite, React, TypeScript, Vitest, and ESLint tooling.
- [x] Run the capped top-level WebMCP compatibility probe.
- [x] Implement and test the consent state machine and persistence.
- [x] Build the complete responsive human workflow.
- [x] Register and test the five WebMCP tools.
- [x] Add CI, README, submission copy, and MIT license.
- [x] Pass typecheck, lint, tests, build, and final diff review.
- [x] Baseline the green application before the focused contract pass.
- [x] Centralize all five WebMCP contracts and project runtime registration from them.
- [x] Add the static Contract Explorer and deterministic documentation generators.
- [x] Document architecture, WebMCP behavior, privacy boundaries, and exported APIs.
- [x] Re-run documentation, typecheck, lint, tests, build, visual smoke checks, and final diff review.
- [ ] With separate authorization: push, deploy, test the live app, record the video, and submit to Devpost.

## Non-negotiable behavior

- A review freezes one canonical disclosure snapshot and SHA-256 digest.
- Approval applies only to that review, digest, and draft revision.
- Edits invalidate review and approval.
- Agents cannot authorize optional fields, approve a review, or reset the demo.
- Unauthorized optional input rejects the complete tool call without changing the draft.
- Submission finalizes only the frozen approved snapshot and produces a local receipt.

## Verification notes

- 2026-09-03: The in-app browser discovered the top-level imperative
  `permission_slip_probe` registration at `http://127.0.0.1:5173/` and invoked it
  successfully. This proves local browser exposure; live ChatGPT discovery still
  requires the deployed-site test described in `SUBMISSION.md`.
- No restrictive Content Security Policy will be introduced before deployed WebMCP
  compatibility is proven.
- Domain and store verification: 25 focused tests cover atomic disclosure gating,
  snapshot review, approval invalidation, receipts, reset, persistence recovery,
  cross-tab synchronization, and stale asynchronous operations. The complete
  suite contains 36 tests across four files.
- The completed in-app-browser path discovered all five tools, rejected an
  unauthorized phone atomically, drafted visibly, froze a review, blocked an
  unapproved submit, accepted visible human approval, submitted, and read the
  receipt. The current browser build omitted invocation options, so handlers use
  its absence-safe fallback while preserving supplied cancellation signals.
- A Chrome DevTools Protocol `Network.requestWillBeSent` trace observed zero
  requests during the successful simulated submission.
- The final production bundle registered the same five tools at
  `http://127.0.0.1:4174/`, completed the gated flow, and again produced zero
  submission-time network requests. At 390 by 844 CSS pixels, document and body
  scroll widths remained exactly 390 pixels.
