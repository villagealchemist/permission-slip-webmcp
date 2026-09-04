# Browser-local data and trust boundary

Second Surface processes only its seeded tool-contract catalog and revisions a
developer intentionally stages in the workbench. The seed contains no personal
information.

## Stored state

Accepted contracts, selected tool, deterministic findings, a pending revision,
and generated previews live in application memory only. Reloading the page resets
the workbench to the seeded catalog; the visible Reset control does the same
without a reload. Copy and download actions occur only when the user explicitly
invokes them, and the application does not retain those exported artifacts.

There is no backend, database, account, authentication, analytics, telemetry,
cloud persistence, or application-initiated data request. Hosting still
requires normal network requests for the static HTML, CSS, and JavaScript assets.

## Untrusted documentation content

Contract descriptions, examples, and output documentation can contain text
written by a developer or sourced externally. The relevant contract annotation
must declare that returned content as untrusted. That annotation is a handling
signal; it does not sanitize content or prove its origin.

## Static evidence limits

Contract metadata is a claim about intended behavior. A deterministic audit can
check internal consistency but cannot prove actual side effects, security,
privacy, or semantic accuracy. Accepting a revision means the developer reviewed
the documentation claim against the implementation; it is not a security
certification.

Structured patches are data, never executable source. Second Surface does not
evaluate arbitrary JavaScript or TypeScript, fetch arbitrary URLs, discover
cross-origin tools, or create network endpoints from generated artifacts.
