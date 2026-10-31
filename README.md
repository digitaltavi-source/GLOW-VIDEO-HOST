# GLOW VIDEO HOST — Trạm Đấu Nối Bất Biến & Cổng Truyền Thông Công Khai (`Universal Immutable Host Pipe`)

**Vai trò cốt lõi:** Kho mã nguồn công khai (`PUBLIC`) này đóng hai vai trò chiến lược cho nhà máy sản xuất đa phương tiện [`GLOW-VIDEO-FACTORY`](https://github.com/digitaltavi-source/GLOW-VIDEO-FACTORY) (`PRIVATE`):
1. **Cổng Thông Tin & Truyền Thông Chính Thức:** Giới thiệu toàn diện hệ sinh thái 3 Xưởng sản xuất (**Kit A — Audio Studio**, **Kit B — Animation Studio**, **Kit C — Cinematic Studio**) tới Khách hàng, Đối tác và Nhà đầu tư (xem chi tiết tại [`GLOW_VIDEO_INTRODUCTION.md`](GLOW_VIDEO_INTRODUCTION.md)).
2. **Đường Ống Đấu Nối Trung Gian Bất Biến (`GLOW_VIDEO_HOST_ASSEMBLY_V1`):** Làm trạm lắp ráp và kiểm định chữ ký số SHA-256 trên máy chủ Hosting (Node 22–24) để nối **Nhà máy Private (`GLOW-VIDEO-FACTORY`)** ra **Giao diện Website (`/studio*`)** và **Plugin AI trên ChatGPT / Gemini (`/mcp-v2`)** với cơ chế xác thực tự chủ **`GLOW Native Auth`** (`$0` phí bên thứ ba, không cần Supabase hay Auth0, không giới hạn số cổng và số lượng người dùng).

---

## 1. Kiến Trúc "1 Trục Đấu Nối Bất Biến — Trải Nghiệm Tam Giác — Nâng Cấp Không Chạm"

```text
               ┌──────────────────────────────────────────────────┐
               │        1. GLOW-VIDEO-FACTORY (PRIVATE REPO)      │
               │   (Sở hữu độc quyền Trí tuệ Lõi, H1->H2->H3,     │
               │    FORK_TOKEN & 3 Xưởng Kit A / Kit B / Kit C)   │
               └────────────────────────┬─────────────────────────┘
                                        │
                   [Đóng gói private-runtime + assembly-manifest.json]
                    (Ghim cứng mã băm SHA-256 & Source Commit 40 ký tự)
                                        │
                                        ▼
       ┌────────────────────────────────────────────────────────────────┐
       │        2. GLOW-VIDEO-HOST TRÊN MÁY CHỦ HOSTINGER (PUBLIC)      │
       │  - Kiểm định Fail-Closed toàn bộ file trong private-runtime/   │
       │  - Tích hợp sẵn GLOW Native Auth (OAuth 2.0 + PKCE tự chủ)     │
       │  - Dùng chung 1 Công thức Bất biến cho mọi Nhà máy hệ GLOW     │
       └────────────────┬───────────────────────────────┬───────────────┘
                        │                               │
         [Cửa Web Cố Định: /studio*]     [Cửa Plugin Cố Định: /mcp-v2]
                        │                               │
                        ▼                               ▼
       ┌────────────────────────────────┐  ┌────────────────────────────┐
       │ 3A. GIAO DIỆN WEB 3 STUDIO     │◄─┤ 3B. PLUGIN GPT & GEMINI    │
       │ (/studio, /kit-a, /kit-b, /c)  │──► (Tư vấn, Ra lệnh, Duyệt)   │
       └────────────────────────────────┘  └────────────────────────────┘
                        ▲                               ▲
                        └── [TAM GIÁC ĐỒNG BỘ TỨC THÌ] ─┘
```

### Nguyên tắc "Nâng Cấp Nhà Máy Không Cần Nâng Cấp Host Hay Plugin" (`Zero-Touch Host & Plugin Upgrade`)
- **Tách biệt tuyệt đối mã nguồn mật:** Không một dòng code nghiệp vụ hay bí mật công nghệ nào của `GLOW-VIDEO-FACTORY` được lưu trên kho công khai này. Toàn bộ gói thực thi được nạp vào thư mục ẩn `private-runtime/` (đã khóa trong `.gitignore`) khi triển khai trên máy chủ Hosting.
- **Tự động khám phá tính năng mới:** Khi `GLOW-VIDEO-FACTORY` nâng cấp phiên bản (`V2 -> V2.1 -> V3`), chỉ cần xuất gói `private-runtime/` mới lên máy chủ Hosting. Cổng `/mcp-v2` (cho Plugin GPT/Gemini) và `/studio*` (cho Website) tự động phản ánh toàn bộ công cụ và giao diện mới mà **không cần sửa code `GLOW-VIDEO-HOST` và không cần đăng ký lại Plugin**.
- **Dùng chung cho toàn bộ Hệ sinh thái GLOW:** Biến môi trường `GLOW_FACTORY_REPOSITORY` (mặc định `digitaltavi-source/GLOW-VIDEO-FACTORY`) cho phép dùng nguyên bản công thức `scripts/assembly.mjs` này cho mọi nhà máy khác trong hệ sinh thái GLOW (`GLOW-AUDIO-STORY-FACTORY`, `GLOW-ANIMATION-FACTORY`, `GLOW-WEB-FACTORY`, v.v.).

---

## 2. Cơ Chế Xác Thực Tự Chủ `GLOW Native Auth` (Không Phụ Thuộc Supabase Hay Auth0)

Hệ thống hỗ trợ mặc định cấu hình **`GLOW_OAUTH_AUTHORIZATION_PROFILE=GLOW_NATIVE_GRANT`**:
- **Tự chủ 100% ngay trên máy chủ Hosting:** Tự phục vụ các điểm cuối chuẩn OAuth 2.0 + PKCE (`/.well-known/oauth-authorization-server`, `/oauth/authorize`, `/oauth/token`) ngay trên tên miền của GLOW.
- **Không giới hạn số cổng & số lượng người dùng:** Loại bỏ hoàn toàn giới hạn 2 project của Supabase Free hoặc chi phí theo MAU của Auth0.
- **Tương thích mở:** Vẫn giữ sẵn tùy chọn kết nối OIDC ngoài (`SUPABASE_RESOURCE_GRANT` hoặc `ACTION_SCOPES`) khi đối tác doanh nghiệp có yêu cầu riêng.

---

## 3. Lệnh Kiểm Thử, Kiểm Định & Khởi Chạy Trên Máy Chủ Hosting

```bash
npm test       # Chạy 12 bài kiểm thử an toàn lắp ráp, GLOW Native Auth & Đa nhà máy (Cross-platform Windows/Linux)
npm run build  # Kiểm định Fail-Closed gói private-runtime/ + assembly-manifest.json + biến môi trường
npm start      # Kiểm định toàn vẹn SHA-256 trước khi khởi chạy tiến trình private-runtime/dist/src/server.js
```

### Hợp đồng Gói Lắp Ráp (`private-runtime/assembly-manifest.json`)

```json
{
  "contract": "GLOW_VIDEO_HOST_ASSEMBLY_V1",
  "factory_repository": "digitaltavi-source/GLOW-VIDEO-FACTORY",
  "source_commit": "fc28c3115625a27477720af905fce1ba8f4e3ab0",
  "entry": "dist/src/server.js",
  "files": [
    { "path": "dist/src/server.js", "sha256": "<SHA256_CUA_FILE_THUC_TE>" }
  ]
}
```

### Biến Môi Trường Chuẩn Trên Máy Chủ Hosting (Chế Độ Tự Chủ `GLOW_NATIVE_GRANT`)

- `GLOW_GATEWAY_PROFILE=DEMO` (hoặc `PRODUCTION` sau khi qua cổng phát hành chính thức).
- `GLOW_AUTH_MODE=oauth`
- `GLOW_OAUTH_AUTHORIZATION_PROFILE=GLOW_NATIVE_GRANT` (Mặc định tự chủ, không cần cấu hình URL của Supabase hay Auth0).
- `GLOW_NATIVE_OAUTH_SECRET=<chuoi-bi-mat-toi-thieu-32-ky-tu-do-founder-nam-giu>`
- `GLOW_PUBLIC_MCP_URL=https://<ten-mien-hosting>/mcp-v2` (tự động suy diễn `issuer` và `audience` từ chính tên miền này).
- `GLOW_OAUTH_ALLOWED_CLIENT_IDS=<danh-sach-client-id-duoc-phep-cach-nhau-boi-khoang-trang>`
- `GLOW_V2_STATE_DIR=/duong/dan/tuyet/doi/ben/ngoai/thu-muc-deploy` (lưu trữ bền vững lịch sử dự án qua các lần nâng cấp).
- `GLOW_VIDEO_APPROVED_SOURCE_SHA=fc28c3115625a27477720af905fce1ba8f4e3ab0` (40 ký tự SHA của commit `main` đã duyệt trên `GLOW-VIDEO-FACTORY`).
- `GLOW_VIDEO_ASSEMBLY_MANIFEST_SHA256=<ma-bam-sha256-64-ky-tu-cua-file-assembly-manifest.json>`.
- `GLOW_FACTORY_REPOSITORY=digitaltavi-source/GLOW-VIDEO-FACTORY` (Tùy chọn: đổi tên repo khi áp dụng công thức này cho các nhà máy khác thuộc hệ sinh thái GLOW).
