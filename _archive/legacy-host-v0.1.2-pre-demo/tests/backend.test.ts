import test from "node:test";
import assert from "node:assert/strict";
import { callProtectedService, BackendError } from "../src/backend.js";
import type { HostConfig } from "../src/config.js";

const config:HostConfig={
  protectedServiceUrl:"https://private.example",
  protectedServiceToken:"secret",
  port:3000
};
const request={
  request_id:"r1",
  operation:"get_status" as const,
  role:"creator" as const,
  locale:"vi-VN",
  input:{mission_id:"M1"}
};

test("backend admits strict declassified response",async()=>{
  const fake=async()=>new Response(JSON.stringify({
    request_id:"r1",
    status:"completed",
    result:{state:"H1"},
    public_evidence:[],
    errors:[],
    exposure:"PUBLIC_DECLASSIFIED"
  }),{status:200,headers:{"content-type":"application/json"}});
  const out=await callProtectedService(config,"user-1",request,fake as typeof fetch);
  assert.equal(out.exposure,"PUBLIC_DECLASSIFIED");
});

test("backend rejects undeclared/private fields crossing public schema",async()=>{
  const fake=async()=>new Response(JSON.stringify({
    request_id:"r1",
    status:"completed",
    result:{},
    public_evidence:[],
    errors:[],
    exposure:"PUBLIC_DECLASSIFIED",
    private_prompt:"LEAK"
  }),{status:200,headers:{"content-type":"application/json"}});
  await assert.rejects(
    ()=>callProtectedService(config,"user-1",request,fake as typeof fetch),
    (err:unknown)=>err instanceof BackendError && err.message==="DECLASSIFICATION_SCHEMA_REJECTED"
  );
});
