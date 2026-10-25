# GLOW VIDEO — MCP/Hostinger connection

## Existing application (preserve)

Canonical installed GLOW VIDEO URL as recorded in the private Factory commissioning notes:

`https://peachpuff-frog-205135.hostingersite.com/mcp-v2`

This is a **documented binding**, not an assertion that its deployed code matches the newest private Factory source. Do not switch the ChatGPT app, domain, DNS, Auth0/Supabase application or its callbacks merely because this public host repository has a new commit. Refresh tools only after live exact-SHA and OAuth tests succeed.

## Lean connection discipline borrowed from GLOW-WEB-HOST

- Exactly one public MCP resource `/mcp-v2`, no parallel experimental `/mcp-v3` or repeated plugin registrations.
- Verify the **actual OAuth request**: JWT signature, issuer, audience, expiry, client/resource binding, scope and operator RBAC. A successful login does not itself grant phase-acceptance or evidence-admission authority.
- Fail closed for missing private runtime or unavailable durable state; `/healthz` alone must not be mistaken for Factory readiness.
- Keep `GOVERNANCE > PROCESS + CAPABILITY`; the Host has neither mission-flow authority nor hard-capability admission powers.
- Capture source SHA + assembled manifest hash + deployment record + negative tests + rollback. Never equate baked metadata with a live-process attestation.

GLOW WEB uses Auth0 and separately scoped evidence/acceptance permissions. GLOW VIDEO's current Host Adapter uses **Supabase** OAuth with `SUPABASE_RESOURCE_GRANT`; copy the security **questions**, not keys, token claims, provider configuration or Web-specific rights.

## Hostinger staged verification (no destructive change in this repository task)

1. Read actual application site/domain, stored Node/build-root settings, entrypoint, app version, masked environment keys and existing process log.
2. Check HTTPS TLS and resource discovery, then `/healthz` and `/readyz` (two separate observations). An offline document cannot prove live availability.
3. Check authenticated MCP tool inventory with a real approved identity; test anonymous 401, wrong client/resource, no privilege, stale token and correct scoped access.
4. Perform a restart/persistence/recovery trial using an isolated staging mission and external durable state, never overwrite customer mission history.
5. Only after Audit/Owner gate, run a real media mission with explicit provider rights/cost limits and independent creative review.

Secrets, access tokens, approval decisions and client/customer files belong in authorized protected systems; do not add them to GitHub or this document. If any live item is missing, use `NOT_EXECUTED/BLOCKED` with the specific missing evidence.
