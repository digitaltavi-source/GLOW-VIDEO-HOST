import { createClient, type Session } from "@supabase/supabase-js";

const cfg=window.__GLOW_VIDEO_OAUTH_CONFIG__ ?? {};
if(!cfg.supabaseUrl || !cfg.supabasePublishableKey){
  throw new Error("VIDEO_OAUTH_PUBLIC_CONFIG_MISSING");
}
const supabase=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});

type MissionRef={mission_id:string;title:string;created_at:string};
const RECENTS_KEY="glow-video-workspace-missions-v1";
const byId=(id:string)=>document.getElementById(id)!;
const text=(id:string,v:string)=>{byId(id).textContent=v;};
const show=(id:string,on:boolean)=>{(byId(id) as HTMLElement).hidden=!on;};
const value=(id:string)=>((byId(id) as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement).value||"").trim();

function recentMissions():MissionRef[]{
  try{return JSON.parse(localStorage.getItem(RECENTS_KEY)||"[]") as MissionRef[];}catch{return [];}
}
function saveMission(ref:MissionRef){
  const next=[ref,...recentMissions().filter(x=>x.mission_id!==ref.mission_id)].slice(0,20);
  localStorage.setItem(RECENTS_KEY,JSON.stringify(next));
  renderRecent();
}
function renderRecent(){
  const host=byId("recent-list");
  host.innerHTML="";
  for(const row of recentMissions()){
    const btn=document.createElement("button");
    btn.type="button"; btn.className="mission-row";
    btn.innerHTML=`<strong>${escapeHtml(row.title||"Video mission")}</strong><span>${escapeHtml(row.mission_id)}</span>`;
    btn.onclick=()=>selectMission(row.mission_id,row.title);
    host.appendChild(btn);
  }
  show("recent-empty",recentMissions().length===0);
}
function escapeHtml(v:string){return v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]||c));}
async function session():Promise<Session|null>{
  const {data}=await supabase.auth.getSession();
  return data.session;
}
async function authFetch(path:string,init:RequestInit={}){
  const s=await session();
  if(!s) throw new Error("LOGIN_REQUIRED");
  const headers=new Headers(init.headers||{});
  headers.set("authorization",`Bearer ${s.access_token}`);
  if(init.body) headers.set("content-type","application/json");
  const res=await fetch(path,{...init,headers,cache:"no-store"});
  const body=await res.json().catch(()=>({error:"INVALID_RESPONSE"}));
  if(!res.ok) throw new Error(body?.error||`HTTP_${res.status}`);
  return body;
}

async function refreshAuth(){
  const s=await session();
  show("signed-out",!s); show("signed-in",Boolean(s));
  text("account-label",s?.user?.email||"Đã kết nối");
  (byId("start-mission") as HTMLButtonElement).disabled=!s;
}
async function sendMagicLink(){
  const email=value("login-email");
  if(!email) return setNotice("Nhập email trước.","error");
  const {error}=await supabase.auth.signInWithOtp({
    email,
    options:{emailRedirectTo:window.location.origin+"/"}
  });
  if(error) return setNotice(error.message,"error");
  setNotice("Đã gửi liên kết đăng nhập. Kiểm tra email và mở liên kết trên thiết bị này.","ok");
}
async function signOut(){
  await supabase.auth.signOut();
  await refreshAuth();
  setNotice("Đã đăng xuất.","ok");
}
function setNotice(message:string,kind:"ok"|"error"|"info"="info"){
  const el=byId("notice"); el.textContent=message; el.setAttribute("data-kind",kind);
}
function briefInput(){
  return {
    title:value("project")||"Untitled GLOW Video mission",
    goal:value("goal"),
    audience:value("audience"),
    duration:value("duration"),
    language:value("language"),
    style:value("style"),
    assets_constraints:value("assets"),
    source:"GLOW_VIDEO_PUBLIC_WORKSPACE"
  };
}
async function startMission(){
  try{
    setNotice("Đang tạo mission…","info");
    const title=value("project")||"Untitled GLOW Video mission";
    const out=await authFetch("/api/workspace/missions",{
      method:"POST",
      body:JSON.stringify({
        request_id:crypto.randomUUID(),
        role:value("role")||"creator",
        locale:"vi-VN",
        input:briefInput()
      })
    });
    const mid=out?.result?.mission_id;
    if(!mid) throw new Error("MISSION_ID_MISSING");
    saveMission({mission_id:mid,title,created_at:new Date().toISOString()});
    selectMission(mid,title);
    setNotice("Mission đã được tạo. Tiếp tục trong ChatGPT để Factory phát work package.","ok");
  }catch(e){setNotice(e instanceof Error?e.message:"MISSION_START_FAILED","error");}
}
let selectedMission="";
function selectMission(mid:string,title=""){
  selectedMission=mid;
  text("selected-title",title||"Video mission");
  text("selected-id",mid);
  show("mission-panel",true);
  refreshStatus();
}
async function refreshStatus(){
  if(!selectedMission) return;
  try{
    const out=await authFetch(`/api/workspace/missions/${encodeURIComponent(selectedMission)}/status`);
    const r=out?.result||{};
    text("mission-state",String(r.state||"UNKNOWN"));
    text("mission-stage",String(r.stage||"-"));
    text("mission-next",String(r.next_action||"-"));
    setNotice("Đã cập nhật trạng thái mission.","ok");
  }catch(e){setNotice(e instanceof Error?e.message:"STATUS_FAILED","error");}
}
async function getDelivery(){
  if(!selectedMission) return;
  try{
    const out=await authFetch(`/api/workspace/missions/${encodeURIComponent(selectedMission)}/delivery`);
    const pre=byId("delivery-json"); pre.textContent=JSON.stringify(out?.result??out,null,2);
    show("delivery-panel",true);
    setNotice("Đã nhận delivery PUBLIC_DECLASSIFIED.","ok");
  }catch(e){setNotice(e instanceof Error?e.message:"DELIVERY_NOT_AVAILABLE","error");}
}
async function openChatGPT(){
  if(!selectedMission) return;
  const prompt=`Tiếp tục GLOW Video mission ${selectedMission}. Hãy dùng GLOW Video App, đọc trạng thái hiện tại của mission và chỉ thực hiện work package/gate mà Factory cho phép.`;
  try{await navigator.clipboard.writeText(prompt);}catch{}
  window.open("https://chatgpt.com/","_blank","noopener,noreferrer");
  setNotice("Đã sao chép câu lệnh tiếp tục mission và mở ChatGPT.","ok");
}
async function restoreMission(){
  const mid=value("restore-id");
  if(mid) selectMission(mid,"Mission đã khôi phục");
}

byId("send-link").addEventListener("click",sendMagicLink);
byId("signout").addEventListener("click",signOut);
byId("start-mission").addEventListener("click",startMission);
byId("refresh-status").addEventListener("click",refreshStatus);
byId("get-delivery").addEventListener("click",getDelivery);
byId("open-chatgpt").addEventListener("click",openChatGPT);
byId("restore-mission").addEventListener("click",restoreMission);
supabase.auth.onAuthStateChange(()=>void refreshAuth());
renderRecent();
void refreshAuth();
