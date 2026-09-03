# Permission Slip delivery guide

- Deadline: September 3, 2026 at 4:00 PM Eastern. Favor a complete, demonstrable vertical slice.
- Keep the project browser-only: no backend, database, authentication, remote API, analytics, or telemetry.
- Never use real personal information. The supplied Maya Chen details are fictional demo data.
- Keep domain rules in `src/domain`, state/persistence in `src/store`, WebMCP adapters in `src/webmcp`, and presentation in React components.
- The human UI and WebMCP handlers must call the same domain operations and share one store.
- Preserve the approval invariant: only the visible human UI can approve; any pre-submission edit invalidates the review and approval.
- WebMCP is progressive enhancement. Register imperatively on top-level `document.modelContext`; do not add a runtime polyfill.
- Do not stop after scaffolding. Before delivery, run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- Never claim the digest proves identity or that localStorage is tamper-proof. Submission is simulated and sends no network request.
- Do not push, deploy, or change external services without explicit authorization.
