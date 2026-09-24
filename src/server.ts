import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Request, Response } from "express";
import {
  createMcpExpressApp,
  getOAuthProtectedResourceMetadataUrl,
  requireBearerAuth
} from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { McpServerFactory } from "@modelcontextprotocol/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadConfig } from "./config.js";
import {
  loadOAuthConfig,
  loadStaticBearerConfig,
  createJwtVerifier,
  createStaticBearerVerifier,
  createHybridVerifier
} from "./oauth.js";
import { callProtectedService, checkProtectedReadiness } from "./backend.js";
import { VideoRequest } from "./contracts.js";
import { classifyWorkResponse } from "./work-response.js";
import { buildProtectedResourceMetadata } from "./resource-metadata.js";

const config=loadConfig();
const canonicalMcpUrl=new URL(process.env.GLOW_PUBLIC_MCP_URL ?? `http://127.0.0.1:${config.port}/mcp-v2`);
const publicOrigin=canonicalMcpUrl.origin;
const publicAuthorizationServerBase=(process.env.GLOW_PUBLIC_AUTHORIZATION_SERVER?.trim() || publicOrigin).replace(/\/$/,"");
const configuredAuthMode=(process.env.GLOW_AUTH_MODE?.trim() || "oauth").toLowerCase();
if(!["static_bearer","oauth","hybrid"].includes(configuredAuthMode)){
  throw new Error("CONFIG_AUTH_MODE_INVALID");
}
const authMode=configuredAuthMode as "static_bearer"|"oauth"|"hybrid";
const oauthConfig=authMode==="static_bearer" ? null : loadOAuthConfig();
const requiredScopes=authMode==="static_bearer"
  ? ["video.run"]
  : (process.env.GLOW_OAUTH_REQUIRED_SCOPES ?? "email")
      .split(/\s+/).map(v=>v.trim()).filter(Boolean);

const verifier=authMode==="static_bearer"
  ? createStaticBearerVerifier(loadStaticBearerConfig())
  : authMode==="hybrid"
    ? createHybridVerifier({
        staticConfig:loadStaticBearerConfig(),
        oauthConfig:oauthConfig!,
        oauthScopes:requiredScopes
      })
    : createJwtVerifier(oauthConfig!);

const toolSecuritySchemes=authMode==="static_bearer"
  ? undefined
  : [{type:"oauth2" as const,scopes:requiredScopes}];

function toolResult(value:Record<string,unknown>){
  return {
    structuredContent:value,
    content:[{type:"text" as const,text:JSON.stringify(value)}]
  };
}
function toolError(code:string){
  return {
    isError:true,
    structuredContent:{
      status:"failed",
      exposure:"PUBLIC_DECLASSIFIED",
      errors:[{code,message:code,retryable:false}]
    },
    content:[{type:"text" as const,text:code}]
  };
}
function subjectFrom(ctx:{authInfo?:{scopes:string[];extra?:Record<string,unknown>}}){
  const authInfo=ctx.authInfo;
  const subject=authInfo?.extra?.["sub"];
  if(typeof subject!=="string" || !subject) throw new Error("AUTH_REQUIRED");
  if(!requiredScopes.every(scope=>authInfo.scopes.includes(scope))) throw new Error("SCOPE_REQUIRED");
  return subject;
}
async function invoke(
  ctx:{authInfo?:{scopes:string[];extra?:Record<string,unknown>}},
  operation:"create_video_mission"|"get_work"|"submit_work"|"approve_stage"|"get_status"|"get_delivery",
  role:"creator"|"client"|"operator"|"unspecified",
  locale:string,
  input:Record<string,unknown>,
  request_id?:string
){
  const request=VideoRequest.parse({
    request_id:request_id ?? randomUUID(),
    operation,role,locale,input
  });
  return callProtectedService(config,subjectFrom(ctx),request);
}

const buildServer:McpServerFactory=ctx=>{
  const server=new McpServer(
    {name:"glow-video",version:"0.1.1-rc1"},
    {
      instructions:
        "Use GLOW Video only for the user's explicit video mission. ChatGPT is the bounded reasoning host. The protected Video Factory owns mission state, Kit sequencing, Reference Bible and frozen anchors, capability coverage, candidate validation, approval binding, Director Gate, evidence and delivery. Perform only the current work package and never invent approvals, evidence, provider execution or Factory state."
    }
  );

  server.registerTool("glow_video_public_profile",{
    title:"GLOW Video public profile",
    description:"Returns public host status and claim boundary.",
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    inputSchema:z.object({})
  },async()=>toolResult({
    product:"GLOW Video",
    version:"0.1.1-rc1",
    status:"CHATGPT_WORK_LOOP_HOST_CANDIDATE"
  }));

  server.registerTool("glow_start_video_mission",{
    title:"Start a GLOW Video mission",
    description:"Creates a protected Video Factory mission. Then call glow_get_factory_work.",
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},
    ...(toolSecuritySchemes?{securitySchemes:toolSecuritySchemes}:{}),
    inputSchema:z.object({
      request_id:z.string().min(1).max(128).optional(),
      role:z.enum(["creator","client","operator","unspecified"]).default("unspecified"),
      locale:z.string().min(2).max(32).default("vi-VN"),
      input:z.record(z.string(),z.unknown())
    })
  },async({request_id,role,locale,input})=>{
    try{
      return toolResult(await invoke(ctx,"create_video_mission",role,locale,input,request_id) as unknown as Record<string,unknown>);
    }catch(error){
      return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");
    }
  });

  server.registerTool("glow_get_factory_work",{
    title:"Get the next bounded Video Factory work package",
    description:"Returns MODEL_SESSION_PRIVATE work for ChatGPT reasoning. Do not present raw work-package internals as public output.",
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},
    ...(toolSecuritySchemes?{securitySchemes:toolSecuritySchemes}:{}),
    inputSchema:z.object({
      mission_id:z.string().min(1).max(128),
      role:z.enum(["creator","client","operator","unspecified"]).default("unspecified"),
      locale:z.string().min(2).max(32).default("vi-VN")
    })
  },async({mission_id,role,locale})=>{
    try{
      const out=await invoke(ctx,"get_work",role,locale,{mission_id});
      const classification=classifyWorkResponse(out);
      if(classification==="SAFE_PUBLIC_FAILURE"){
        return {isError:true,...toolResult(out as unknown as Record<string,unknown>)};
      }
      return toolResult(out as unknown as Record<string,unknown>);
    }catch(error){
      return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");
    }
  });

  server.registerTool("glow_submit_factory_work",{
    title:"Submit completed bounded Video Factory work",
    description:"Submits ChatGPT's result for the exact current work token. The Factory validates it and returns the next work package or approval boundary.",
    annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false},
    ...(toolSecuritySchemes?{securitySchemes:toolSecuritySchemes}:{}),
    inputSchema:z.object({
      mission_id:z.string().min(1).max(128),
      work_token:z.string().min(1).max(256),
      result:z.record(z.string(),z.unknown()),
      role:z.enum(["creator","client","operator","unspecified"]).default("unspecified"),
      locale:z.string().min(2).max(32).default("vi-VN")
    })
  },async({mission_id,work_token,result,role,locale})=>{
    try{
      return toolResult(await invoke(ctx,"submit_work",role,locale,{mission_id,work_token,result}) as unknown as Record<string,unknown>);
    }catch(error){
      return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");
    }
  });

  server.registerTool("glow_approve_factory_stage",{
    title:"Approve or reject the exact Video Factory stage candidate",
    description:"Binds the user's explicit decision to exact candidate, assurance and freeze-input hashes. Never infer approval from chat sentiment.",
    annotations:{readOnlyHint:false,destructiveHint:true,openWorldHint:false},
    ...(toolSecuritySchemes?{securitySchemes:toolSecuritySchemes}:{}),
    inputSchema:z.object({
      mission_id:z.string().min(1).max(128),
      approval:z.object({
        mission_id:z.string().min(1).max(128),
        stage:z.enum(["H1","H2","H3"]),
        decision:z.enum(["APPROVE","REJECT"]),
        candidate_sha256:z.string().length(64),
        assurance_sha256:z.string().length(64),
        freeze_input_bundle_hash:z.string().length(64)
      }).strict(),
      role:z.enum(["creator","client","operator","unspecified"]).default("unspecified"),
      locale:z.string().min(2).max(32).default("vi-VN")
    })
  },async({mission_id,approval,role,locale})=>{
    try{
      const out=await invoke(ctx,"approve_stage",role,locale,{mission_id,approval});
      if(out.exposure!=="PUBLIC_DECLASSIFIED") throw new Error("APPROVAL_RESPONSE_EXPOSURE_INVALID");
      return toolResult(out as unknown as Record<string,unknown>);
    }catch(error){
      return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");
    }
  });

  server.registerTool("glow_get_factory_status",{
    title:"Get GLOW Video Factory mission status",
    description:"Returns declassified mission state and next allowed action.",
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    ...(toolSecuritySchemes?{securitySchemes:toolSecuritySchemes}:{}),
    inputSchema:z.object({
      mission_id:z.string().min(1).max(128),
      role:z.enum(["creator","client","operator","unspecified"]).default("unspecified"),
      locale:z.string().min(2).max(32).default("vi-VN")
    })
  },async({mission_id,role,locale})=>{
    try{
      const out=await invoke(ctx,"get_status",role,locale,{mission_id});
      if(out.exposure!=="PUBLIC_DECLASSIFIED") throw new Error("STATUS_EXPOSURE_INVALID");
      return toolResult(out as unknown as Record<string,unknown>);
    }catch(error){
      return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");
    }
  });

  server.registerTool("glow_get_delivery",{
    title:"Get final GLOW Video delivery",
    description:"Returns only PUBLIC_DECLASSIFIED delivery after H3 admission.",
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    ...(toolSecuritySchemes?{securitySchemes:toolSecuritySchemes}:{}),
    inputSchema:z.object({
      mission_id:z.string().min(1).max(128),
      role:z.enum(["creator","client","operator","unspecified"]).default("unspecified"),
      locale:z.string().min(2).max(32).default("vi-VN")
    })
  },async({mission_id,role,locale})=>{
    try{
      const out=await invoke(ctx,"get_delivery",role,locale,{mission_id});
      if(out.exposure!=="PUBLIC_DECLASSIFIED") throw new Error("DELIVERY_EXPOSURE_INVALID");
      return toolResult(out as unknown as Record<string,unknown>);
    }catch(error){
      return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");
    }
  });

  return server;
};

const handler=createMcpHandler(buildServer);
const app=createMcpExpressApp({
  host:"0.0.0.0",
  allowedHosts:(process.env.GLOW_ALLOWED_HOSTS ?? "localhost,127.0.0.1")
    .split(",").map(v=>v.trim()).filter(Boolean)
});

const mcpV1ServerUrl=new URL("/mcp",publicOrigin);
const mcpV2ServerUrl=new URL("/mcp-v2",publicOrigin);
const oauthIssuerForMetadata=authMode==="static_bearer" ? null : oauthConfig!.issuer;

function makeResourceBinding(serverUrl:URL){
  const metadataUrl=getOAuthProtectedResourceMetadataUrl(serverUrl);
  const metadata=buildProtectedResourceMetadata({
    resource:serverUrl.toString(),
    authMode,
    oauthIssuer:oauthIssuerForMetadata,
    scopes:requiredScopes
  });
  const auth=requireBearerAuth({
    verifier,
    requiredScopes,
    resourceMetadataUrl:metadataUrl
  });
  return {metadataUrl,metadata,auth};
}

const mcpV1=makeResourceBinding(mcpV1ServerUrl);
const mcpV2=makeResourceBinding(mcpV2ServerUrl);
const node=toNodeHandler(handler);

app.get(new URL(mcpV1.metadataUrl).pathname,(_req:Request,res:Response)=>res.json(mcpV1.metadata));
app.get(new URL(mcpV2.metadataUrl).pathname,(_req:Request,res:Response)=>res.json(mcpV2.metadata));

app.get("/.well-known/oauth-authorization-server",(_req:Request,res:Response)=>{
  if(authMode==="static_bearer" || !oauthConfig){
    res.status(404).json({error:"OAUTH_NOT_CONFIGURED"});
    return;
  }
  const issuer=oauthConfig.issuer.replace(/\/$/,"");
  res.json({
    issuer:publicAuthorizationServerBase,
    authorization_endpoint:`${issuer}/oauth/authorize`,
    token_endpoint:`${issuer}/oauth/token`,
    registration_endpoint:`${issuer}/oauth/clients/register`,
    scopes_supported:["email","profile","openid"],
    response_types_supported:["code"],
    grant_types_supported:["authorization_code","refresh_token"],
    token_endpoint_auth_methods_supported:["none","client_secret_post","client_secret_basic"],
    code_challenge_methods_supported:["S256"]
  });
});

const publicDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../public");

app.get("/oauth-config.js",(_req:Request,res:Response)=>{
  const supabaseUrl=process.env.GLOW_SUPABASE_URL?.trim();
  const supabasePublishableKey=process.env.GLOW_SUPABASE_PUBLISHABLE_KEY?.trim();
  if(!supabaseUrl || !supabasePublishableKey){
    res.status(503).type("application/javascript").send(
      "throw new Error('VIDEO_OAUTH_PUBLIC_CONFIG_MISSING');"
    );
    return;
  }
  res.type("application/javascript").send(
    `window.__GLOW_VIDEO_OAUTH_CONFIG__=${JSON.stringify({supabaseUrl,supabasePublishableKey})};`
  );
});

app.get("/oauth-client.js",(_req:Request,res:Response)=>{
  res.type("application/javascript");
  res.sendFile(path.join(publicDir,"oauth-client.js"));
});

app.get("/oauth/consent",(_req:Request,res:Response)=>{
  if(authMode==="static_bearer"){
    res.status(404).type("text").send("OAuth is not configured for this deployment.");
    return;
  }
  res.type("html").send(`<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GLOW Video — Cấp quyền</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717;background:#f6f7fb}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
main{width:min(560px,100%);background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:28px;box-shadow:0 18px 50px rgba(0,0,0,.08)}
h1{font-size:24px;margin:0 0 8px}.muted{color:#666;line-height:1.55}.card{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:18px 0}
label{display:block;font-weight:600;margin:12px 0 6px}input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:9px}
button{border:0;border-radius:9px;padding:11px 16px;font-weight:700;cursor:pointer}.primary{background:#111827;color:#fff}.secondary{background:#eef2f7}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}#status{font-size:14px;margin-top:16px;color:#475569}#status[data-error="1"]{color:#b91c1c}
code{word-break:break-all;font-size:12px}
</style>
</head>
<body>
<main>
<h1>GLOW Video</h1>
<p class="muted">ChatGPT đang yêu cầu quyền sử dụng GLOW Video thay mặt bạn. Factory chỉ nhận quyền sau khi bạn xác nhận.</p>
<section id="login-panel" class="card" hidden>
<label for="email">Email</label>
<input id="email" type="email" autocomplete="email" placeholder="you@example.com">
<div class="actions"><button id="signin" class="primary" type="button">Gửi liên kết đăng nhập</button></div>
</section>
<section id="consent-panel" class="card" hidden>
<p><strong>Ứng dụng:</strong> <span id="client-name">ChatGPT</span></p>
<p><strong>Quyền yêu cầu:</strong> <span id="scopes"></span></p>
<p class="muted"><strong>Callback:</strong> <code id="redirect-uri"></code></p>
<div class="actions">
<button id="approve" class="primary" type="button">Cho phép</button>
<button id="deny" class="secondary" type="button">Từ chối</button>
</div>
</section>
<p id="status" aria-live="polite">Đang kiểm tra yêu cầu…</p>
</main>
<script src="/oauth-config.js"></script>
<script src="/oauth-client.js"></script>
</body>
</html>`);
});

app.get("/healthz",(_req:Request,res:Response)=>{
  res.json({
    ok:true,
    product:"GLOW Video",
    version:"0.1.1-rc1",
    mode:"CHATGPT_WORK_LOOP",
    canonical_mcp_path:"/mcp-v2"
  });
});

app.get("/readyz",async(_req:Request,res:Response)=>{
  const readiness=await checkProtectedReadiness(config);
  res.status(readiness.ok?200:503).json({
    ok:readiness.ok,
    product:"GLOW Video",
    public_host:"running",
    protected_factory:readiness.ok?"reachable_authenticated":"unavailable",
    code:readiness.code
  });
});

app.all("/mcp",mcpV1.auth,(req:Request,res:Response)=>void node(req,res,req.body));
app.all("/mcp-v2",mcpV2.auth,(req:Request,res:Response)=>void node(req,res,req.body));

app.listen(config.port,()=>{
  console.error(`GLOW Video public host listening on :${config.port}`);
});
