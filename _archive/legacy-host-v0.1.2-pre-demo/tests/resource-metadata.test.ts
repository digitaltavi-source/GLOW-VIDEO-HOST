import test from "node:test";
import assert from "node:assert/strict";
import { buildProtectedResourceMetadata } from "../src/resource-metadata.js";

test("mcp-v2 OAuth metadata binds exact resource and issuer",()=>{
  const out=buildProtectedResourceMetadata({
    resource:"https://video.example/mcp-v2",
    authMode:"oauth",
    oauthIssuer:"https://video-auth.example/auth/v1",
    scopes:["email"]
  });
  assert.equal(out.resource,"https://video.example/mcp-v2");
  assert.deepEqual(out.scopes_supported,["email"]);
  assert.deepEqual(out.authorization_servers,["https://video-auth.example/auth/v1"]);
});

test("static bearer metadata does not advertise OAuth authorization server",()=>{
  const out=buildProtectedResourceMetadata({
    resource:"http://127.0.0.1:3000/mcp-v2",
    authMode:"static_bearer",
    oauthIssuer:null,
    scopes:["video.run"]
  });
  assert.equal(out.authorization_servers,undefined);
  assert.deepEqual(out.scopes_supported,["video.run"]);
});

test("non-local insecure resource is rejected",()=>{
  assert.throws(()=>buildProtectedResourceMetadata({
    resource:"http://video.example/mcp-v2",
    authMode:"oauth",
    oauthIssuer:"https://auth.example",
    scopes:["email"]
  }),/RESOURCE_HTTPS_REQUIRED/);
});
