# GLOW VIDEO HOST — one deployment/connection owner

**Purpose:** public-safe Hostinger Node 22 assembly and MCP/OAuth connection **host** for the private [`GLOW-VIDEO-FACTORY`](https://github.com/digitaltavi-source/GLOW-VIDEO-FACTORY). The **Factory** owns Governance, Process, Capability, mission state and media quality. This repository owns only host wiring, declassified connection documentation and fail-closed deployment checks. Do **not** duplicate Factory logic, admit skills/capabilities here, copy its private source, or create a new active Process owner.

The historic [`/mcp-v2`](docs/CONNECT.md) endpoint remains the single canonical ChatGPT plugin URL. **Do not change DNS, Auth0, Supabase, ChatGPT app registration, or the old Hostinger app as part of this source-only work.** Auth0 on GLOW-WEB-HOST is a useful *security pattern*, not a credential/configuration transplant. Video retains its explicitly governed Supabase resource/client-bound OAuth grant unless changed through its own approved gate.

## Minimal assembly model

```text
GLOW-VIDEO-FACTORY (PRIVATE; candidate source + Host Adapter + runtime)
  -> independently reviewed release / private artifact transport (separate authorization)
  -> GLOW-VIDEO-HOST (PUBLIC; this assembly launcher only)
  -> Hostinger staging (Node22, OAuth, private artifact, external durable state)
  -> stable HTTPS /mcp-v2 -> ChatGPT's existing GLOW VIDEO app
```

The executable Host Adapter **is not copied** from the private repository into the public Git tree. A separately authorized, declassified and integrity-checked **private runtime bundle** must be provisioned into untracked `private-runtime/` at assembly time. Its dependency tree, compiled server, factory-bundle and identity files must form one closed artifact set. This repository does not acquire those artifacts by itself. No configured bundle = **BLOCK**, not a fake healthy MCP endpoint. Hostinger auto-deploy from this repo alone cannot become a functional factory.

## Commands and limits

```bash
npm test       # 10 offline/negative assembly tests; no provider calls
npm run build  # fail-closed: verify PRIVATE artifact + env before staged deployment
npm start      # same verification then spawn the approved private runtime
```

No third-party Node dependencies, duplicated MCP routes, private secrets, or customer data are committed to this public repo. `.gitignore` prevents ordinary additions of private runtime and `.env` files. The checks bind the entire declared file inventory to a SHA-256-pinned manifest; they prove **declared byte integrity**, not independent source provenance or live-process identity.

### Assembly input contract (operator-held, **not** a published credential)

At deployment, supply `private-runtime/assembly-manifest.json`, for example:

```json
{
  "contract": "GLOW_VIDEO_HOST_ASSEMBLY_V1",
  "factory_repository": "digitaltavi-source/GLOW-VIDEO-FACTORY",
  "source_commit": "0000000000000000000000000000000000000000",
  "entry": "dist/src/server.js",
  "files": [{"path": "dist/src/server.js", "sha256": "<SHA256_OF_REAL_FILE>"}]
}
```

**Example only (all-zero commit is a dummy, not an approved source):** a real bundle must enumerate **every** file needed by the private runtime, not only the entry file. The assembly process rejects missing, extra, symlinked, out-of-tree or modified files and requires an operator-approved source SHA + manifest SHA in the deploy environment. The source SHA is a *declaration* until verified against the actual approved Factory release by a separate build/assurance process.

### Required deploy environment

- `GLOW_GATEWAY_PROFILE=DEMO` initially (never publish `PRODUCTION` without its release gate).
- `GLOW_PUBLIC_MCP_URL=https://<approved-host>/mcp-v2` and, when set, consistent `GLOW_PUBLIC_ORIGIN`.
- `GLOW_AUTH_MODE=oauth`, `GLOW_OAUTH_AUTHORIZATION_PROFILE=SUPABASE_RESOURCE_GRANT`, issuer/JWKS HTTPS URLs, audience and actual **allowlisted client IDs**; do not reuse GLOW WEB Auth0 tokens.
- `GLOW_V2_STATE_DIR` absolute, durable and **outside** the deployment tree; preserve legacy state, never overwrite or auto-migrate.
- `GLOW_VIDEO_APPROVED_SOURCE_SHA` (40-character exact approved commit) and `GLOW_VIDEO_ASSEMBLY_MANIFEST_SHA256` (SHA-256 of approved manifest raw bytes).
- Private OAuth credentials, JWT and service secrets only in Hostinger's protected environment. Never commit, log or paste them.

**Exact Hostinger root:** this public repo root; build `npm run build`, entry/start `npm start` **only after** an authorized private artifact assembly mechanism is established. The previous private-repo Host Adapter still has its own build root and entrypoint; do **not** silently reuse those stored settings for this new public host root. Read back stored build settings before any promotion, preserve rollback and ensure the persistent directory survives restart.

## Gate sequence

1. **READ_ONLY:** inspect existing Hostinger site, state/backup, OAuth issuer/client grants, installed plugin URL and rollback identity.
2. **BUILDER PREP:** frozen source SHA + private runtime bundle + manifest/inventory + source/rights and permission review; `npm test` / `npm run build` must pass on assembled directory.
3. **INDEPENDENT AUDIT:** clean cross-platform and security evidence, no false-green/skipped evidence promotion.
4. **OWNER-AUTHORIZED STAGING:** deploy without replacing the existing production app. Verify `/healthz`, `/readyz`, MCP tool discovery, OAuth signed token scopes/RBAC, restart persistence, missing-backend failure and rollback. `/system/identity` is a declared identity, **not** a substitute for runtime attestation.
5. **REAL PRODUCT TRIAL:** only after separate Factory Process gates and user authorization for any provider, media, commercial rights and spend. A video output alone is not Factory qualification.

**Current status:** `PUBLIC_HOST_ASSEMBLY_CANDIDATE / LOCAL_DEV_TEST_ONLY / PRIVATE_BUNDLE_NOT_PROVISIONED / STAGING_NOT_DEPLOYED / NOT_RELEASED`. No main/private Factory source or production endpoint is changed by authoring this Host repo.
