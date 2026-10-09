export function workspaceHtml(): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GLOW Video Studio</title>
<meta name="description" content="GLOW Video Studio — phòng giao việc, theo dõi và nhận sản phẩm từ GLOW Video Factory.">
<style>
:root{
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  color:#151515;background:#f5f6fa;--ink:#151515;--muted:#6b7280;--line:#e5e7eb;
  --panel:#fff;--accent:#6d4aff;--accent2:#8c71ff;--good:#0f9f6e;--warn:#b7791f;
}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#f7f7fb 0,#eef1f7 100%);min-height:100vh}
header{height:68px;background:#111827;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:10}
.brand{display:flex;gap:12px;align-items:center;font-weight:800}.logo{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,var(--accent),#20c5ff);display:grid;place-items:center}
main{max-width:1180px;margin:0 auto;padding:34px 22px 70px}
.hero{display:grid;grid-template-columns:1.25fr .75fr;gap:20px;margin-bottom:20px}
.card{background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:20px;box-shadow:0 12px 38px rgba(15,23,42,.06)}
.hero-copy{padding:30px}.eyebrow{color:var(--accent);font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:.08em}
h1{font-size:clamp(34px,5vw,58px);line-height:1.02;margin:10px 0 14px;letter-spacing:-.04em}
.lead{font-size:18px;line-height:1.65;color:#4b5563;max-width:720px}
.status{padding:24px;display:flex;flex-direction:column;gap:13px}.status-row{display:flex;align-items:center;justify-content:space-between;padding:14px;border:1px solid var(--line);border-radius:13px}
.dot{width:10px;height:10px;border-radius:50%;background:#cbd5e1;display:inline-block;margin-right:8px}.dot.good{background:var(--good)}.dot.warn{background:#f59e0b}.dot.bad{background:#ef4444}
.grid{display:grid;grid-template-columns:1.2fr .8fr;gap:20px}.form{padding:26px}.side{padding:26px}
h2{font-size:22px;margin:0 0 6px}.sub{color:var(--muted);margin:0 0 22px;line-height:1.55}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:flex;flex-direction:column;gap:7px}.field.full{grid-column:1/-1}
label{font-size:13px;font-weight:750;color:#374151}input,textarea,select{width:100%;border:1px solid #d7dce4;background:#fff;border-radius:12px;padding:12px 13px;font:inherit;outline:none}
input:focus,textarea:focus,select:focus{border-color:#9b8cff;box-shadow:0 0 0 3px rgba(109,74,255,.1)}textarea{min-height:105px;resize:vertical}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}button,a.button{border:0;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.primary{background:var(--accent);color:#fff}.primary:hover{background:#5a39ed}.secondary{background:#eef0f6;color:#1f2937}.ghost{background:#fff;border:1px solid var(--line);color:#374151}
.note{font-size:12px;color:#6b7280;margin-top:10px;line-height:1.5}
.flow{display:flex;flex-direction:column;gap:10px;margin-top:18px}.step{padding:13px 14px;border:1px solid var(--line);border-radius:13px;background:#fafbff}.step b{display:block;margin-bottom:4px}.step span{color:var(--muted);font-size:13px}
.badge{font-size:12px;font-weight:800;padding:5px 9px;border-radius:999px;background:#eeeaff;color:#5b3ee3}
footer{max-width:1180px;margin:0 auto;padding:0 22px 30px;color:#6b7280;font-size:12px}
@media(max-width:860px){.hero,.grid{grid-template-columns:1fr}.fields{grid-template-columns:1fr}.field.full{grid-column:auto}header{padding:0 16px}}
</style>
</head>
<body>
<header>
  <div class="brand"><div class="logo">G</div><span>GLOW Video Studio</span></div>
  <span class="badge">Public Workspace Candidate</span>
</header>
<main>
<section class="hero">
  <div class="card hero-copy">
    <div class="eyebrow">Giao việc · Làm việc · Nhận sản phẩm</div>
    <h1>Một phòng làm việc cho toàn bộ hành trình video.</h1>
    <p class="lead">Bạn chuẩn bị brief tại đây, dùng chính tài khoản ChatGPT của mình để làm việc với GLOW Video, rồi quay lại workspace để theo dõi và nhận sản phẩm. Factory phía sau vẫn giữ quyền kiểm soát quy trình, evidence và approval.</p>
    <div class="actions">
      <a class="button primary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">Mở ChatGPT</a>
      <button class="secondary" id="copy-brief" type="button">Sao chép brief cho ChatGPT</button>
    </div>
    <div class="note">Không có OpenAI API call từ trang này. ChatGPT chạy bằng chính tài khoản của người dùng.</div>
  </div>
  <aside class="card status">
    <h2>Trạng thái hệ thống</h2>
    <div class="status-row"><span><i class="dot" id="public-dot"></i>Public Host</span><strong id="public-state">Đang kiểm tra…</strong></div>
    <div class="status-row"><span><i class="dot" id="private-dot"></i>Private Factory</span><strong id="private-state">Đang kiểm tra…</strong></div>
    <div class="status-row"><span>Đường MCP chính</span><code>/mcp-v2</code></div>
    <div class="note" id="status-note">Workspace chỉ hiển thị trạng thái công khai; private runtime và secrets không được đưa ra trình duyệt.</div>
  </aside>
</section>

<section class="grid">
  <div class="card form">
    <h2>Brief dự án</h2>
    <p class="sub">Bản nháp này chỉ lưu trên trình duyệt của bạn cho đến khi bạn chủ động đưa vào ChatGPT/GLOW.</p>
    <div class="fields">
      <div class="field"><label for="project">Tên dự án</label><input id="project" placeholder="Ví dụ: Video giới thiệu sản phẩm 30s"></div>
      <div class="field"><label for="role">Vai trò của bạn</label><select id="role"><option>Creator</option><option>Client</option><option>Operator</option></select></div>
      <div class="field full"><label for="goal">Mục tiêu</label><textarea id="goal" placeholder="Bạn muốn video đạt kết quả gì?"></textarea></div>
      <div class="field"><label for="audience">Khán giả</label><input id="audience" placeholder="Khách hàng / học sinh / công chúng…"></div>
      <div class="field"><label for="duration">Thời lượng dự kiến</label><select id="duration"><option>15 giây</option><option>30 giây</option><option>60 giây</option><option>Khác</option></select></div>
      <div class="field"><label for="language">Ngôn ngữ</label><input id="language" value="Tiếng Việt"></div>
      <div class="field"><label for="style">Phong cách mong muốn</label><input id="style" placeholder="Điện ảnh, tối giản, cảm xúc…"></div>
      <div class="field full"><label for="assets">Tài liệu / hình ảnh / ràng buộc</label><textarea id="assets" placeholder="Mô tả tài liệu bạn sẽ cung cấp, logo, reference, điều không được thay đổi…"></textarea></div>
    </div>
    <div class="actions">
      <button class="primary" id="save-draft" type="button">Lưu bản nháp</button>
      <button class="ghost" id="clear-draft" type="button">Xóa bản nháp</button>
    </div>
    <div class="note" id="draft-status">Chưa lưu.</div>
  </div>

  <aside class="card side">
    <h2>Quy trình làm việc</h2>
    <p class="sub">Public workspace không thay quyền của Factory.</p>
    <div class="flow">
      <div class="step"><b>1. Giao brief</b><span>Chuẩn bị mục tiêu, khán giả, reference và ràng buộc.</span></div>
      <div class="step"><b>2. Làm việc với ChatGPT</b><span>ChatGPT nhận bounded work package qua GLOW App/MCP.</span></div>
      <div class="step"><b>3. Approval H1/H2/H3</b><span>Chỉ quyết định explicit của người dùng mới được bind vào stage.</span></div>
      <div class="step"><b>4. Nhận delivery</b><span>Chỉ PUBLIC_DECLASSIFIED output mới được giao ra ngoài.</span></div>
    </div>
  </aside>
</section>
</main>
<footer>GLOW Video Studio · Candidate workspace · HOST ≠ FACTORY · CHATGPT REASONING ≠ FACTORY CONTROL</footer>
<script>
const ids=["project","role","goal","audience","duration","language","style","assets"];
const key="glow-video-workspace-draft-v1";
function data(){return Object.fromEntries(ids.map(id=>[id,document.getElementById(id).value]));}
function hydrate(v){for(const id of ids){if(v&&typeof v[id]==="string")document.getElementById(id).value=v[id];}}
function brief(v){
 return [
  "GLOW Video mission brief",
  "Project: "+(v.project||"(chưa đặt tên)"),
  "Role: "+v.role,
  "Goal: "+v.goal,
  "Audience: "+v.audience,
  "Duration: "+v.duration,
  "Language: "+v.language,
  "Style: "+v.style,
  "Assets/constraints: "+v.assets,
  "",
  "Hãy bắt đầu mission mới qua GLOW Video App và vận hành đúng Factory gates. Không tự bỏ qua validator/approval."
 ].join("\n");
}
document.getElementById("save-draft").onclick=()=>{
  localStorage.setItem(key,JSON.stringify(data()));
  document.getElementById("draft-status").textContent="Đã lưu bản nháp trên trình duyệt này.";
};
document.getElementById("clear-draft").onclick=()=>{
  localStorage.removeItem(key);hydrate({project:"",role:"Creator",goal:"",audience:"",duration:"15 giây",language:"Tiếng Việt",style:"",assets:""});
  document.getElementById("draft-status").textContent="Đã xóa bản nháp.";
};
document.getElementById("copy-brief").onclick=async()=>{
  await navigator.clipboard.writeText(brief(data()));
  document.getElementById("draft-status").textContent="Đã sao chép brief. Mở ChatGPT và dán vào cuộc trò chuyện có GLOW Video App.";
};
try{hydrate(JSON.parse(localStorage.getItem(key)||"null"));}catch{}
async function status(){
  try{
    const health=await fetch("/healthz",{cache:"no-store"}); const h=await health.json();
    document.getElementById("public-dot").className="dot "+(health.ok&&h.ok?"good":"bad");
    document.getElementById("public-state").textContent=health.ok&&h.ok?"Online":"Lỗi";
  }catch{document.getElementById("public-dot").className="dot bad";document.getElementById("public-state").textContent="Không truy cập được";}
  try{
    const ready=await fetch("/readyz",{cache:"no-store"}); const r=await ready.json();
    document.getElementById("private-dot").className="dot "+(ready.ok&&r.ok?"good":"warn");
    document.getElementById("private-state").textContent=ready.ok&&r.ok?"Sẵn sàng":"Chưa sẵn sàng";
    document.getElementById("status-note").textContent=r.code?("Factory readiness: "+r.code):document.getElementById("status-note").textContent;
  }catch{document.getElementById("private-dot").className="dot warn";document.getElementById("private-state").textContent="Chưa sẵn sàng";}
}
status();
</script>
</body>
</html>`;
}
