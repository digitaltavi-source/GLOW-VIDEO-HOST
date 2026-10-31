# GLOW VIDEO — Hướng Dẫn Đấu Nối Bất Biến (`Website 3 Studio` ↔ `Hostinger` ↔ `Plugin GPT & Gemini`)

## 1. Điểm Cuối Kết Nối Chuẩn & Bất Biến (`Canonical Endpoints`)

Khi triển khai `GLOW-VIDEO-HOST` cùng gói `private-runtime/` từ `GLOW-VIDEO-FACTORY` lên máy chủ Hostinger, hệ thống mở ra **2 nhóm cửa kết nối cố định** trên cùng một tên miền HTTPS (ví dụ: `https://peachpuff-frog-205135.hostingersite.com`):

1. **Cửa Kết Nối Plugin AI (`ChatGPT` / `Gemini` / `MCP Clients`):**
   - **MCP Endpoint duy nhất:** `https://<ten-mien-hosting>/mcp-v2`
   - **Metadata khám phá tài nguyên bảo vệ:** `https://<ten-mien-hosting>/.well-known/oauth-protected-resource`
   - **Trạm cấp vé tự chủ (`GLOW Native Auth`):**
     - Metadata OAuth 2.0: `https://<ten-mien-hosting>/.well-known/oauth-authorization-server`
     - Cổng ủy quyền & đăng nhập PKCE (`S256`): `https://<ten-mien-hosting>/oauth/authorize`
     - Cổng cấp phát thẻ truy cập (`Bearer JWT`): `https://<ten-mien-hosting>/oauth/token`
2. **Cửa Kết Nối Giao Diện Website 3 Xưởng Sản Xuất (`Web Studio Rooms`):**
   - **Sảnh Tiền Kỳ & Kiểm Định (`H1 -> H2 -> H3 -> FORK_TOKEN`):** `GET /studio`
   - **Phòng 1 — GLOW Kit A Audio & Top-Hit Studio:** `GET /studio/kit-a`
   - **Phòng 2 — GLOW Kit B Family & 3D Animation Studio:** `GET /studio/kit-b`
   - **Phòng 3 — GLOW Kit C Hollywood Cinematic Studio:** `GET /studio/kit-c`
   - **Hệ thống API Điều phối & Tải thành phẩm (Cách ly Multi-Tenant `owner_id`):** `/api/studio/missions/*`

---

## 2. Cơ Chế Đón Khách Linh Hoạt & Tự Chủ (`GLOW Native Auth`)

Để phục vụ lượng người dùng lớn trên toàn cầu mà **không phụ thuộc vào giới hạn 2 cổng của Supabase hay chi phí MAU của Auth0**, đường ống đấu nối hỗ trợ đồng thời:

1. **Phễu Khám Phá & Giới Thiệu Công Khai (`Public Introduction`):**
   - Mọi người dùng khi hỏi thông tin giới thiệu qua công cụ `glow_video_v2_public_profile` hoặc truy cập `/about` đều nhận được thông tin tổng quan ngay lập tức mà không tiết lộ cấu trúc kỹ thuật nội bộ.
2. **Xác Thực Tự Chủ `GLOW_NATIVE_GRANT` (OAuth 2.0 + PKCE `S256`):**
   - Máy chủ Hosting tự phát hành và kiểm định chữ ký thẻ truy cập (`HS256` với khóa bí mật `GLOW_NATIVE_OAUTH_SECRET` `>= 32` ký tự), gắn chặt quyền thực thi (`video.run`, `video.accept`) vào đúng `client_id` đã đăng ký và đúng tài nguyên `/mcp-v2`.
3. **Cách Ly Tài Khoản Đa Người Dùng (`Multi-Tenant Studio Boundary`):**
   - Mọi dự án (`mission_id`) và tài sản xuất xưởng (`.wav`, `.mp3`, `.mp4`, `.zip`) đều được gắn định danh chủ sở hữu (`owner_id` / `tenant_id`). Người dùng của tài khoản khác truy cập chéo sẽ bị chặn tuyệt đối (`403 STUDIO_TENANT_ACCESS_DENIED`).

---

## 3. Quy Trình 5 Bước Nạp Gói Từ `GLOW-VIDEO-FACTORY` Sang `GLOW-VIDEO-HOST`

Mỗi khi Nhà máy chính (`GLOW-VIDEO-FACTORY`) nâng cấp tính năng mới trên nhánh `main` (ví dụ commit `fc28c3115625a27477720af905fce1ba8f4e3ab0`):

1. **Đóng gói tại Nhà máy Private:** Chạy công cụ đóng gói trong `GLOW-VIDEO-FACTORY` để xuất thư mục `private-runtime/` kèm file `assembly-manifest.json` (chứa danh sách toàn bộ file và mã băm SHA-256 tương ứng).
2. **Nạp vào Máy chủ Hosting:** Đặt thư mục `private-runtime/` vào gốc thư mục triển khai của `GLOW-VIDEO-HOST` trên máy chủ Hosting.
3. **Cập nhật 2 biến định danh phiên bản trên Hosting:**
   - `GLOW_VIDEO_APPROVED_SOURCE_SHA=<SHA_40_KY_TU_MOI>`
   - `GLOW_VIDEO_ASSEMBLY_MANIFEST_SHA256=<SHA256_64_KY_TU_CUA_MANIFEST_MOI>`
4. **Kiểm định tự động (`npm run build`):** `scripts/assembly.mjs --verify` đối chiếu từng byte của toàn bộ file trong `private-runtime/`. Nếu khớp 100% mới cho phép bước tiếp theo.
5. **Khởi động (`npm start`):** Tiến trình mới tự động chạy và phục vụ ngay lập tức các tính năng mới cho cả **Website** và **Plugin ChatGPT/Gemini** mà không cần thay đổi bất kỳ cấu hình nào ở phía Plugin hay repo `GLOW-VIDEO-HOST`.
