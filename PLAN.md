# Permission Slip implementation plan

Deadline: September 3, 2026 at 4:00 PM Eastern.

## Milestones

- [x] Inspect the greenfield repository and current WebMCP documentation.
- [x] Decide the domain, store, WebMCP, UI, testing, and release architecture.
- [x] Scaffold strict Vite, React, TypeScript, Vitest, and ESLint tooling.
- [x] Run the capped top-level WebMCP compatibility probe.
- [ ] Implement and test the consent state machine and persistence.
- [ ] Build the complete responsive human workflow.
- [ ] Register and test the five WebMCP tools.
- [ ] Add CI, README, submission copy, and MIT license.
- [ ] Pass typecheck, lint, tests, build, and final diff review.
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
