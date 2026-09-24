import test from "node:test";
import assert from "node:assert/strict";
import { VideoRequest } from "../src/contracts.js";

const operations=[
  "create_video_mission",
  "get_work",
  "submit_work",
  "approve_stage",
  "get_status",
  "get_delivery"
] as const;

for(const operation of operations){
  test(`public contract admits work-loop operation: ${operation}`,()=>{
    const parsed=VideoRequest.parse({
      request_id:`test-${operation}`,
      operation,
      role:"creator",
      locale:"vi-VN",
      input:{mission_id:"M-test"}
    });
    assert.equal(parsed.operation,operation);
  });
}

test("public contract rejects Factory-canon mutation",()=>{
  assert.throws(()=>VideoRequest.parse({
    request_id:"bad",
    operation:"mutate_factory_canon",
    role:"operator",
    locale:"vi-VN",
    input:{}
  }));
});
