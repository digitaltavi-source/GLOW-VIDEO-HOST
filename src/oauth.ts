import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/express";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";

export type OAuthConfig = {
  issuer: string;
  audience: string;
  jwksUrl: string;
};

export type StaticBearerConfig = {
  token: string;
  subject: string;
};

export function loadOAuthConfig(env = process.env): OAuthConfig {
  const issuer = env.GLOW_OAUTH_ISSUER?.trim();
  const audience = env.GLOW_OAUTH_AUDIENCE?.trim();
  const jwksUrl = env.GLOW_OAUTH_JWKS_URL?.trim();

  if (!issuer) throw new Error("CONFIG_OAUTH_ISSUER_REQUIRED");
  if (!audience) throw new Error("CONFIG_OAUTH_AUDIENCE_REQUIRED");
  if (!jwksUrl) throw new Error("CONFIG_OAUTH_JWKS_URL_REQUIRED");

  return { issuer, audience, jwksUrl };
}

export function loadStaticBearerConfig(env = process.env): StaticBearerConfig {
  const token = env.GLOW_PUBLIC_TEST_BEARER_TOKEN?.trim();
  const subject = env.GLOW_PUBLIC_TEST_SUBJECT?.trim() || "hostinger-video-test-user";
  if (!token) throw new Error("CONFIG_PUBLIC_TEST_BEARER_TOKEN_REQUIRED");
  if (token.length < 32) throw new Error("CONFIG_PUBLIC_TEST_BEARER_TOKEN_TOO_SHORT");
  return { token, subject };
}

export function createStaticBearerVerifier(config: StaticBearerConfig): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const expected = Buffer.from(config.token);
      const got = Buffer.from(token);
      const ok = expected.length === got.length && timingSafeEqual(expected, got);
      if (!ok) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, "invalid static bearer token");
      }
      return {
        token,
        clientId: "glow-video-hostinger-test",
        scopes: ["video.run"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        extra: { sub: config.subject }
      };
    }
  };
}

export function createJwtVerifier(config: OAuthConfig): OAuthTokenVerifier {
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          issuer: config.issuer,
          audience: config.audience
        });

        const subject = payload.sub;
        const exp = payload.exp;
        if (!subject || !exp) {
          throw new OAuthError(OAuthErrorCode.InvalidToken, "missing subject or expiry");
        }

        const rawScope = payload["scope"];
        const rawScp = payload["scp"];
        const scopes =
          typeof rawScope === "string"
            ? rawScope.split(/\s+/).filter(Boolean)
            : Array.isArray(rawScp)
              ? rawScp.filter((v): v is string => typeof v === "string")
              : [];

        const clientId =
          typeof payload["azp"] === "string"
            ? payload["azp"]
            : typeof payload["client_id"] === "string"
              ? payload["client_id"]
              : subject;

        return {
          token,
          clientId,
          scopes,
          expiresAt: exp,
          extra: { sub: subject }
        };
      } catch (error) {
        if (error instanceof OAuthError) throw error;
        throw new OAuthError(OAuthErrorCode.InvalidToken, "token verification failed");
      }
    }
  };
}

export function createHybridVerifier(args: {
  staticConfig: StaticBearerConfig;
  oauthConfig: OAuthConfig;
  oauthScopes?: string[];
}): OAuthTokenVerifier {
  const staticVerifier = createStaticBearerVerifier(args.staticConfig);
  const jwtVerifier = createJwtVerifier(args.oauthConfig);
  const oauthScopes = args.oauthScopes?.length ? args.oauthScopes : ["openid", "email"];

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const info = await staticVerifier.verifyAccessToken(token);
        return { ...info, scopes: [...new Set([...info.scopes, ...oauthScopes])] };
      } catch {}
      return jwtVerifier.verifyAccessToken(token);
    }
  };
}
