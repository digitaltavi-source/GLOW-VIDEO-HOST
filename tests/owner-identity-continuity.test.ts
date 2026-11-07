import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { getV2Bridge, getNativeStudioWorker, killNativeStudioWorkerForTest } from "../src/bridge.js";
import {
  authenticateGlowNativePrincipalAsync,
  checkAuthRateLimit,
  createJwtVerifier,
  describeGoogleOidcConfiguration,
  exchangeGlowNativeAuthCode,
  generateTotpCode,
  isGlowTokenRevoked,
  issueGlowNativeAuthCode,
  issueGoogleOidcTransaction,
  loadOAuthConfig,
  parseOwnerIdentityMap,
  resetAuthRateLimitsForTests,
  resolveOwnerIdentity,
  revokeGlowAccessToken,
  signStudioGatewayActor,
  verifyGoogleOidcIdToken,
} from "../src/oauth.js";

const repoRoot = path.resolve(process.cwd(), "..", "..", "..");
const sharedState = fs.mkdtempSync(path.join(os.tmpdir(), "gvf2-owner-continuity-shared-"));
test.after(() => {
  try {
    fs.rmSync(sharedState, { recursive: true, force: true });
  } catch {}
});
const LEGACY = { issuer: "https://fqmirbdscpioeeofpkpe.supabase.co/auth/v1", sub: "14d9f088-c6d1-4d07-8bf1-5a5822a5a9f7" };
const NATIVE = { issuer: "https://peachpuff-frog-205135.hostingersite.com", sub: "founder-native-member" };
const OTHER = { issuer: NATIVE.issuer, sub: "other-tenant-member" };

const canonical = (v: any): any =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
      : v;
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");

test("owner identity map: strict parsing, exact-match only, unmapped identities pass through unchanged", () => {
  const map = parseOwnerIdentityMap(`${NATIVE.issuer}|${NATIVE.sub}>${LEGACY.issuer}|${LEGACY.sub}`);
  assert.deepEqual(resolveOwnerIdentity(map, NATIVE.sub, NATIVE.issuer), { subject: LEGACY.sub, issuer: LEGACY.issuer });
  assert.deepEqual(resolveOwnerIdentity(map, OTHER.sub, OTHER.issuer), { subject: OTHER.sub, issuer: OTHER.issuer });
  // same subject under a different issuer is NOT mapped
  assert.deepEqual(resolveOwnerIdentity(map, NATIVE.sub, "https://evil.example/"), { subject: NATIVE.sub, issuer: "https://evil.example/" });
  assert.deepEqual(resolveOwnerIdentity(map, NATIVE.sub, undefined), { subject: NATIVE.sub, issuer: "" });
  assert.equal(parseOwnerIdentityMap("").size, 0);
  for (const bad of ["a|b", "a|b>c", "a|b>c|d>e|f", "a>b", "|b>c|d", `x|y>${LEGACY.issuer}|${LEGACY.sub} x|y>q|r`])
    assert.throws(() => parseOwnerIdentityMap(bad), /CONFIG_OWNER_IDENTITY_MAP_(INVALID|DUPLICATE)/, bad);
});

test("owner continuity through the real bridge: mapped Native owner reaches legacy mission; unmapped tenant is denied", { timeout: 60000 }, async () => {
  const bridge = await getV2Bridge(repoRoot, sharedState);
  const perms = ["video.accept"];
  const scopes = ["video.run", "video.accept"];
  const call = (id: { issuer: string; sub: string }, operation: string, input: any) =>
    bridge.call(id.sub, { operation, input }, { subject: id.sub, issuer: id.issuer, auth_mode: "oauth", permissions: perms, scopes });
  const map = parseOwnerIdentityMap(`${NATIVE.issuer}|${NATIVE.sub}>${LEGACY.issuer}|${LEGACY.sub}`);
  const asServer = (id: { issuer: string; sub: string }) => {
    const o = resolveOwnerIdentity(map, id.sub, id.issuer);
    return { issuer: o.issuer, sub: o.subject };
  };

  // Mission created before cutover under the legacy identity.
  const started = await call(LEGACY, "start_professional_mission", { mission_id: "M-OWNER-MAP", project_id: "P-OWNER-MAP" });
  assert.equal(started.status_code, 200, JSON.stringify(started.body));

  // After cutover the verified Native member is mapped to the same owner and can read it.
  const ownerView = await call(asServer(NATIVE), "get_status", { mission_id: "M-OWNER-MAP" });
  assert.equal(ownerView.status_code, 200, JSON.stringify(ownerView.body));

  // A different Native tenant (unmapped) and an unmapped Native-looking identity must be denied.
  const crossTenant = await call(asServer(OTHER), "get_status", { mission_id: "M-OWNER-MAP" });
  assert.notEqual(crossTenant.status_code, 200);
  // Without the map the Native member would not reach the legacy mission either (fail-closed default).
  const unmapped = await call(NATIVE, "get_status", { mission_id: "M-OWNER-MAP" });
  assert.notEqual(unmapped.status_code, 200);
});

test("A7-05 & A7-06: Google OIDC server-side JWT verification, iss+sub binding, nonce anti-replay, token revocation & rate limiting", { timeout: 30000 }, async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "gvf2-oidc-revocation-"));
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "google-test-kid", alg: "RS256", use: "sig" };
  const jwksServer = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((r) => jwksServer.listen(0, "127.0.0.1", r));
  const jwksPort = (jwksServer.address() as any).port;
  const googleClientId = "9766c929-test-client.apps.googleusercontent.com";
  const testEnv: NodeJS.ProcessEnv = {
    ...process.env,
    GLOW_GOOGLE_OIDC_CLIENT_ID: googleClientId,
    GLOW_GOOGLE_OIDC_POLICY_ACCEPTED: "1",
    GLOW_GOOGLE_OIDC_JWKS_URL: `http://127.0.0.1:${jwksPort}/certs`,
    GLOW_OAUTH_STATE_DIR: state,
    GLOW_AUTH_RATE_LIMIT_MAX_REQUESTS: "3",
    GLOW_AUTH_RATE_LIMIT_WINDOW_SEC: "60",
  };

  try {
    const signGoogleToken = async (opts: {
      iss?: string;
      aud?: string;
      azp?: string;
      sub?: string;
      email?: string;
      emailVerified?: boolean;
      nonce?: string;
      expOffsetSec?: number;
    }) => {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        email: opts.email ?? "creator@example.com",
        email_verified: opts.emailVerified ?? true,
        nonce: opts.nonce ?? "nonce-valid-12345",
        ...(opts.azp !== undefined ? { azp: opts.azp } : {}),
      })
        .setProtectedHeader({ alg: "RS256", kid: "google-test-kid" })
        .setIssuer(opts.iss ?? "https://accounts.google.com")
        .setAudience(opts.aud ?? googleClientId)
        .setSubject(opts.sub ?? "google-sub-10001")
        .setIssuedAt(now)
        .setExpirationTime(now + (opts.expOffsetSec ?? 600))
        .sign(privateKey);
    };

    // 1. Valid Google ID token succeeds and binds by iss+sub with minimal MEMBER permissions and mfaVerified=false
    const validIdToken = await signGoogleToken({ nonce: "nonce-first-0001" });
    const verified1 = await verifyGoogleOidcIdToken({
      idToken: validIdToken,
      expectedNonce: "nonce-first-0001",
      env: testEnv,
      stateDir: state,
    });
    assert.equal(verified1.role, "MEMBER");
    assert.deepEqual(verified1.permissions, ["video.run"]);
    assert.equal(verified1.mfaVerified, false);
    assert.deepEqual(verified1.amr, ["oidc"]);
    assert.match(verified1.sub, /^glow-google-[a-f0-9]{24}$/);

    // 1b. Server-bound OIDC transaction state+nonce enforcement & azp validation
    const badAzpTok = await signGoogleToken({ azp: "wrong-azp-client.apps.googleusercontent.com", nonce: "nonce-bad-azp-01" });
    await assert.rejects(
      () => verifyGoogleOidcIdToken({ idToken: badAzpTok, env: testEnv, stateDir: state }),
      /authorized party \(azp\) mismatch/i
    );

    const clientSuppliedOnlyTok = await signGoogleToken({ nonce: "nonce-client-invented-99" });
    await assert.rejects(
      () =>
        authenticateGlowNativePrincipalAsync(
          { google_id_token: clientSuppliedOnlyTok, google_nonce: "nonce-client-invented-99" },
          testEnv,
          state
        ),
      /server-issued transaction state is required/i
    );

    const serverTx = issueGoogleOidcTransaction({ env: testEnv, stateDir: state });
    const serverBoundTok = await signGoogleToken({ nonce: serverTx.nonce, azp: googleClientId });
    const principalFromTx = await authenticateGlowNativePrincipalAsync(
      { google_id_token: serverBoundTok, google_state: serverTx.state },
      testEnv,
      state
    );
    assert.equal(principalFromTx.sub, verified1.sub);
    assert.deepEqual(principalFromTx.permissions, ["video.run"]);

    await assert.rejects(
      () =>
        authenticateGlowNativePrincipalAsync(
          { google_id_token: serverBoundTok, google_state: serverTx.state },
          testEnv,
          state
        ),
      /already consumed/i
    );

    // 2. Replayed nonce is rejected
    await assert.rejects(
      () =>
        verifyGoogleOidcIdToken({
          idToken: validIdToken,
          expectedNonce: "nonce-first-0001",
          env: testEnv,
          stateDir: state,
        }),
      /nonce replay rejected/i
    );

    // 3. Same Google sub with changed email resolves to the exact same GLOW account (bound by iss+sub, not email)
    const changedEmailToken = await signGoogleToken({
      sub: "google-sub-10001",
      email: "renamed-creator@example.com",
      nonce: "nonce-second-0002",
    });
    const verifiedSameSub = await verifyGoogleOidcIdToken({
      idToken: changedEmailToken,
      expectedNonce: "nonce-second-0002",
      env: testEnv,
      stateDir: state,
    });
    assert.equal(verifiedSameSub.sub, verified1.sub);

    // 4. Different Google sub with the same email is NEVER auto-merged into the existing account
    const differentSubSameEmailToken = await signGoogleToken({
      sub: "google-sub-99999",
      email: "renamed-creator@example.com",
      nonce: "nonce-third-0003",
    });
    const verifiedDifferentSub = await verifyGoogleOidcIdToken({
      idToken: differentSubSameEmailToken,
      expectedNonce: "nonce-third-0003",
      env: testEnv,
      stateDir: state,
    });
    assert.notEqual(verifiedDifferentSub.sub, verified1.sub);

    // 5. Negative cases: wrong issuer, wrong audience, expired token, unverified email
    const badIss = await signGoogleToken({ iss: "https://evil-idp.example.com", nonce: "nonce-bad-iss-1" });
    await assert.rejects(() => verifyGoogleOidcIdToken({ idToken: badIss, env: testEnv, stateDir: state }), /verification failed/i);

    const badAud = await signGoogleToken({ aud: "wrong-client-id.apps.googleusercontent.com", nonce: "nonce-bad-aud-1" });
    await assert.rejects(() => verifyGoogleOidcIdToken({ idToken: badAud, env: testEnv, stateDir: state }), /verification failed/i);

    const expiredTok = await signGoogleToken({ expOffsetSec: -120, nonce: "nonce-expired-1" });
    await assert.rejects(() => verifyGoogleOidcIdToken({ idToken: expiredTok, env: testEnv, stateDir: state }), /verification failed/i);

    const unverifiedEmailTok = await signGoogleToken({ emailVerified: false, nonce: "nonce-unverified-1" });
    await assert.rejects(
      () => verifyGoogleOidcIdToken({ idToken: unverifiedEmailTok, env: testEnv, stateDir: state }),
      /email_verified=true is required/i
    );

    // Negative case: Founder explicit policy consent required (GLOW_GOOGLE_OIDC_POLICY_ACCEPTED !== "1")
    const unapprovedPolicyEnv = { ...testEnv, GLOW_GOOGLE_OIDC_POLICY_ACCEPTED: "0" };
    await assert.rejects(
      () => verifyGoogleOidcIdToken({ idToken: validIdToken, env: unapprovedPolicyEnv, stateDir: state }),
      /Founder has not accepted Google API Services User Data Policy/i
    );
    const descPending = describeGoogleOidcConfiguration({
      GLOW_GOOGLE_OIDC_CLIENT_ID: googleClientId,
      GLOW_GOOGLE_OIDC_POLICY_ACCEPTED: "0",
    });
    assert.equal(descPending.status, "HUMAN_REQUIRED_POLICY_UNAPPROVED");
    assert.equal(descPending.policyAccepted, false);

    // 6. Access token revocation: revoked token is immediately rejected by createJwtVerifier
    const nativeSecret = "glow-native-test-secret-minimum-32-bytes-long-2026";
    const oauthCfg = loadOAuthConfig({
      GLOW_OAUTH_ISSUER: "https://peachpuff-frog-205135.hostingersite.com",
      GLOW_OAUTH_AUDIENCE: "https://peachpuff-frog-205135.hostingersite.com/mcp-v2",
      GLOW_OAUTH_AUTHORIZATION_PROFILE: "GLOW_NATIVE_GRANT",
      GLOW_PUBLIC_MCP_URL: "https://peachpuff-frog-205135.hostingersite.com/mcp-v2",
      GLOW_OAUTH_ALLOWED_CLIENT_IDS: "chatgpt-connector",
      GLOW_OAUTH_ALLOWED_REDIRECT_URIS: "https://chatgpt.com/connector/oauth/callback",
      GLOW_NATIVE_OAUTH_SECRET: nativeSecret,
      GLOW_V2_STATE_DIR: state,
    });
    const verifier = "pkce-code-verifier-for-revocation-test-0123456789abcdef";
    const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
    const authCode = issueGlowNativeAuthCode({
      clientId: "chatgpt-connector",
      redirectUri: "https://chatgpt.com/connector/oauth/callback",
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
      sub: "founder-native-member",
      scopes: ["video.run"],
      permissions: ["video.run"],
      resource: "https://peachpuff-frog-205135.hostingersite.com/mcp-v2",
      secret: nativeSecret,
      stateDir: state,
    });
    const exchanged = await exchangeGlowNativeAuthCode({
      code: authCode,
      clientId: "chatgpt-connector",
      redirectUri: "https://chatgpt.com/connector/oauth/callback",
      codeVerifier: verifier,
      config: oauthCfg,
      stateDir: state,
    });
    const jwtVerifier = createJwtVerifier(oauthCfg);
    const activeAuth = await jwtVerifier.verifyAccessToken(exchanged.access_token);
    assert.equal(activeAuth.extra?.sub, "founder-native-member");

    const revokedOk = await revokeGlowAccessToken({
      token: exchanged.access_token,
      config: oauthCfg,
      stateDir: state,
    });
    assert.equal(revokedOk, true);
    await assert.rejects(() => jwtVerifier.verifyAccessToken(exchanged.access_token), /revoked/i);

    // 7. Rate limiting: allows 3 requests then blocks the 4th with retryAfterSec > 0
    resetAuthRateLimitsForTests();
    for (let i = 0; i < 3; i++) {
      assert.equal(checkAuthRateLimit({ endpoint: "test_ep", clientKey: "127.0.0.1", env: testEnv }).allowed, true);
    }
    const fourth = checkAuthRateLimit({ endpoint: "test_ep", clientKey: "127.0.0.1", env: testEnv });
    assert.equal(fourth.allowed, false);
    assert.ok(fourth.retryAfterSec >= 1);
  } finally {
    await new Promise<void>((r) => jwksServer.close(() => r()));
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test("A7-02: End-to-end MCP <-> Studio Handoff, FORK_TOKEN gating, Kit A/B/C execution, GPT readback & H2 revision invalidation", { timeout: 120000 }, async () => {
  const gatewaySecret = "glow-studio-gateway-secret-32-chars-minimum-2026";
  const bridge = await getV2Bridge(repoRoot, sharedState);
  const worker = getNativeStudioWorker(repoRoot, sharedState, gatewaySecret);
  try {
    const baseline = JSON.parse(
      String(
        bridge.pyodide.runPython(
          "import json\nfrom runtime.capability_baseline import current_v2_capability_baseline_binding\njson.dumps(current_v2_capability_baseline_binding())"
        )
      )
    );
    const ownerMap = parseOwnerIdentityMap(`${NATIVE.issuer}|${NATIVE.sub}>${LEGACY.issuer}|${LEGACY.sub}`);
    const mappedOwner = resolveOwnerIdentity(ownerMap, NATIVE.sub, NATIVE.issuer);
    assert.equal(mappedOwner.subject, LEGACY.sub);

    const mcpCall = (sub: string, iss: string, operation: string, input: Record<string, unknown>, perms = ["video.run", "video.accept"]) =>
      bridge.call(
        sub,
        { operation, input },
        { subject: sub, issuer: iss, auth_mode: "oauth", permissions: perms, scopes: perms }
      );

    const studioCall = async (sub: string, method: string, reqPath: string, body?: Record<string, unknown>) => {
      const { actorHeader, signatureHeader } = signStudioGatewayActor({
        sub,
        scopes: ["video.run", "video.accept"],
        permissions: ["video.run", "video.accept"],
        secret: gatewaySecret,
      });
      const headers: Record<string, string> = {
        "x-glow-verified-actor": actorHeader,
        "x-glow-verified-signature": signatureHeader,
        "x-studio-actor-scopes": "video.run,video.accept",
        accept: "application/json",
      };
      let bodyBuffer: Buffer | null = null;
      if (body !== undefined) {
        headers["content-type"] = "application/json";
        bodyBuffer = Buffer.from(JSON.stringify(body), "utf8");
      }
      const res = await worker.dispatchHttp({ method, path: reqPath, query: "", headers, bodyBuffer });
      const text = Buffer.from(res.body_base64 || "", "base64").toString("utf8");
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch {}
      return { status: res.status_code, json };
    };

    const missionId = "M-HANDOFF-E2E-01";
    // Step 1: Start mission in MCP under mapped owner
    const started = await mcpCall(mappedOwner.subject, mappedOwner.issuer, "start_professional_mission", {
      mission_id: missionId,
      project_id: "P-HANDOFF-01",
    });
    assert.equal(started.status_code, 200);
    assert.equal(started.body.state, "INTAKE");

    // Step 2: Studio list_missions immediately sees the mission created in MCP without prior single-mission fetch
    const studioList = await studioCall(mappedOwner.subject, "GET", "/api/studio/missions");
    assert.equal(studioList.status, 200, JSON.stringify(studioList));
    assert.ok(
      Array.isArray(studioList.json.missions) && studioList.json.missions.some((m: any) => m.mission_id === missionId),
      "GET /api/studio/missions must include MCP-created mission immediately"
    );

    const studioAtIntake = await studioCall(mappedOwner.subject, "GET", `/api/studio/missions/${missionId}`);
    assert.equal(studioAtIntake.status, 200, JSON.stringify(studioAtIntake));
    assert.equal(studioAtIntake.json.FORK_TOKEN.status, "PENDING");
    assert.equal(studioAtIntake.json.cost_accounting.reconciled_external_provider_cost_usd, "UNKNOWN");

    const crossTenantStudio = await studioCall(OTHER.sub, "GET", `/api/studio/missions/${missionId}`);
    assert.equal(crossTenantStudio.status, 403);

    const blockedKitAAtIntake = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-a`, {
      duration_s: 2.0,
    });
    assert.equal(blockedKitAAtIntake.status, 409);

    // Step 3: Prepare & accept H1, H2, H3 in MCP
    const profile = "V2_PROFESSIONAL_PREPRODUCTION_V1";
    const storyContent = { premise: "Aria explores the luminous factory", story_arc: "act1 -> act2 -> act3", ending_intent: "cinematic reveal" };
    const h1 = {
      profile_id: profile,
      h1_contract_revision: "H1_STORY_MATERIALITY_V1",
      truth: {
        claims: [{ statement: "verified brand claim", status: "VERIFIED", source_ref: "REF1", evidence_ref: "EV1", source_content_hash: "a".repeat(64) }],
      },
      truth_evidence_refs: ["EV1"],
      audience: { description: "creative directors", language: "vi" },
      intended_outcome: { objective: "handoff verification", success_metric: "e2e pass" },
      constraints: ["1080p24"],
      unknowns: [],
      risks: [],
      director_intent: "cinematic precision",
      director_intent_ref: "DIR:01",
      reference_materiality: "MATERIAL",
      reference_bible_version: "RB:01",
      materiality: Object.fromEntries(["reference", "audio", "dialogue", "continuity", "story"].map((k) => [k, { status: "MATERIAL", reason: "required" }])),
      story_treatment: { artifact_id: "ST:01", version_id: "ST:01:v1", content: storyContent, content_hash: hash(storyContent) },
    };
    const core = new Set(["CAP-TRUTH-001", "CAP-STORY-001", "CAP-SHOT-001", "CAP-MEDIA-001", "CAP-PROVIDER-ROUTE-001", "CAP-PROVIDER-JOB-001"]);
    const demands = baseline.applicable_capability_ids.map((cid: string) => ({
      capability_id: cid,
      materiality: core.has(cid) ? "MATERIAL" : "NOT_MATERIAL",
      reason: "handoff test",
    }));
    const h2 = {
      profile_id: profile,
      h1_content_hash: hash(h1),
      creative_intent: "cinematic sequence",
      story_text: "Aria enters the hall of light",
      story_ref: "STORY:01",
      shot_contract_version: "SHOTS:01",
      audiovisual_strategy_ref: "AV:01",
      reference_bible_version: "RB:01",
      frozen_anchor_refs: ["ANCHOR:01", "FRAME:START"],
      continuity_plan: "continuous chain",
      shot_contracts: [
        {
          shot_id: "shot_01",
          action: "camera tracks forward",
          duration_seconds: 5,
          camera: { framing: "medium", movement: "locked", lens: "50mm" },
          audio: { strategy: "VOICEOVER", plan: "narration", script: "Chào mừng đến GLOW Studio", language: "vi" },
          continuity_anchor_refs: ["ANCHOR:01"],
          capability_request: {
            capability_id: "CAP-MEDIA-001",
            canonical_prompt: "cinematic tracking shot in luminous studio",
            start_frame: { version_ref: "FRAME:START", content_hash: "a".repeat(64), uri: "https://example.invalid/start.png" },
          },
        },
      ],
      capability_demands: demands,
    };
    const coverage = demands.map((d: any) =>
      d.materiality === "MATERIAL"
        ? { capability_id: d.capability_id, disposition: "ACTIVATED", contribution_evidence_refs: ["EV1"] }
        : { capability_id: d.capability_id, disposition: "NOT_MATERIAL", reason: d.reason }
    );
    const h3 = {
      profile_id: profile,
      h1_content_hash: hash(h1),
      h2_content_hash: hash(h2),
      work_graph: { nodes: [{ workcell_id: `WC:${missionId}:shot_01`, kind: "SHOT", shot_id: "shot_01", depends_on: [] }] },
      capability_baseline_binding: baseline,
      capability_coverage_version: "COV:01",
      capability_coverage: coverage,
      capability_coverage_digest: hash({
        coverage_version: "COV:01",
        baseline_binding_digest: baseline.binding_digest,
        coverage: [...coverage].sort((a: any, b: any) => a.capability_id.localeCompare(b.capability_id)),
      }),
      rights_ready: true,
      budget_ready: true,
      provider_ready: true,
      readiness_evidence: Object.fromEntries(["rights", "budget", "provider"].map((k) => [k, { status: "READY", evidence_ref: "EV:" + k, content_hash: "b".repeat(64) }])),
      provider_route_binding: {
        capability_id: "CAP-PROVIDER-ROUTE-001",
        provider_identity: "PROVIDER_FIXTURE",
        provider_profile_version: "PROFILE:FIXTURE:v1",
        route_decision_ref: "EV:provider",
        route_decision_hash: "b".repeat(64),
      },
    };

    for (const [idx, payload] of [h1, h2, h3].entries()) {
      const stage = (["H1", "H2", "H3"] as const)[idx];
      const prep = await mcpCall(mappedOwner.subject, mappedOwner.issuer, "prepare_professional_acceptance", {
        mission_id: missionId,
        stage,
        state_version: idx + 1,
        request_id: `REQ-${stage}`,
        payload,
      });
      assert.equal(prep.status_code, 200, JSON.stringify(prep.body));
      const acc = await mcpCall(mappedOwner.subject, mappedOwner.issuer, "accept_professional_phase", {
        mission_id: missionId,
        stage,
        state_version: idx + 1,
        approval_id: (prep.body as any).approval_id,
        payload_hash: (prep.body as any).payload_hash,
        decision: "APPROVE",
      });
      assert.equal(acc.status_code, 200, JSON.stringify(acc.body));
      if (stage === "H2") {
        // After H1+H2 only (before H3), Kit B must still be blocked in Studio!
        const blockedBeforeH3 = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-b`, {
          animation_mode: "2.5D",
          duration_s: 2.0,
        });
        assert.equal(blockedBeforeH3.status, 409);
      }
    }

    // Step 4: Now H1+H2+H3 are accepted in MCP (state_version=4, FORK_READY).
    // C07 & C08: GET/sync MUST NOT auto-generate preview, auto-approve Bible, default budget to 20, or mint Studio FORK_TOKEN!
    const studioSyncedOnly = await studioCall(mappedOwner.subject, "GET", `/api/studio/missions/${missionId}`);
    assert.equal(studioSyncedOnly.status, 200);
    assert.equal(studioSyncedOnly.json.credits.approved_credit_budget, 0, "C07/C08: sync must not invent budget 20");
    assert.equal(studioSyncedOnly.json.cost_accounting.approved_credit_budget, 0);
    assert.equal(studioSyncedOnly.json.cost_accounting.budget_approved, false);
    assert.equal(studioSyncedOnly.json.H2.reference_bible.step_1_character_bible.approved, false, "C08: sync must not auto-approve Bible");
    assert.equal(studioSyncedOnly.json.FORK_TOKEN.status, "PENDING", "C08: sync must not auto-mint Studio FORK_TOKEN");
    assert.deepEqual(studioSyncedOnly.json.FORK_TOKEN.unlocked_rooms, []);

    const blockedBeforeStudioApprove = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-a`, {
      state_version: 4,
      duration_s: 2.0,
    });
    assert.equal(blockedBeforeStudioApprove.status, 409, "Execution must be blocked until explicit Studio Bible & budget approval + compile");

    // Explicit Studio preview + explicit Reference Bible & budget approval + explicit compile_h2_h3_fork
    const genPrevRes = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/reference-bible/generate-preview`, {
      step: "ALL",
    });
    assert.equal(genPrevRes.status, 200);

    const appBibleRes = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/reference-bible/approve`, {
      step: "ALL",
      approval_mode: "MANUAL_APPROVE",
      approved_credit_budget: 25,
    });
    assert.equal(appBibleRes.status, 200);
    assert.equal(appBibleRes.json.credits.approved_credit_budget, 25);
    assert.equal(appBibleRes.json.cost_accounting.budget_approved, true);
    assert.equal(appBibleRes.json.cost_accounting.budget_approved_by, mappedOwner.subject);

    const studioForkReady = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/compile-h2-h3-fork`, {
      transition_mode: "CONTINUOUS_CHAIN",
    });
    assert.equal(studioForkReady.status, 200);
    assert.equal(studioForkReady.json.FORK_TOKEN.status, "ISSUED");
    assert.deepEqual(studioForkReady.json.FORK_TOKEN.unlocked_rooms, ["KIT_A", "KIT_B", "KIT_C"]);

    // Negative check: stale state_version (2 instead of 4) or wrong fork_token_id is rejected with 409
    const staleVersionCall = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-a`, {
      state_version: 2,
      duration_s: 2.0,
    });
    assert.equal(staleVersionCall.status, 409);

    const wrongTokenCall = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-a`, {
      fork_token_id: "FORK-WRONG-0000",
      duration_s: 2.0,
    });
    assert.equal(wrongTokenCall.status, 409);

    // Step 5: Execute Kit A, Kit B, and Kit C in Studio
    const kitARes = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-a`, {
      state_version: 4,
      duration_s: 2.0,
      lufs_profile: "EBU_R128_BROADCAST",
    });
    assert.equal(kitARes.status, 200, JSON.stringify(kitARes.json));

    const kitBRes = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-b`, {
      state_version: 4,
      animation_mode: "2.5D",
      duration_s: 2.0,
    });
    assert.equal(kitBRes.status, 200, JSON.stringify(kitBRes.json));

    const kitCRes = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-c`, {
      state_version: 4,
      execution_mode: "LOCAL_STUDIO_COMPOSITION",
      duration_s: 2.0,
    });
    assert.equal(kitCRes.status, 200, JSON.stringify(kitCRes.json));

    // Step 6: GPT reads back Studio results via MCP get_status, get_professional_context, and get_mcp_work_package
    const mcpStatus = await mcpCall(mappedOwner.subject, mappedOwner.issuer, "get_status", { mission_id: missionId });
    assert.equal(mcpStatus.status_code, 200);
    const ws = (mcpStatus.body as any).studio_workspace;
    assert.ok(ws, "MCP get_status must include studio_workspace");
    assert.deepEqual(ws.completed_rooms.sort(), ["KIT_A", "KIT_B", "KIT_C"]);
    assert.equal(ws.video_masters.length, 2);
    assert.equal(ws.audio_bridge_packages.length, 1);
    assert.equal(ws.cost_accounting.reconciled_external_provider_cost_usd, "UNKNOWN");

    const mcpContext = await mcpCall(mappedOwner.subject, mappedOwner.issuer, "get_professional_context", {
      mission_id: missionId,
      state_version: 4,
    });
    assert.equal(mcpContext.status_code, 200);
    assert.equal((mcpContext.body as any).studio_workspace.video_masters.length, 2);

    // Step 7: Revise H2 in MCP -> invalidates H2, H3, and FORK_TOKEN in both MCP and Studio
    const revised = await mcpCall(mappedOwner.subject, mappedOwner.issuer, "revise_professional_phase", {
      mission_id: missionId,
      stage: "H2",
      state_version: 4,
      reason: "director updated shot framing",
    });
    assert.equal(revised.status_code, 200);
    assert.equal(revised.body.state, "TRUTH_FROZEN");
    assert.equal(revised.body.state_version, 5);

    const studioAfterRevise = await studioCall(mappedOwner.subject, "GET", `/api/studio/missions/${missionId}`);
    assert.equal(studioAfterRevise.status, 200);
    assert.equal(studioAfterRevise.json.FORK_TOKEN.status, "SUPERSEDED");
    assert.deepEqual(studioAfterRevise.json.FORK_TOKEN.unlocked_rooms, []);

    const blockedAfterRevise = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/rooms/kit-c`, {
      execution_mode: "LOCAL_STUDIO_COMPOSITION",
      duration_s: 2.0,
    });
    assert.equal(blockedAfterRevise.status, 409);

    const blockedRegenAfterRevise = await studioCall(mappedOwner.subject, "POST", `/api/studio/missions/${missionId}/shots/regenerate`, {
      shot_id: "shot_01",
      reason_text: "attempt regen while fork token superseded",
    });
    assert.equal(blockedRegenAfterRevise.status, 409);

    // Case B (Studio -> MCP): Mission created in Studio reports truthful state & accepted_preproduction_phases in MCP get_status
    const studioCreatedId = "M-STUDIO-ORIGIN-01";
    const createdInStudio = await studioCall(mappedOwner.subject, "POST", "/api/studio/missions", {
      mission_id: studioCreatedId,
      project_id: "P-STUDIO-01",
      title: "Studio Originated Mission",
      brief: "Created on website first @Aria",
      approved_credit_budget: 0,
    });
    assert.equal(createdInStudio.status, 200);
    const mcpReadStudioOnly = await mcpCall(mappedOwner.subject, mappedOwner.issuer, "get_status", {
      mission_id: studioCreatedId,
    });
    assert.equal(mcpReadStudioOnly.status_code, 200);
    assert.equal(mcpReadStudioOnly.body.state, "TRUTH_FROZEN");
    assert.deepEqual(mcpReadStudioOnly.body.accepted_preproduction_phases, ["H1"]);
    assert.equal((mcpReadStudioOnly.body as any).studio_workspace.cost_accounting.approved_credit_budget, 0);
  } finally {
    killNativeStudioWorkerForTest();
  }
});

test("C01-C05: RBAC role + per-user TOTP step-up enforcement on video.accept, OIDC transaction parameter binding, and mandatory Google mode", async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "gvf2-c01-c05-"));
  try {
    const adminTotpSecret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const otherTotpSecret = "MFRGGZDFMZTWQ2LKNBWXSIDOMNZGK5A=";
    const env: NodeJS.ProcessEnv = {
      GLOW_OAUTH_AUTHORIZATION_PROFILE: "GLOW_NATIVE_GRANT",
      GLOW_NATIVE_OAUTH_SECRET: "glow-c01-c05-secret-32-characters-minimum-2026",
      GLOW_NATIVE_OPERATOR_PASSCODE: "operator-master-passcode-2026-glow",
      GLOW_NATIVE_MEMBERS_JSON: JSON.stringify({
        "founder-admin-01": { passcode: "founder-pass-2026", role: "ADMIN", totp_secret: adminTotpSecret },
        "operator-two-02": { passcode: "operator2-pass-2026", role: "OPERATOR", totp_secret: otherTotpSecret },
        "regular-member-01": { passcode: "member-pass-2026", role: "MEMBER" },
      }),
      GLOW_V2_STATE_DIR: state,
    };

    // C03: Regular MEMBER cannot obtain video.accept even if they supply a TOTP code or operator_passcode
    await assert.rejects(
      () =>
        authenticateGlowNativePrincipalAsync(
          {
            member_id: "regular-member-01",
            member_passcode: "member-pass-2026",
            grant_accept: "true",
            mfa_code: generateTotpCode(adminTotpSecret),
            operator_passcode: "operator-master-passcode-2026-glow",
          },
          env,
          state
        ),
      /RBAC_OPERATOR_ROLE_REQUIRED|ROLE_OPERATOR_OR_ADMIN_REQUIRED/
    );

    // C03: Self-registered member is always MEMBER and cannot obtain video.accept
    await assert.rejects(
      () =>
        authenticateGlowNativePrincipalAsync(
          {
            action: "register",
            member_id: "new-self-reg-01",
            member_passcode: "self-reg-pass-2026",
            confirm_passcode: "self-reg-pass-2026",
            grant_accept: "true",
            mfa_code: generateTotpCode(adminTotpSecret),
          },
          env,
          state
        ),
      /RBAC_OPERATOR_ROLE_REQUIRED|ROLE_OPERATOR_OR_ADMIN_REQUIRED/
    );

    // C03: Shared operator_passcode alone WITHOUT per-user TOTP mfa_code is strictly rejected (never grants video.accept or mfaVerified=true)
    await assert.rejects(
      () =>
        authenticateGlowNativePrincipalAsync(
          {
            member_id: "founder-admin-01",
            member_passcode: "founder-pass-2026",
            grant_accept: "true",
            operator_passcode: "operator-master-passcode-2026-glow",
          },
          env,
          state
        ),
      /MFA_STEP_UP_REQUIRED/
    );

    // C03: Another operator's TOTP code is strictly rejected for founder-admin-01
    await assert.rejects(
      () =>
        authenticateGlowNativePrincipalAsync(
          {
            member_id: "founder-admin-01",
            member_passcode: "founder-pass-2026",
            grant_accept: "true",
            mfa_code: generateTotpCode(otherTotpSecret),
          },
          env,
          state
        ),
      /MFA_STEP_UP_FAILED/
    );

    // C03: ADMIN with valid per-user RFC 6238 TOTP code obtains video.accept and mfaVerified=true
    const validTotp = generateTotpCode(adminTotpSecret);
    const adminPrincipal = await authenticateGlowNativePrincipalAsync(
      {
        member_id: "founder-admin-01",
        member_passcode: "founder-pass-2026",
        grant_accept: "true",
        mfa_code: validTotp,
      },
      env,
      state
    );
    assert.equal(adminPrincipal.role, "ADMIN");
    assert.equal(adminPrincipal.mfaVerified, true);
    assert.ok(adminPrincipal.permissions.includes("video.accept"));

    // C03: Replaying the exact same TOTP code in the same 30s time step is strictly rejected
    await assert.rejects(
      () =>
        authenticateGlowNativePrincipalAsync(
          {
            member_id: "founder-admin-01",
            member_passcode: "founder-pass-2026",
            grant_accept: "true",
            mfa_code: validTotp,
          },
          env,
          state
        ),
      /MFA_STEP_UP_FAILED/
    );

    // C01: Mandatory Google mode rejects password login and guest mode
    const mandatoryGoogleEnv = { ...env, GLOW_AUTH_MANDATORY_GOOGLE: "1" };
    await assert.rejects(
      () =>
        authenticateGlowNativePrincipalAsync(
          { member_id: "founder-admin-01", member_passcode: "founder-pass-2026" },
          mandatoryGoogleEnv,
          state
        ),
      /MANDATORY_GOOGLE_OIDC_REQUIRED|MANDATORY_GOOGLE_IDENTITY_REQUIRED/
    );
    await assert.rejects(
      () => authenticateGlowNativePrincipalAsync({ guest_mode: true }, mandatoryGoogleEnv, state),
      /MANDATORY_GOOGLE_OIDC_REQUIRED|MANDATORY_GOOGLE_IDENTITY_REQUIRED/
    );
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
  }
});
