import test from "node:test";
import assert from "node:assert/strict";
import { classifyWorkResponse } from "../src/work-response.js";

test("accepts private work package",()=>{
  assert.equal(
    classifyWorkResponse({status:"accepted",exposure:"MODEL_SESSION_PRIVATE"}),
    "PRIVATE_WORK"
  );
});

test("preserves safe declassified failure",()=>{
  assert.equal(
    classifyWorkResponse({
      status:"failed",
      exposure:"PUBLIC_DECLASSIFIED",
      errors:[{code:"MISSION_NOT_FOUND"}]
    }),
    "SAFE_PUBLIC_FAILURE"
  );
});

test("rejects unexpected successful public work response",()=>{
  assert.throws(
    ()=>classifyWorkResponse({status:"accepted",exposure:"PUBLIC_DECLASSIFIED"}),
    /WORK_EXPOSURE_INVALID/
  );
});
