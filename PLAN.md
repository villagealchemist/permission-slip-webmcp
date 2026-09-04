# Permission Slip delivery plan

Deadline: September 3, 2026 at 4:00 a.m. in the stated hackathon timezone.

The delivery target is one complete, repeatable Village Alchemist project-inquiry
demonstration. This checklist is evidence-driven: do not mark an item complete
until the implementation and named verification pass.

## Product promise

The agent can turn a rough project request into a structured inquiry. The person
alone verifies the draft, confirms the requested next step, permits a direct
project response, decides whether to receive optional ongoing updates, and approves
the exact frozen snapshot.

Finalization is simulated and browser-local. It creates a same-origin receipt and
sends no inquiry over the network.

## Scope

Build only:

- one Village Alchemist project/collaboration inquiry;
- one shared set of inquiry operations for the human UI and WebMCP;
- one explicit-intent qualification decision;
- one human-only verification and permission path;
- one snapshot-bound review and approval path;
- one idempotent browser-local finalization path;
- one understandable receipt; and
- one 60–90 second rehearsal.

Do not add a backend, database, authentication, account system, admin view, CRM,
email vendor, analytics, telemetry, lead scoring, workflow builder, or another
business vertical.

## P0 — complete before deployment polish

- [ ] Align copy and fields around one credible project inquiry:
      goal, desired outcome, relevant background, timeline, budget or constraints,
      contact details, preferred response method, and requested next step.
- [ ] Keep missing or ambiguous values visible; do not manufacture inferred facts.
- [ ] Record useful field provenance: person-provided, assistant-suggested,
      automatically captured, and explicitly human-verified.
- [ ] Require a human-confirmed relevant next step before the inquiry can qualify.
- [ ] Require separate human permission for a direct response about this project.
- [ ] Keep optional ongoing updates separate, human-only, and off by default.
- [ ] Keep all permission, verification, editing/reset, and approval actions out of
      the WebMCP tool list.
- [ ] Make the review show the exact normalized snapshot, destination, requested
      next step, permissions, consequences, review ID, revision, and digest.
- [ ] Invalidate review and approval after every disclosure-affecting edit or
      permission change.
- [ ] Execute the frozen reviewed snapshot rather than reading mutable form state.
- [ ] Make repeat finalization of one approved review return the same result without
      creating a duplicate receipt.
- [ ] Produce an understandable receipt with outcome, stable ID, timestamp,
      destination, requested next step, permissions granted and withheld,
      provenance, review revision, and digest.
- [ ] Preserve an ordinary-browser fallback and explicit no-WebMCP state.
- [ ] Provide clear empty, validation, review, stale-review, approval, retry,
      success, failure, and reset behavior.
- [ ] Pass responsive layout, keyboard focus, semantic-control, and reduced-motion
      checks.

## Required focused tests

- [ ] UI and WebMCP reach the same inquiry operations and store.
- [ ] No qualified inquiry exists before explicit human next-step confirmation.
- [ ] The agent facade exposes no verification, permission, approval, editing, or
      reset operation.
- [ ] Unauthorized optional agent input is rejected atomically.
- [ ] Every post-review mutation invalidates approval.
- [ ] Executed payload equals the frozen reviewed payload.
- [ ] Field and entry provenance survive finalization.
- [ ] A retry returns the existing receipt and creates no duplicate.
- [ ] Successful finalization produces the complete receipt.
- [ ] Expected failure remains understandable and does not create a false success.
- [ ] Same-origin refresh recovers valid state and rejects malformed state.
- [ ] The complete fictional WebMCP golden path passes.

## P1 — preview and judge readiness

- [ ] Run `npm ci`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Smoke-test the production bundle with `npm run preview`.
- [ ] Scan public text and source for private terminology, reusable-system claims,
      secrets, real personal data, and unrelated project references.
- [ ] Upload only `dist/` as an isolated Cloudflare Workers Static Assets version
      and use its versioned preview URL without promoting traffic.
- [ ] Do not add Worker code, a database, a custom domain, production route,
      analytics, or another Cloudflare resource.
- [ ] Smoke-test direct navigation, refresh, mobile layout, console, network,
      WebMCP registration, stale review, finalization retry, and receipt recovery on
      the deployed origin.
- [ ] Record the exact live URL only after those deployed-origin checks pass.
- [ ] Rehearse the single fictional prompt and 60–90 second script in
      `SUBMISSION.md`.

## Acceptance evidence

The completion report must include:

1. the tested preview URL, if deployment completed;
2. the exact recording prompt and 60–90 second script;
3. a concise changed-file summary;
4. every verification command and its result;
5. browser smoke-test observations;
6. known limitations; and
7. explicit confirmation that:
   - UI and WebMCP share the same inquiry operations;
   - the agent cannot verify, grant permission, or approve;
   - edits invalidate reviewed approval;
   - explicit intent gates qualification;
   - retries do not duplicate the receipt;
   - the receipt reflects the frozen reviewed snapshot;
   - simulated submission sends no application request; and
   - public artifacts contain no private terminology or broader-product claims.

## Stop conditions

Pause only for a missing named credential, an irreversible action outside the
authorization, or a decision that materially changes this single-inquiry scope.
Never print, copy, or commit credentials.
