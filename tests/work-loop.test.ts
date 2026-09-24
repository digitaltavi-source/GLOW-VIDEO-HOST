import test from "node:test";
import assert from "node:assert/strict";
import { callProtectedService, BackendError } from "../src/backend.js";
import type { HostConfig } from "../src/config.js";
import type { VideoRequestType } from "../src/contracts.js";

const config:HostConfig={
  protectedServiceUrl:"https://protected.example",
  protectedServiceToken:"test-token",
  port:3000
};

function req(operation:VideoRequestType["operation"],request_id:string,input:Record<string,unknown>):VideoRequestType{
  return {request_id,operation,role:"creator",locale:"vi-VN",input};
}

test("NORMAL: public host preserves Video work-loop exposure transitions",async()=>{
  const mission="M-video-test";
  const seen:string[]=[];
  const fakeFetch=async(_url:string|URL|Request,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body ?? "{}")) as VideoRequestType;
    seen.push(body.operation);
    const base={request_id:body.request_id,public_evidence:[],errors:[]};
    if(body.operation==="create_video_mission"){
      return new Response(JSON.stringify({...base,status:"accepted",exposure:"PUBLIC_DECLASSIFIED",result:{mission_id:mission,state:"H1_WORKING",stage:"H1",next_action:"get_work"}}),{status:200});
    }
    if(body.operation==="get_work"){
      return new Response(JSON.stringify({...base,status:"accepted",exposure:"MODEL_SESSION_PRIVATE",result:{mission_id:mission,state:"H1_WORKING",stage:"H1",work:{kind:"CAPABILITY_SCREENING",work_token:"opaque",payload:{job:"screen"}}}}),{status:200});
    }
    if(body.operation==="submit_work"){
      return new Response(JSON.stringify({...base,status:"accepted",exposure:"PUBLIC_DECLASSIFIED",result:{mission_id:mission,state:"H1_AWAITING_APPROVAL",stage:"H1",approval_required:{candidate_sha256:"a".repeat(64),assurance_sha256:"b".repeat(64),freeze_input_bundle_hash:"c".repeat(64)}}}),{status:200});
    }
    if(body.operation==="approve_stage"){
      return new Response(JSON.stringify({...base,status:"accepted",exposure:"PUBLIC_DECLASSIFIED",result:{mission_id:mission,state:"H2_WORKING",stage:"H2",next_action:"get_work"}}),{status:200});
    }
    if(body.operation==="get_status"){
      return new Response(JSON.stringify({...base,status:"accepted",exposure:"PUBLIC_DECLASSIFIED",result:{mission_id:mission,state:"H2_WORKING",stage:"H2",next_action:"get_work"}}),{status:200});
    }
    return new Response(JSON.stringify({...base,status:"completed",exposure:"PUBLIC_DECLASSIFIED",result:{mission_id:mission,state:"COMPLETED",output:{delivery_id:"D1"}}}),{status:200});
  };

  assert.equal((await callProtectedService(config,"user-1",req("create_video_mission","r-start",{goal:"demo"}),fakeFetch as typeof fetch)).exposure,"PUBLIC_DECLASSIFIED");
  assert.equal((await callProtectedService(config,"user-1",req("get_work","r-work",{mission_id:mission}),fakeFetch as typeof fetch)).exposure,"MODEL_SESSION_PRIVATE");
  assert.equal((await callProtectedService(config,"user-1",req("submit_work","r-submit",{mission_id:mission,work_token:"opaque",result:{}}),fakeFetch as typeof fetch)).exposure,"PUBLIC_DECLASSIFIED");
  assert.equal((await callProtectedService(config,"user-1",req("approve_stage","r-approve",{mission_id:mission,approval:{decision:"APPROVE"}}),fakeFetch as typeof fetch)).exposure,"PUBLIC_DECLASSIFIED");
  assert.equal((await callProtectedService(config,"user-1",req("get_status","r-status",{mission_id:mission}),fakeFetch as typeof fetch)).exposure,"PUBLIC_DECLASSIFIED");
  assert.equal((await callProtectedService(config,"user-1",req("get_delivery","r-delivery",{mission_id:mission}),fakeFetch as typeof fetch)).status,"completed");
  assert.deepEqual(seen,["create_video_mission","get_work","submit_work","approve_stage","get_status","get_delivery"]);
});

test("ADVERSARIAL: extra private trace is blocked at host boundary",async()=>{
  const fakeFetch=async()=>new Response(JSON.stringify({
    request_id:"r-leak",
    status:"accepted",
    exposure:"MODEL_SESSION_PRIVATE",
    result:{mission_id:"M-video-test",work:{kind:"CAPABILITY_EXECUTION"}},
    public_evidence:[],
    errors:[],
    internal_trace:"forbidden"
  }),{status:200});
  await assert.rejects(
    ()=>callProtectedService(config,"user-1",req("get_work","r-leak",{mission_id:"M-video-test"}),fakeFetch as typeof fetch),
    (e:unknown)=>e instanceof BackendError && e.message==="DECLASSIFICATION_SCHEMA_REJECTED"
  );
});

test("FAILURE/RECOVERY: backend 503 is surfaced, later retry can succeed",async()=>{
  let calls=0;
  const fakeFetch=async()=>{
    calls++;
    if(calls===1) return new Response("down",{status:503});
    return new Response(JSON.stringify({
      request_id:"r-retry",
      status:"accepted",
      exposure:"PUBLIC_DECLASSIFIED",
      result:{mission_id:"M-video-test",state:"H1_WORKING"},
      public_evidence:[],
      errors:[]
    }),{status:200});
  };

  await assert.rejects(
    ()=>callProtectedService(config,"user-1",req("get_status","r-retry",{mission_id:"M-video-test"}),fakeFetch as typeof fetch),
    /PROTECTED_SERVICE_HTTP_503/
  );
  const recovered=await callProtectedService(config,"user-1",req("get_status","r-retry",{mission_id:"M-video-test"}),fakeFetch as typeof fetch);
  assert.equal(recovered.status,"accepted");
});
