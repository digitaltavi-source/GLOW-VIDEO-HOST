import test from "node:test";
import assert from "node:assert/strict";
import { workspaceHtml } from "../src/workspace.js";

test("workspace exposes intake status delivery surface",()=>{
  const html=workspaceHtml();
  assert.match(html,/GLOW Video Studio/);
  assert.match(html,/Giao brief/);
  assert.match(html,/Tiếp tục trong ChatGPT/);
  assert.match(html,/Nhận delivery/);
  assert.match(html,/PUBLIC_DECLASSIFIED/);
  assert.match(html,/HOST ≠ FACTORY/);
  assert.match(html,/\/workspace-client\.js/);
});

test("workspace does not embed private implementation markers or secrets",()=>{
  const html=workspaceHtml();
  const forbidden=[
    "GLOW_PRIVATE_BEARER_TOKEN=",
    "DB_PASSWORD=",
    "capability-plane",
    "process-plane",
    "factory-control",
    "sk-proj-",
    "ghp_",
    "BEGIN PRIVATE KEY"
  ];
  for(const marker of forbidden){
    assert.equal(html.includes(marker),false,marker);
  }
});

test("workspace explicitly keeps work and approval authority out of web",()=>{
  const html=workspaceHtml();
  assert.match(html,/không được phép submit work package hay approve H1\/H2\/H3/i);
  assert.match(html,/Approval và work execution vẫn ở ChatGPT\/Factory/i);
  assert.doesNotMatch(html,/\/api\/workspace\/.*approve/);
  assert.doesNotMatch(html,/\/api\/workspace\/.*submit/);
  assert.doesNotMatch(html,/\/api\/workspace\/.*get_work/);
});
