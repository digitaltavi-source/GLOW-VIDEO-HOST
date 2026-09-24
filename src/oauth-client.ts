import { createClient } from "@supabase/supabase-js";

declare global {
  interface Window {
    __GLOW_VIDEO_OAUTH_CONFIG__?: {
      supabaseUrl?: string;
      supabasePublishableKey?: string;
    };
  }
}

function byId(id:string){return document.getElementById(id)!;}
function setStatus(message:string,isError=false){
  const el=byId("status");
  el.textContent=message;
  el.setAttribute("data-error",isError?"1":"0");
}
function getAuthorizationId(){
  return new URL(window.location.href).searchParams.get("authorization_id") ?? "";
}
function safeText(value:unknown){return typeof value==="string" ? value : "";}

const cfg=window.__GLOW_VIDEO_OAUTH_CONFIG__ ?? {};
if(!cfg.supabaseUrl || !cfg.supabasePublishableKey){
  throw new Error("VIDEO_OAUTH_PUBLIC_CONFIG_MISSING");
}

const supabase=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});

async function ensureSession(){
  const {data:{user}}=await supabase.auth.getUser();
  return user;
}

async function signIn(){
  const email=(byId("email") as HTMLInputElement).value.trim();
  if(!email){setStatus("Nhập email để tiếp tục.",true);return;}
  setStatus("Đang gửi liên kết đăng nhập…");
  const {error}=await supabase.auth.signInWithOtp({
    email,
    options:{emailRedirectTo:window.location.href}
  });
  if(error){setStatus(error.message,true);return;}
  setStatus("Đã gửi liên kết đăng nhập. Hãy mở email và quay lại trang này.");
}

async function loadAuthorization(){
  const authorizationId=getAuthorizationId();
  if(!authorizationId){setStatus("Thiếu authorization_id.",true);return;}

  const user=await ensureSession();
  if(!user){
    byId("login-panel").hidden=false;
    byId("consent-panel").hidden=true;
    setStatus("Đăng nhập để xem yêu cầu cấp quyền.");
    return;
  }

  byId("login-panel").hidden=true;
  const {data,error}=await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if(error){setStatus(error.message,true);return;}
  if(!data){setStatus("Không tìm thấy yêu cầu cấp quyền.",true);return;}

  if(!("authorization_id" in data)){
    const redirectUrl=safeText((data as {redirect_url?:unknown}).redirect_url);
    if(redirectUrl){window.location.assign(redirectUrl);return;}
    setStatus("Yêu cầu đã được xử lý nhưng thiếu redirect URL.",true);
    return;
  }

  const client=(data as any).client ?? {};
  byId("client-name").textContent=safeText(client.name) || "ChatGPT";
  byId("redirect-uri").textContent=safeText((data as any).redirect_uri);
  const scope=safeText((data as any).scope);
  byId("scopes").textContent=scope || "openid email";
  byId("consent-panel").hidden=false;
  setStatus("Kiểm tra thông tin rồi chọn Cho phép hoặc Từ chối.");
}

async function decide(approve:boolean){
  const authorizationId=getAuthorizationId();
  if(!authorizationId){setStatus("Thiếu authorization_id.",true);return;}
  setStatus(approve?"Đang cấp quyền…":"Đang từ chối…");
  const result=approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId)
    : await supabase.auth.oauth.denyAuthorization(authorizationId);
  if(result.error){setStatus(result.error.message,true);return;}
  const redirectUrl=safeText((result.data as any)?.redirect_url);
  if(!redirectUrl){setStatus("Không nhận được redirect URL.",true);return;}
  window.location.assign(redirectUrl);
}

window.addEventListener("DOMContentLoaded",()=>{
  byId("signin").addEventListener("click",()=>void signIn());
  byId("approve").addEventListener("click",()=>void decide(true));
  byId("deny").addEventListener("click",()=>void decide(false));
  void loadAuthorization();
});
