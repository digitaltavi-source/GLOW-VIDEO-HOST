import test from "node:test";
import assert from "node:assert/strict";
import { checkProtectedReadiness } from "../src/backend.js";
import type { HostConfig } from "../src/config.js";

const config:HostConfig={
  protectedServiceUrl:"https://protected.example",
  protectedServiceToken:"test-token",
  port:3000
};

test("readiness passes only on authenticated private mission-not-found response",async()=>{
  const fakeFetch=async()=>new Response(JSON.stringify({
    request_id:"readiness-probe-v1",
    status:"failed",
    exposure:"PUBLIC_DECLASSIFIED",
    result:null,
    public_evidence:[],
    errors:[{code:"MISSION_NOT_FOUND",message:"MISSION_NOT_FOUND",retryable:false}]
  }),{status:200,headers:{"content-type":"application/json"}});
  const out=await checkProtectedReadiness(config,fakeFetch as typeof fetch);
  assert.deepEqual(out,{ok:true,protected_service_authenticated:true,code:"PROTECTED_FACTORY_REACHABLE"});
});

test("readiness fails closed when private host is unavailable",async()=>{
  const fakeFetch=async()=>new Response("down",{status:503});
  const out=await checkProtectedReadiness(config,fakeFetch as typeof fetch);
  assert.equal(out.ok,false);
  assert.equal(out.protected_service_authenticated,false);
  assert.match(out.code,/PROTECTED_SERVICE_HTTP_503/);
});
