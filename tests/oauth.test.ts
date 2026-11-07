import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  createJwtVerifier,
  createStaticBearerVerifier,
  exchangeGlowNativeAuthCode,
  issueGlowNativeAuthCode,
  issueStudioBrowserSession,
  loadOAuthConfig,
  revokeStudioBrowserSession,
  sanitizeStudioNextPath,
  verifyStudioBrowserSession,
  verifyStudioCsrfToken,
} from "../src/oauth.js";

test("verified issuer/audience/action scopes and RBAC are transported, never inferred", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const key = { ...(await exportJWK(publicKey)), kid: "fixture-key", alg: "RS256", use: "sig" };
  const server = http.createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ keys: [key] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const issuer = "https://issuer.example.invalid/",
    audience = "https://resource.example.invalid/mcp-v2";
  const verifier = createJwtVerifier({ issuer, audience, jwksUrl: `http://127.0.0.1:${address.port}/jwks` });
  const config = {
    GLOW_OAUTH_ISSUER: issuer,
    GLOW_OAUTH_AUDIENCE: audience,
    GLOW_OAUTH_JWKS_URL: "https://issuer.example.invalid/jwks",
  };
  assert.throws(
    () => loadOAuthConfig({ ...config, GLOW_OAUTH_AUTHORIZATION_PROFILE: "SUPABASE_RESOURCE_GRANT" }),
    /RESOURCE_AND_CLIENT_BINDING/
  );
  assert.throws(() => loadOAuthConfig({ ...config, GLOW_OAUTH_ISSUER: "http://issuer.invalid" }), /ISSUER_HTTPS/);
  assert.throws(() => loadOAuthConfig({ ...config, GLOW_OAUTH_JWKS_URL: "http://remote.invalid/jwks" }), /JWKS_HTTPS/);
  for (const profile of ["PRODUCTION", "production", " Production "])
    assert.throws(
      () =>
        loadOAuthConfig({
          ...config,
          GLOW_GATEWAY_PROFILE: profile,
          GLOW_OAUTH_JWKS_URL: "http://127.0.0.1/jwks",
        }),
      /JWKS_HTTPS/
    );
  const token = async (claims: Record<string, unknown>, iss = issuer, aud = audience) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "fixture-key" })
      .setSubject("operator")
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);
  const stateDir = mkdtempSync(join(tmpdir(), "glow-oauth-test-"));
  try {
    const valid = await verifier.verifyAccessToken(
      await token({ scope: "video.run video.accept", permissions: ["video.accept"], role: "admin" })
    );
    assert.deepEqual(valid.scopes, ["video.run", "video.accept"]);
    assert.equal(valid.extra?.issuer, issuer);
    assert.equal(valid.extra?.auth_mode, "oauth");
    assert.deepEqual(valid.extra?.permissions, ["video.accept"]);
    await assert.rejects(() => token({ scope: "video.run" }, "https://wrong.invalid/").then((t) => verifier.verifyAccessToken(t)));
    await assert.rejects(() => token({ scope: "video.run" }, issuer, "wrong-audience").then((t) => verifier.verifyAccessToken(t)));
    const roleOnly = await verifier.verifyAccessToken(await token({ scope: "video.run", role: "PRIVATE_OPERATOR" }));
    assert.deepEqual(roleOnly.extra?.permissions, []);
    assert.deepEqual(roleOnly.scopes, ["video.run"]);
    const local = await createStaticBearerVerifier({ token: "x".repeat(32), subject: "operator" }).verifyAccessToken("x".repeat(32));
    assert.equal(local.extra?.auth_mode, undefined);
    assert.deepEqual(local.scopes, ["video.run"]);
    const resourceVerifier = createJwtVerifier({
      issuer,
      audience,
      jwksUrl: `http://127.0.0.1:${address.port}/jwks`,
      authorizationProfile: "SUPABASE_RESOURCE_GRANT",
      resource: audience,
      allowedClients: ["CLIENT:ALLOWED"],
    });
    const grant = { resource: audience, client_id: "CLIENT:ALLOWED", permissions: ["video.run", "video.accept"] };
    const delegated = await resourceVerifier.verifyAccessToken(
      await token({ scope: "email", client_id: "CLIENT:ALLOWED", glow_video: grant })
    );
    assert.deepEqual(delegated.extra?.oauth_scopes, ["email"]);
    assert.deepEqual(delegated.extra?.permissions, ["video.run", "video.accept"]);
    assert.equal(delegated.extra?.authorization_source, "VERIFIED_OAUTH_RESOURCE_CLIENT_PERMISSION_GRANT");
    for (const claims of [
      { scope: "email", client_id: "CLIENT:ALLOWED", role: "PRIVATE_OPERATOR" },
      { scope: "email", client_id: "CLIENT:FOREIGN", glow_video: grant },
      { scope: "email", client_id: "CLIENT:ALLOWED", glow_video: { ...grant, resource: "https://wrong.invalid" } },
      { scope: "email", client_id: "CLIENT:ALLOWED", glow_video: { ...grant, client_id: "CLIENT:FOREIGN" } },
      { scope: "email", client_id: "CLIENT:ALLOWED", glow_video: { ...grant, permissions: ["admin", "video.accept"] } },
      { scope: "email", glow_video: grant },
    ])
      await assert.rejects(() => token(claims).then((t) => resourceVerifier.verifyAccessToken(t)));

    // F31-AUTH-02 & F31-AUTH-03: Self-sovereign GLOW_NATIVE_GRANT with pre-registered redirect_uri and atomic one-time code consumption
    const nativeSecret = "glow-self-sovereign-native-secret-2026-hollywood";
    assert.throws(
      () =>
        loadOAuthConfig({
          GLOW_OAUTH_AUTHORIZATION_PROFILE: "GLOW_NATIVE_GRANT",
          GLOW_PUBLIC_MCP_URL: "https://glow-video.example.org/mcp-v2",
          GLOW_OAUTH_ALLOWED_CLIENT_IDS: "chatgpt-client gemini-client",
          GLOW_NATIVE_OAUTH_SECRET: nativeSecret,
        }),
      /ALLOWED_REDIRECT_URIS_REQUIRED/
    );

    const nativeCfg = loadOAuthConfig({
      GLOW_OAUTH_AUTHORIZATION_PROFILE: "GLOW_NATIVE_GRANT",
      GLOW_PUBLIC_MCP_URL: "https://glow-video.example.org/mcp-v2",
      GLOW_OAUTH_ALLOWED_CLIENT_IDS: "chatgpt-client gemini-client",
      GLOW_OAUTH_ALLOWED_REDIRECT_URIS:
        "chatgpt-client=https://chatgpt.com/aip/callback gemini-client=https://gemini.google.com/oauth/callback",
      GLOW_NATIVE_OAUTH_SECRET: nativeSecret,
      GLOW_V2_STATE_DIR: stateDir,
    });
    assert.equal(nativeCfg.issuer, "https://glow-video.example.org");
    assert.equal(nativeCfg.audience, "https://glow-video.example.org/mcp-v2");
    assert.equal(nativeCfg.jwksUrl, "");

    const codeVerifier = "pkce-verifier-random-string-0123456789abcdef";
    const codeChallenge = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
    assert.throws(
      () =>
        issueGlowNativeAuthCode({
          clientId: "chatgpt-client",
          redirectUri: "https://chatgpt.com/aip/callback",
          codeChallenge,
          sub: "member-founder-01",
          scopes: ["video.run", "video.accept"],
          permissions: ["video.run", "video.accept"],
          resource: nativeCfg.resource!,
          secret: nativeSecret,
          stateDir,
        }),
      /RBAC_AND_MFA_REQUIRED/
    );
    const authCode = issueGlowNativeAuthCode({
      clientId: "chatgpt-client",
      redirectUri: "https://chatgpt.com/aip/callback",
      codeChallenge,
      sub: "member-founder-01",
      scopes: ["video.run", "video.accept"],
      permissions: ["video.run", "video.accept"],
      role: "OPERATOR",
      mfaVerified: true,
      resource: nativeCfg.resource!,
      secret: nativeSecret,
      stateDir,
    });
    const tokenBundle = await exchangeGlowNativeAuthCode({
      code: authCode,
      clientId: "chatgpt-client",
      redirectUri: "https://chatgpt.com/aip/callback",
      codeVerifier,
      config: nativeCfg,
      stateDir,
    });
    const nativeVerifier = createJwtVerifier(nativeCfg);
    const verifiedNative = await nativeVerifier.verifyAccessToken(tokenBundle.access_token);
    assert.equal(verifiedNative.extra?.sub, "member-founder-01");
    assert.equal(verifiedNative.extra?.authorization_source, "VERIFIED_GLOW_NATIVE_RESOURCE_CLIENT_PERMISSION_GRANT");
    assert.deepEqual(verifiedNative.extra?.permissions, ["video.run", "video.accept"]);

    // F31-AUTH-02: Replaying the exact same valid authorization code with the exact same valid PKCE verifier MUST fail closed
    await assert.rejects(
      () =>
        exchangeGlowNativeAuthCode({
          code: authCode,
          clientId: "chatgpt-client",
          redirectUri: "https://chatgpt.com/aip/callback",
          codeVerifier,
          config: nativeCfg,
          stateDir,
        }),
      /already consumed/
    );

    // F31-AUTH-02: Concurrent duplicate exchange of a fresh code allows at most 1 success
    const concurrentCode = issueGlowNativeAuthCode({
      clientId: "chatgpt-client",
      redirectUri: "https://chatgpt.com/aip/callback",
      codeChallenge,
      sub: "member-founder-01",
      scopes: ["video.run"],
      permissions: ["video.run"],
      resource: nativeCfg.resource!,
      secret: nativeSecret,
      stateDir,
    });
    const concurrentResults = await Promise.allSettled([
      exchangeGlowNativeAuthCode({
        code: concurrentCode,
        clientId: "chatgpt-client",
        redirectUri: "https://chatgpt.com/aip/callback",
        codeVerifier,
        config: nativeCfg,
        stateDir,
      }),
      exchangeGlowNativeAuthCode({
        code: concurrentCode,
        clientId: "chatgpt-client",
        redirectUri: "https://chatgpt.com/aip/callback",
        codeVerifier,
        config: nativeCfg,
        stateDir,
      }),
    ]);
    const fulfilled = concurrentResults.filter((r) => r.status === "fulfilled");
    const rejected = concurrentResults.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1, "exactly one concurrent exchange may succeed");
    assert.equal(rejected.length, 1, "concurrent duplicate exchange must be rejected");

    // F31-STATE-09: Multi-process OS child-process race on the same authorization code
    const mpCode = issueGlowNativeAuthCode({
      clientId: "chatgpt-client",
      redirectUri: "https://chatgpt.com/aip/callback",
      codeChallenge,
      sub: "member-founder-01",
      scopes: ["video.run"],
      permissions: ["video.run"],
      resource: nativeCfg.resource!,
      secret: nativeSecret,
      stateDir,
    });
    const mpJti = JSON.parse(Buffer.from(mpCode.split(".")[0], "base64url").toString("utf8")).jti as string;
    const oauthModuleUrl = new URL("../src/oauth.js", import.meta.url).href;
    const startAt = Date.now() + 350;
    const workerScript = `
      import { exchangeGlowNativeAuthCode } from ${JSON.stringify(oauthModuleUrl)};
      const delay = Math.max(0, ${startAt} - Date.now());
      await new Promise((r) => setTimeout(r, delay));
      try {
        const res = await exchangeGlowNativeAuthCode({
          code: ${JSON.stringify(mpCode)},
          clientId: "chatgpt-client",
          redirectUri: "https://chatgpt.com/aip/callback",
          codeVerifier: ${JSON.stringify(codeVerifier)},
          config: ${JSON.stringify(nativeCfg)},
          stateDir: ${JSON.stringify(stateDir)},
        });
        process.stdout.write(JSON.stringify({ ok: true, tokenLen: res.access_token.length }) + "\\n");
      } catch (err) {
        process.stdout.write(JSON.stringify({ ok: false, code: err.errorCode || "ERR", msg: err.message }) + "\\n");
      }
    `;
    const runChild = () =>
      new Promise<{ ok: boolean; code?: string; msg?: string }>((resolveChild, rejectChild) => {
        const child = spawn(process.execPath, ["--input-type=module", "-e", workerScript], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        let errOut = "";
        child.stdout.on("data", (d) => (out += d.toString("utf8")));
        child.stderr.on("data", (d) => (errOut += d.toString("utf8")));
        child.on("close", (exitCode) => {
          if (exitCode !== 0 && !out.trim()) {
            rejectChild(new Error(`Worker exited ${exitCode}: ${errOut}`));
            return;
          }
          try {
            resolveChild(JSON.parse(out.trim().split(/\r?\n/).pop()!));
          } catch (e) {
            rejectChild(new Error(`Failed to parse worker output: ${out} / ${errOut}`));
          }
        });
      });

    const mpWorkers = await Promise.all([runChild(), runChild(), runChild(), runChild(), runChild(), runChild()]);
    const mpSucceeded = mpWorkers.filter((w) => w.ok);
    const mpFailed = mpWorkers.filter((w) => !w.ok);
    assert.equal(mpSucceeded.length, 1, "exactly 1 OS process may succeed in exchanging the authorization code");
    assert.equal(mpFailed.length, 5, "all other 5 OS processes must fail closed");
    for (const f of mpFailed) {
      assert.match(String(f.msg || ""), /already consumed/i);
    }
    assert.equal(
      existsSync(join(stateDir, "oauth_code_markers", `${mpJti}.consumed`)),
      true,
      "kernel atomic consumption marker file must exist on disk"
    );

    // F31-STATE-09: Stale lockfile recovery
    const lockPath = join(stateDir, "oauth_code_ledger.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, lockId: "stale-dead-lock", acquiredAt: Date.now() - 15000 }), "utf8");
    const staleDate = new Date(Date.now() - 15000);
    utimesSync(lockPath, staleDate, staleDate);
    const postStaleCode = issueGlowNativeAuthCode({
      clientId: "chatgpt-client",
      redirectUri: "https://chatgpt.com/aip/callback",
      codeChallenge,
      sub: "member-founder-01",
      scopes: ["video.run"],
      permissions: ["video.run"],
      resource: nativeCfg.resource!,
      secret: nativeSecret,
      stateDir,
    });
    assert.ok(postStaleCode.length > 20, "stale lock must be automatically broken and code issued");
    assert.equal(existsSync(lockPath), false, "lockfile must be cleaned up after release");

    // F31-WEB-08: Studio Browser Session lifecycle, CSRF, and redirect sanitization
    assert.equal(sanitizeStudioNextPath("https://evil.example/phish"), "/studio");
    assert.equal(sanitizeStudioNextPath("//evil.example/phish"), "/studio");
    assert.equal(sanitizeStudioNextPath("/\\evil.example"), "/studio");
    assert.equal(sanitizeStudioNextPath("/mcp-v2"), "/studio");
    assert.equal(sanitizeStudioNextPath("/studio/login"), "/studio");
    assert.equal(sanitizeStudioNextPath("/studio/kit-a?mission_id=m1"), "/studio/kit-a?mission_id=m1");

    const { cookieValue, session } = issueStudioBrowserSession({
      sub: "founder-vip-01",
      scopes: ["video.run", "video.accept"],
      permissions: ["video.run", "video.accept"],
      secret: nativeSecret,
      stateDir,
      ttlSeconds: 600,
    });
    const verifiedSession = verifyStudioBrowserSession({
      cookieValue,
      secret: nativeSecret,
      stateDir,
    });
    assert.ok(verifiedSession);
    assert.equal(verifiedSession.sub, "founder-vip-01");
    assert.equal(verifyStudioCsrfToken(verifiedSession.csrf, verifiedSession.csrf), true);
    assert.equal(verifyStudioCsrfToken(verifiedSession.csrf, "wrong-csrf"), false);

    // Expired check
    assert.equal(
      verifyStudioBrowserSession({
        cookieValue,
        secret: nativeSecret,
        stateDir,
        nowSeconds: verifiedSession.exp + 1,
      }),
      null
    );

    // Revocation check
    assert.equal(
      revokeStudioBrowserSession({
        cookieValue,
        secret: nativeSecret,
        stateDir,
      }),
      true
    );
    assert.equal(
      verifyStudioBrowserSession({
        cookieValue,
        secret: nativeSecret,
        stateDir,
      }),
      null,
      "revoked session must fail verification across processes"
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
