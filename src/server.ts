import { randomUUID } from "node:crypto";
import { createMcpExpressApp, getOAuthProtectedResourceMetadataUrl, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import type { McpServerFactory } from "@modelcontextprotocol/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { loadConfig } from "./config.js";
import { loadOAuthConfig, loadStaticBearerConfig, createJwtVerifier, createStaticBearerVerifier } from "./oauth.js";
import { callProtectedService, checkProtectedReadiness } from "./backend.js";
import { VideoRequest } from "./contracts.js";
import { classifyWorkResponse } from "./work-response.js";
import { buildProtectedResourceMetadata } from "./resource-metadata.js";

const config=loadConfig();
const authMode=(process.env.GLOW_AUTH_MODE?.trim() || "oauth").toLowerCase();
const oauthConfig=authMode==="static_bearer"?null:loadOAuthConfig();
const requiredScopes=authMode==="static_bearer"
  ? ["video.run"]
  : (process.env.GLOW_OAUTH_REQUIRED_SCOPES ?? "openid email").split(/\s+/).map(v=>v.trim()).filter(Boolean);
const verifier=authMode==="static_bearer"
  ? createStaticBearerVerifier(loadStaticBearerConfig())
  : createJwtVerifier(oauthConfig!);
const toolSecuritySchemes=authMode==="static_bearer"?undefined:[{type:"oauth2" as const,scopes:requiredScopes}];

function toolResult(value:Record<string,unknown>){
  return {structuredContent:value,content:[{type:"text" as const,text:JSON.stringify(value)}]};
}
function toolError(code:string){
  return {
    isError:true,
    structuredContent:{status:"failed",exposure:"PUBLIC_DECLASSIFIED",errors:[{code,message:code,retryable:false}]},
    content:[{type:"text" as const,text:code}]
  };
}
function subjectFrom(ctx:{authInfo?:{scopes:string[];extra?:Record<string,unknown>}}){
  const subject=ctx.authInfo?.extra?.["sub"];
  if(typeof subject!=="string" || !subject) throw new Error("AUTH_REQUIRED");
  if(!requiredScopes.every(scope=>ctx.authInfo!.scopes.includes(scope))) throw new Error("SCOPE_REQUIRED");
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
  const request=VideoRequest.parse({request_id:request_id ?? randomUUID(),operation,role,locale,input});
  return callProtectedService(config,subjectFrom(ctx),request);
}

const buildServer:McpServerFactory=ctx=>{
  const server=new McpServer(
    {name:"glow-video",version:"0.1.0"},
    {instructions:"Use GLOW Video only for the user's explicit video mission. ChatGPT is the reasoning host. The protected backend owns Factory state, Kit sequencing, Reference Bible/anchor state, validation, approval binding, Director Gate, evidence and delivery. Perform only bounded returned work and never invent approvals, evidence or Factory state."}
  );

  server.registerTool("glow_video_public_profile",{
    title:"GLOW Video public profile",
    description:"Returns public host status and claim boundary.",
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
    inputSchema:z.object({})
  },async()=>toolResult({product:"GLOW Video",version:"0.1.0-candidate",status:"CHATGPT_WORK_LOOP_CANDIDATE"}));

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
    try{return toolResult(await invoke(ctx,"create_video_mission",role,locale,input,request_id) as unknown as Record<string,unknown>);}
    catch(error){return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");}
  });

  server.registerTool("glow_get_factory_work",{
    title:"Get the next bounded Video Factory work package",
    description:"Returns MODEL_SESSION_PRIVATE work for ChatGPT reasoning; never present it as public Factory output.",
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
      if(classification==="SAFE_PUBLIC_FAILURE") return {isError:true,...toolResult(out as unknown as Record<string,unknown>)};
      return toolResult(out as unknown as Record<string,unknown>);
    }catch(error){return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");}
  });

  server.registerTool("glow_submit_factory_work",{
    title:"Submit completed bounded Video Factory work",
    description:"Submits ChatGPT's result for the exact current work token.",
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
    try{return toolResult(await invoke(ctx,"submit_work",role,locale,{mission_id,work_token,result}) as unknown as Record<string,unknown>);}
    catch(error){return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");}
  });

  server.registerTool("glow_approve_factory_stage",{
    title:"Approve or reject exact Factory stage candidate",
    description:"Binds the user's decision to exact candidate, assurance and freeze-input hashes.",
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
    }catch(error){return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");}
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
    }catch(error){return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");}
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
    }catch(error){return toolError(error instanceof Error?error.message:"HOST_REQUEST_FAILED");}
  });

  return server;
};

const handler=createMcpHandler(buildServer);
const app=createMcpExpressApp({
  host:"0.0.0.0",
  allowedHosts:(process.env.GLOW_ALLOWED_HOSTS ?? "localhost,127.0.0.1").split(",").map(v=>v.trim()).filter(Boolean)
});

const mcpServerUrl=new URL(process.env.GLOW_PUBLIC_MCP_URL ?? `http://127.0.0.1:${config.port}/mcp`);
const resourceMetadataUrl=getOAuthProtectedResourceMetadataUrl(mcpServerUrl);
const resourceMetadata=buildProtectedResourceMetadata({
  resource:mcpServerUrl.toString(),
  authMode,
  oauthIssuer:oauthConfig?.issuer,
  scopes:requiredScopes
});
const auth=requireBearerAuth({verifier,requiredScopes,resourceMetadataUrl});
const node=toNodeHandler(handler);

app.get(new URL(resourceMetadataUrl).pathname,(_req,res)=>res.json(resourceMetadata));
app.get("/healthz",(_req,res)=>res.json({
  ok:true,
  product:"GLOW Video",
  version:"0.1.0-candidate",
  mode:"CHATGPT_WORK_LOOP"
}));
app.get("/readyz",async(_req,res)=>{
  const readiness=await checkProtectedReadiness(config);
  res.status(readiness.ok?200:503).json({
    ok:readiness.ok,
    product:"GLOW Video",
    public_host:"running",
    protected_factory:readiness.ok?"reachable_authenticated":"unavailable",
    code:readiness.code
  });
});
app.all("/mcp",auth,(req,res)=>void node(req,res,req.body));

app.listen(config.port,()=>console.error(`GLOW Video public host listening on :${config.port}`));
