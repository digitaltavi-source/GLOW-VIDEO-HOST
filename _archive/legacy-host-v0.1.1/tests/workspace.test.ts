import test from "node:test";
import assert from "node:assert/strict";
import { workspaceHtml } from "../src/workspace.js";

test("workspace exposes public Studio surface",()=>{
  const html=workspaceHtml();
  assert.match(html,/GLOW Video Studio/);
  assert.match(html,/Mở ChatGPT/);
  assert.match(html,/\/mcp-v2/);
  assert.match(html,/PUBLIC_DECLASSIFIED/);
  assert.match(html,/HOST ≠ FACTORY/);
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

test("workspace draft is browser-local and does not submit a server mission",()=>{
  const html=workspaceHtml();
  assert.match(html,/localStorage/);
  assert.match(html,/Bản nháp này chỉ lưu trên trình duyệt/);
  assert.doesNotMatch(html,/fetch\(["']\/v1\/video-missions/);
});
