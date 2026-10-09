import test from "node:test";
import assert from "node:assert/strict";
import { loadStaticBearerConfig, createStaticBearerVerifier } from "../src/oauth.js";

test("static bearer mode requires a sufficiently long secret",()=>{
  assert.throws(()=>loadStaticBearerConfig({GLOW_PUBLIC_TEST_BEARER_TOKEN:"short"} as NodeJS.ProcessEnv));
});

test("static bearer verifier accepts exact secret and supplies bounded subject/scope",async()=>{
  const cfg=loadStaticBearerConfig({
    GLOW_PUBLIC_TEST_BEARER_TOKEN:"12345678901234567890123456789012",
    GLOW_PUBLIC_TEST_SUBJECT:"video-smoke-user"
  } as NodeJS.ProcessEnv);
  const verifier=createStaticBearerVerifier(cfg);
  const auth=await verifier.verifyAccessToken("12345678901234567890123456789012");
  assert.equal(auth.extra?.sub,"video-smoke-user");
  assert.deepEqual(auth.scopes,["video.run"]);
});

test("static bearer verifier rejects a different secret",async()=>{
  const cfg=loadStaticBearerConfig({
    GLOW_PUBLIC_TEST_BEARER_TOKEN:"12345678901234567890123456789012"
  } as NodeJS.ProcessEnv);
  const verifier=createStaticBearerVerifier(cfg);
  await assert.rejects(()=>verifier.verifyAccessToken("abcdefghijklmnopqrstuvwxyzABCDEF"));
});
