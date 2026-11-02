# 68 PROPERTY — LANDING ĐIỆN TIẾN (GitHub Pages + Telegram)

**Mục tiêu:** Landing đọc nhanh, ảnh thực địa, SEO cho Điện Tiến – Điện Bàn Bắc – Đà Nẵng. Đăng ký nhận hồ sơ/tư vấn qua Cloudflare Worker → Telegram.

## Tệp cần biết

- `site/index.html`, `site/assets/style.css`, `site/assets/app.js`: giao diện tĩnh, chỉnh nội dung tại đây.
- `site/config.js`: CHỈ gồm 2 giá trị công khai — Turnstile **SITE KEY** và HTTPS Worker API URL. Tuyệt đối KHÔNG ghi Bot Token ở đây.
- `worker/worker.js`: API an toàn tách khỏi GitHub Pages; bảo vệ secrets ở Cloudflare.
- `.github/workflows/deploy.yml`: tự tạo `dist` và deploy GitHub Pages khi push lên nhánh `main`.
- `scripts/build.mjs`: tự chèn canonical, OG URL, JSON-LD, robots.txt, sitemap.xml dựa vào GitHub repository; hỗ trợ `SITE_URL` nếu dùng domain riêng.
- `site/chinh-sach-bao-mat.html`: **bắt buộc điền đơn vị quản lý dữ liệu thật** trước khi công khai.
- `tests/`: kiểm tra nội bộ, ảnh preview.

## 1) Đưa website lên GitHub Pages

1. Giải nén và tải **nội dung thư mục này** lên repository GitHub (để `.github/`, `site/`, `worker/`, `scripts/` ở gốc repo). Đặt nhánh `main`.
2. Vào repository → **Settings → Pages → Source: GitHub Actions**.
3. Vào **Actions** xem workflow `Deploy GitHub Pages SEO landing` tự chạy sau push. URL thường là `https://USERNAME.github.io/REPO/`.
4. Nếu dùng domain riêng, thêm biến repository `SITE_URL` tại **Settings → Secrets and variables → Actions → Variables**, ví dụ `https://dientien.example.com/`, và cấu hình domain trong Settings → Pages.
5. Đăng lại sau mỗi chỉnh nội dung/URL để sitemap, canonical và OG đồng bộ. Bản `site/` là source; không upload `dist/` hoặc token vào GitHub.

**Lưu ý:** Website tĩnh sẽ hiển thị ngay cả khi chưa cài Telegram, nhưng form sẽ CHƯA gửi được. GitHub Pages không chạy server, PHP hay Cloudflare Pages Functions.

## 2) Kết nối Telegram qua Cloudflare Worker (bắt buộc nếu muốn nhận lead)

1. Trong Telegram tạo bot bằng BotFather hoặc dùng bot dành riêng cho team; lấy **Bot Token** và ID chat/nhóm được phép nhận lead. Không chia sẻ token công khai hoặc đưa vào repo.
2. Mở Cloudflare → **Workers & Pages → Create Worker**; đưa nội dung `worker/worker.js` vào và deploy. Xem URL dạng `https://ten-worker.TAIKHOAN.workers.dev`.
3. Worker → **Settings → Variables and Secrets**. Thêm dưới dạng **Secrets**:
   - `TELEGRAM_BOT_TOKEN`: token bot Telegram.
   - `TELEGRAM_CHAT_ID`: chat ID cá nhân/nhóm mà bot đã được thêm và có quyền gửi.
   - `TURNSTILE_SECRET_KEY`: secret từ Cloudflare Turnstile, không phải site key.
   - `HASH_PEPPER`: chuỗi ngẫu nhiên dài 32 ký tự trở lên (dùng băm khi bật KV).
   - `ALLOWED_ORIGIN`: **origin** của trang GitHub Pages, ví dụ `https://USERNAME.github.io` (KHÔNG có `/REPO/`); hoặc origin domain riêng, ví dụ `https://dientien.example.com`.
   - Tùy chọn `TELEGRAM_THREAD_ID`: mã chủ đề forum nếu gửi vào topic.
4. Turnstile → Create Widget, chọn tên miền **`USERNAME.github.io`** hoặc domain riêng, lấy **Site Key** và **Secret Key**. Trong `site/config.js`, điền `turnstileSiteKey` với Site Key công khai và `apiEndpoint` là URL Worker đầy đủ **`https://ten-worker.TAIKHOAN.workers.dev/api/lead`**.
5. **Khuyến nghị** Cloudflare KV → Create namespace `LEAD_GUARD`, gắn vào Worker đúng tên `LEAD_GUARD` để hạn chế gửi trùng và 5 yêu cầu/IP/giờ ở mức best-effort. KV không bảo đảm khóa tuyệt đối khi nhiều yêu cầu đồng thời. Để tăng bảo vệ có thể bật WAF / Rate Limiting của Cloudflare tại Worker.
6. Commit `site/config.js`, chờ GitHub Actions deploy rồi mở trang thật, điền form thử bằng dữ liệu của chính team (đã đồng ý), kiểm tra tin nhắn đến Telegram.

**Quy tắc quan trọng:** bot Telegram chỉ ở Worker Secret; tuyệt đối không để ở JS/HTML/git. Form không chạy trên `file://`; cần HTTPS GitHub Pages thực tế và thiết lập Turnstile đúng hostname. Giữ nhóm Telegram riêng tư, hạn chế thành viên và phân quyền, có quy trình xóa thông tin theo yêu cầu.

## 3) Kiểm tra SEO trước khi đưa quảng cáo

- Google Search Console: xác minh trang công khai, gửi `sitemap.xml` tại root đường dẫn repo (ví dụ `https://USERNAME.github.io/REPO/sitemap.xml`).
- Xem View Source để kiểm tra canonical và OG dùng **URL đã deploy**, không chứa `example.invalid`.
- Facebook Sharing Debugger: kiểm tra OpenGraph, ảnh `og-dien-tien.jpg`.
- Nội dung chứa một H1 và các H2/H3, alt ảnh, FAQ JSON-LD, title/description, liên kết nguồn.
- Nếu bật domain riêng, cần cập nhật SITE_URL rồi deploy lại, không dùng lẫn tên miền cũ.
- Kiểm tra chính sách bảo mật, giấy phép dùng ảnh, vị trí, pháp lý, giá và tình trạng mã lô trước công khai.

## 4) Nội dung đầu tư — không biến giả định thành thông tin thật

- Thông tin nguồn: Quyết định 3276/QĐ-UBND về KCN VSIP Đà Nẵng, quy mô 249,8 ha, 3.730 tỷ VND, lộ trình đến quý IV/2031. [Cổng thông tin Đà Nẵng](https://cttdt.danangportal.gov.vn/en/web/dng/w/chap-thuan-chu-truong-dau-tu-du-an-khu-cong-nghiep-vsip-da-nang-quy-mo-gan-250-ha)
- Cầu Quảng Đà: theo tin tháng 10/2026, đường dẫn phía Điện Bàn Bắc vẫn chưa hoàn thành; không khẳng định mọi tuyến đã thuận tiện. [Tiền Phong](https://svvn.tienphong.vn/da-nang-cau-da-xong-sao-nguoi-dan-chat-vat-di-vong-post1886253.tpo)
- Không khẳng định số công nhân, doanh thu cho thuê, quy hoạch chi tiết, tăng giá chắc chắn hoặc khan hiếm tuyệt đối nếu không có chứng cứ.
- Bảy mã ĐT1-1 ... ĐT1-7 lấy từ **bảng hàng nội bộ**, chưa thay cho sổ, bản đồ địa chính, giá mới nhất hoặc trạng thái tồn kho.

## 5) Checklist nghiệm thu trước xuất bản

- [ ] Xác nhận quyền dùng ảnh thật và sơ đồ.
- [ ] Xác minh số lô, diện tích, trạng thái giao dịch, giá bán và hồ sơ pháp lý.
- [ ] Bổ sung tên pháp nhân + địa chỉ + email đầu mối dữ liệu cá nhân trong `site/chinh-sach-bao-mat.html`.
- [ ] Đặt chính xác `ALLOWED_ORIGIN`, Turnstile hostname, worker API URL.
- [ ] Thử gửi form thực tế trên **tên miền công khai** và nhận đúng Telegram.
- [ ] Kiểm tra smartphone, Facebook mở link, Google Search Console, nội dung chia sẻ.

## Test local

```bash
node --test tests/*.test.mjs
GITHUB_REPOSITORY='username/ten-repo' node scripts/build.mjs
python3 -m http.server 8000 --directory dist
```

**Đã kiểm chứng:** kiểm thử mã JS, bản dựng, kiểm thử API mô phỏng, hiển thị trên Chromium (xem `tests/QA_REPORT.md`).

**Chưa kiểm chứng:** Cloudflare Worker và Telegram thực tế, hiệu năng mạng khách hàng, dữ liệu pháp lý, khả năng chuyển đổi thực tế. Không coi mock test là gửi thật.
