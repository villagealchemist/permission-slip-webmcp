# Second Surface — 75-second demo card

Open the [live judge preview](https://judge-demo-second-surface-webmcp-preview.mjohnson1307.workers.dev/)
in a WebMCP-capable browser with ChatGPT.

## 0:00–0:12 — frame the problem

Show the five-tool catalog and accepted revision 1.

> Every WebMCP-enabled site has a second interface: the one its users' agents
> see. Second Surface makes that interface visible, auditable, and
> self-documenting.

## 0:12–0:40 — let the agent inspect and propose

Paste the prompt already shown in the hero:

> Audit the WebMCP catalog currently loaded in Second Surface. Identify only
> problems supported by the contract data, propose the smallest revision that
> makes the tools unambiguous and testable, and stage the revision in the
> workbench. Do not invent behavior or accept your own changes.

As ChatGPT calls `list_tool_contracts`, `get_tool_contract`,
`audit_tool_contracts`, and `propose_contract_revision`, point out the visible
six-finding audit, exact before/after diff, and projected issue reduction.

## 0:40–0:57 — show the human boundary

> The agent can inspect, audit, and stage a bounded patch. It cannot accept its
> own proposal.

Use the visible **Accept revision** control. Run the audit again and show the
accepted revision increment plus the reduced finding count.

## 0:57–1:15 — prove one-source documentation

Ask ChatGPT to call `preview_contract_bundle`. Switch across registration
metadata, contract JSON, Markdown, and OpenAPI. Point to the OpenAPI disclaimer:
it is a documentation projection, not a network endpoint.

Close with:

> Swagger made HTTP APIs inspectable. Second Surface makes the agent-facing
> interface of a website inspectable—and WebMCP lets the agent help improve the
> very contract it has to use.

## Accuracy guardrails

- Do not claim the static audit proves runtime behavior, security, privacy, or
  semantic truth.
- Do not call the OpenAPI projection an HTTP API or endpoint.
- Do not claim the workbench replaces browser developer tools.
- Do not claim agent approval: acceptance, rejection, and reset are visible
  human-only controls.
