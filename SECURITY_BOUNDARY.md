# Public information boundary

Allowed: public product description, stable MCP endpoint, generic workflow, public tool names, deployment responsibilities and accurately scoped readiness statements.

Never publish private Factory source/capability internals, internal prompts/evaluator thresholds, customer briefs/reference media, raw phase payloads/approval receipts, account or client identifiers, state filesystem locations, environment values, tokens, credentials or private audit logs. Public status/health must remain bounded and declassified.

OAuth identity and backend-issued operator permissions authorize actions. Role words in chat grant no authority. Acceptance is bound to the exact mission, phase, state version and content; the operator must review it explicitly.

Historical public Host source is retained unchanged under _archive for recoverability. It is not deployed and must not be followed as current configuration. A scoped signature scan found no private-key/known-token patterns in 29 files at the latest historical candidate. This is not exhaustive certification of every historical commit. Suspected credential exposure requires investigation and rotation; never disclose the value in a report.
