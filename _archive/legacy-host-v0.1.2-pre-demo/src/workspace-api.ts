import { json as expressJson, type Express, type NextFunction, type Request, type Response } from "express";
import * as z from "zod/v4";
import type { HostConfig } from "./config.js";
import type { OAuthConfig } from "./oauth.js";
import { createJwtVerifier } from "./oauth.js";
import { callProtectedService } from "./backend.js";
import { VideoRequest } from "./contracts.js";

export function workspaceSecurityHeaders(req:Request,res:Response,next:NextFunction){
  const supabaseOrigin=process.env.GLOW_SUPABASE_URL?.trim()||"";
  res.setHeader("x-content-type-options","nosniff");
  res.setHeader("referrer-policy","no-referrer");
  res.setHeader("x-frame-options","DENY");
  res.setHeader("permissions-policy","camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; "+
    "img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "+
    "connect-src 'self' "+supabaseOrigin+"; form-action 'self'"
  );
  next();
}

async function subjectFromRequest(req:Request,oauthConfig:OAuthConfig){
  const raw=String(req.headers.authorization??"");
  if(!raw.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  const verifier=createJwtVerifier(oauthConfig);
  const info=await verifier.verifyAccessToken(raw.slice(7));
  const subject=info.extra?.["sub"];
  if(typeof subject!=="string" || !subject) throw new Error("AUTH_REQUIRED");
  return subject;
}

async function invokePublic(
  config:HostConfig,
  subject:string,
  operation:"create_video_mission"|"get_status"|"get_delivery",
  input:Record<string,unknown>,
  role:"creator"|"client"|"operator"|"unspecified"="creator",
  locale="vi-VN",
  request_id:string=crypto.randomUUID()
){
  const request=VideoRequest.parse({request_id,operation,role,locale,input});
  const out=await callProtectedService(config,subject,request);
  if(out.exposure!=="PUBLIC_DECLASSIFIED") throw new Error("WORKSPACE_EXPOSURE_INVALID");
  return out;
}

function failure(res:Response,error:unknown){
  const code=error instanceof Error?error.message:"WORKSPACE_REQUEST_FAILED";
  const status=
    code==="AUTH_REQUIRED" || code==="WORKSPACE_OAUTH_REQUIRED" || code==="token verification failed"
      ? 401
      : code.startsWith("PROTECTED_SERVICE_HTTP_")
        ? 502
        : 400;
  res.setHeader("cache-control","no-store");
  res.status(status).json({ok:false,error:code});
}

const StartMission=z.object({
  request_id:z.string().min(1).max(128).optional(),
  role:z.enum(["creator","client","operator","unspecified"]).default("creator"),
  locale:z.string().min(2).max(32).default("vi-VN"),
  input:z.record(z.string(),z.unknown())
}).strict();

export function registerWorkspaceRoutes(args:{
  app:Express;
  config:HostConfig;
  oauthConfig:OAuthConfig|null;
  publicDir:string;
}){
  const {app,config,oauthConfig,publicDir}=args;

  app.get("/workspace-client.js",(_req:Request,res:Response)=>{
    res.type("application/javascript");
    res.sendFile(publicDir+"/workspace-client.js");
  });

  app.post("/api/workspace/missions",expressJson({limit:"256kb"}),async(req:Request,res:Response)=>{
    try{
      if(!oauthConfig) throw new Error("WORKSPACE_OAUTH_REQUIRED");
      const subject=await subjectFromRequest(req,oauthConfig);
      const parsed=StartMission.parse(req.body);
      const out=await invokePublic(
        config,subject,"create_video_mission",parsed.input,parsed.role,parsed.locale,parsed.request_id
      );
      res.setHeader("cache-control","no-store");
      res.json(out);
    }catch(error){failure(res,error);}
  });

  app.get("/api/workspace/missions/:missionId/status",async(req:Request,res:Response)=>{
    try{
      if(!oauthConfig) throw new Error("WORKSPACE_OAUTH_REQUIRED");
      const subject=await subjectFromRequest(req,oauthConfig);
      const mission_id=String(req.params.missionId??"");
      const out=await invokePublic(config,subject,"get_status",{mission_id});
      res.setHeader("cache-control","no-store");
      res.json(out);
    }catch(error){failure(res,error);}
  });

  app.get("/api/workspace/missions/:missionId/delivery",async(req:Request,res:Response)=>{
    try{
      if(!oauthConfig) throw new Error("WORKSPACE_OAUTH_REQUIRED");
      const subject=await subjectFromRequest(req,oauthConfig);
      const mission_id=String(req.params.missionId??"");
      const out=await invokePublic(config,subject,"get_delivery",{mission_id});
      res.setHeader("cache-control","no-store");
      res.json(out);
    }catch(error){failure(res,error);}
  });
}
