export function workspaceHtml(): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GLOW Video Studio</title>
<meta name="description" content="GLOW Video Studio — giao brief, theo dõi mission và nhận delivery từ GLOW Video Factory.">
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717;background:#f4f5f9;--ink:#171717;--muted:#687084;--line:#e3e7ef;--panel:#fff;--accent:#6548f5;--good:#0b9b68;--warn:#c27a12}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(180deg,#f8f8fc 0,#eef1f7 100%)}
header{height:70px;background:#101827;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 28px;position:sticky;top:0;z-index:20}
.brand{display:flex;align-items:center;gap:12px;font-weight:850}.logo{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#6548f5,#22c6ff);display:grid;place-items:center;font-weight:900}
main{max-width:1180px;margin:0 auto;padding:30px 20px 72px}.grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}.card{background:rgba(255,255,255,.96);border:1px solid var(--line);border-radius:19px;box-shadow:0 12px 34px rgba(15,23,42,.06);padding:24px}.hero{grid-column:1/-1;display:flex;justify-content:space-between;gap:20px;align-items:center}.hero h1{font-size:clamp(30px,5vw,54px);line-height:1.03;letter-spacing:-.04em;margin:6px 0 10px}.eyebrow{color:var(--accent);font-size:12px;font-weight:850;letter-spacing:.09em;text-transform:uppercase}.lead{color:#4d5669;line-height:1.65;max-width:760px;margin:0}.badge{background:#ece8ff;color:#563bda;border-radius:999px;padding:7px 10px;font-weight:800;font-size:12px;white-space:nowrap}
h2{margin:0 0 6px;font-size:22px}p.sub{margin:0 0 18px;color:var(--muted);line-height:1.5}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-size:13px;font-weight:750;color:#394155}input,textarea,select{width:100%;border:1px solid #d6dbe5;border-radius:11px;padding:11px 12px;font:inherit;background:#fff;outline:none}textarea{min-height:92px;resize:vertical}input:focus,textarea:focus,select:focus{border-color:#9282ff;box-shadow:0 0 0 3px rgba(101,72,245,.1)}
.actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}button,a.button{border:0;border-radius:11px;padding:11px 14px;font-weight:800;font:inherit;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.primary{background:var(--accent);color:#fff}.secondary{background:#edf0f6;color:#293247}.ghost{background:#fff;border:1px solid var(--line);color:#394155}button:disabled{opacity:.48;cursor:not-allowed}
.authbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.authpill{padding:8px 10px;border:1px solid var(--line);border-radius:999px;background:#fff;font-size:13px}.notice{grid-column:1/-1;padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;color:#465066}.notice[data-kind="ok"]{border-color:#b7ead7;background:#f0fbf6;color:#0d704e}.notice[data-kind="error"]{border-color:#f3c1c1;background:#fff5f5;color:#a52a2a}
.mission-list{display:flex;flex-direction:column;gap:8px}.mission-row{width:100%;text-align:left;background:#fafbfe;border:1px solid var(--line);padding:12px;border-radius:12px;display:flex;flex-direction:column;gap:3px}.mission-row span{font-size:11px;color:var(--muted);word-break:break-all}.kv{display:grid;grid-template-columns:120px 1fr;gap:8px;padding:8px 0;border-bottom:1px solid #edf0f5}.kv:last-child{border-bottom:0}.kv span{color:var(--muted)}code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.mission-id{word-break:break-all;font-size:12px}.delivery{max-height:340px;overflow:auto;background:#111827;color:#e5e7eb;padding:14px;border-radius:12px;white-space:pre-wrap;font-size:12px}.tiny{font-size:12px;color:var(--muted);line-height:1.5}.divider{height:1px;background:var(--line);margin:18px 0}
footer{max-width:1180px;margin:0 auto;padding:0 20px 28px;color:#737b8d;font-size:12px}
@media(max-width:850px){.grid{grid-template-columns:1fr}.fields{grid-template-columns:1fr}.field.full{grid-column:auto}.hero{align-items:flex-start;flex-direction:column}header{padding:0 16px}}
</style>
</head>
<body>
<header>
  <div class="brand"><div class="logo">G</div><span>GLOW Video Studio</span></div>
  <span class="badge">Public Workspace Candidate</span>
</header>
<main class="grid">
  <section class="card hero">
    <div>
      <div class="eyebrow">Giao brief · Làm việc trong ChatGPT · Nhận delivery</div>
      <h1>Một phòng làm việc, một Factory phía sau.</h1>
      <p class="lead">Workspace chỉ xử lý intake, trạng thái và delivery công khai. ChatGPT thực hiện reasoning theo work package; Factory giữ mission state, capability coverage, handoff và approval authority.</p>
    </div>
    <div class="authbar">
      <div id="signed-out">
        <input id="login-email" type="email" autocomplete="email" placeholder="Email đăng nhập">
        <button id="send-link" class="primary" type="button">Gửi link đăng nhập</button>
      </div>
      <div id="signed-in" hidden class="authbar">
        <span class="authpill" id="account-label">Đã kết nối</span>
        <button id="signout" class="ghost" type="button">Đăng xuất</button>
      </div>
    </div>
  </section>

  <div id="notice" class="notice" data-kind="info">Đăng nhập để tạo hoặc mở mission của bạn.</div>

  <section class="card">
    <h2>Giao brief</h2>
    <p class="sub">Tạo mission từ web, sau đó tiếp tục reasoning trong ChatGPT bằng cùng tài khoản.</p>
    <div class="fields">
      <div class="field"><label for="project">Tên dự án</label><input id="project" placeholder="Video giới thiệu 30s"></div>
      <div class="field"><label for="role">Vai trò</label><select id="role"><option value="creator">Creator</option><option value="client">Client</option><option value="operator">Operator</option></select></div>
      <div class="field full"><label for="goal">Mục tiêu</label><textarea id="goal" placeholder="Video cần đạt kết quả gì?"></textarea></div>
      <div class="field"><label for="audience">Khán giả</label><input id="audience" placeholder="Ai sẽ xem?"></div>
      <div class="field"><label for="duration">Thời lượng</label><select id="duration"><option>15 giây</option><option>30 giây</option><option>60 giây</option><option>Khác</option></select></div>
      <div class="field"><label for="language">Ngôn ngữ</label><input id="language" value="Tiếng Việt"></div>
      <div class="field"><label for="style">Phong cách</label><input id="style" placeholder="Điện ảnh, dễ thương, tối giản…"></div>
      <div class="field full"><label for="assets">Reference / tài liệu / ràng buộc</label><textarea id="assets" placeholder="Logo, nhân vật, ảnh tham chiếu, điều không được thay đổi…"></textarea></div>
    </div>
    <div class="actions"><button id="start-mission" class="primary" type="button" disabled>Tạo mission</button></div>
    <p class="tiny">Web không gọi model API và không được phép submit work package hay approve H1/H2/H3.</p>
  </section>

  <aside class="card">
    <h2>Mission gần đây</h2>
    <p class="sub">Danh sách ID chỉ lưu trên trình duyệt; Factory state vẫn ở private runtime/MySQL.</p>
    <div id="recent-list" class="mission-list"></div>
    <p id="recent-empty" class="tiny">Chưa có mission nào trên trình duyệt này.</p>
    <div class="divider"></div>
    <div class="field"><label for="restore-id">Khôi phục bằng Mission ID</label><input id="restore-id" placeholder="M-..."></div>
    <div class="actions"><button id="restore-mission" class="secondary" type="button">Mở mission</button></div>
  </aside>

  <section id="mission-panel" class="card" hidden>
    <h2 id="selected-title">Video mission</h2>
    <p class="mission-id" id="selected-id"></p>
    <div class="kv"><span>State</span><strong id="mission-state">-</strong></div>
    <div class="kv"><span>Stage</span><strong id="mission-stage">-</strong></div>
    <div class="kv"><span>Next action</span><strong id="mission-next">-</strong></div>
    <div class="actions">
      <button id="refresh-status" class="secondary" type="button">Cập nhật trạng thái</button>
      <button id="open-chatgpt" class="primary" type="button">Tiếp tục trong ChatGPT</button>
      <button id="get-delivery" class="ghost" type="button">Nhận delivery</button>
    </div>
    <p class="tiny">Approval và work execution vẫn ở ChatGPT/Factory; web chỉ đọc trạng thái và delivery đã declassify.</p>
  </section>

  <section id="delivery-panel" class="card" hidden>
    <h2>Delivery</h2>
    <p class="sub">Chỉ dữ liệu <code>PUBLIC_DECLASSIFIED</code> được hiển thị tại đây.</p>
    <pre id="delivery-json" class="delivery"></pre>
  </section>
</main>
<footer>HOST ≠ FACTORY · CHATGPT REASONING ≠ FACTORY CONTROL · DELIVERY = PUBLIC_DECLASSIFIED ONLY</footer>
<script src="/oauth-config.js"></script>
<script src="/workspace-client.js"></script>
</body>
</html>`;
}
