export type ProtectedResourceMetadata = {
  resource: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
};

export function buildProtectedResourceMetadata(args: {
  resource: string;
  authMode: string;
  oauthIssuer?: string | null;
  scopes: string[];
}): ProtectedResourceMetadata {
  const resource = new URL(args.resource);
  if (
    resource.protocol !== "https:" &&
    resource.hostname !== "127.0.0.1" &&
    resource.hostname !== "localhost"
  ) throw new Error("RESOURCE_HTTPS_REQUIRED");

  const scopes = [...new Set(args.scopes.map(v => v.trim()).filter(Boolean))];
  const out: ProtectedResourceMetadata = {
    resource: resource.toString(),
    ...(scopes.length ? { scopes_supported: scopes } : {})
  };

  if (args.authMode.trim().toLowerCase() !== "static_bearer") {
    const issuer = String(args.oauthIssuer ?? "").trim();
    if (!issuer) throw new Error("OAUTH_ISSUER_REQUIRED_FOR_RESOURCE_METADATA");
    const parsed = new URL(issuer);
    if (parsed.protocol !== "https:") throw new Error("OAUTH_ISSUER_HTTPS_REQUIRED");
    out.authorization_servers = [parsed.toString().replace(/\/$/, "")];
  }

  return out;
}
