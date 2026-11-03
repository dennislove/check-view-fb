# 📘 Hướng Dẫn Toàn Tập: Thiết Lập Facebook, Bot Telegram & Cloudflare Workers

Tài liệu này đúc kết toàn bộ quy trình từ A–Z để thiết lập, vận hành và bảo trì hệ thống **Check View FB** cùng **Bot Telegram báo video vượt 1.000 view chạy 24/7 trên Cloudflare Workers** (không cần bật máy tính).

---

## 📂 1. Tổng Quan Cấu Trúc Dự Án

```text
check-view-fb/
├── src/                        # Giao diện Web Next.js (xem bảng thống kê view trực quan)
│   ├── app/video-views/        # Trang xem danh sách video đa Fanpage xếp theo view giảm dần
│   ├── app/settings/           # Trang cấu hình Facebook App ID, Secret & đăng nhập OAuth/Token
│   └── app/api/facebook/       # API lấy danh sách Fanpage, đổi token dài hạn & lấy view video
├── telegram-bot/               # Bot Telegram độc lập chạy 24/7 trên Cloudflare Workers
│   ├── src/index.js            # Toàn bộ mã nguồn xử lý Webhook Telegram & Cron quét view Facebook
│   ├── wrangler.toml           # Cấu hình Cloudflare Worker, Cron (5 phút/lần), KV Storage & Biến môi trường
│   └── package.json            # Các lệnh deploy và xem log (`npm run deploy`, `npm run logs`)
├── HUONG_DAN_CAIDAT.md         # File hướng dẫn chi tiết này
└── README.md                   # Giới thiệu nhanh dự án
```

---

## 🔵 PHẦN 1: Thiết Lập Facebook App & Lấy Access Token

Để bot (hoặc web) đọc được danh sách Fanpage và số lượt xem video, bạn cần tạo một ứng dụng trên Meta for Developers và lấy **User Access Token**.

### Bước 1.1: Tạo App trên Meta for Developers (Nếu chưa có)
1. Truy cập [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/) và đăng nhập tài khoản Facebook quản trị các Fanpage.
2. Bấm **Create App (Tạo ứng dụng)** → Chọn **Other (Khác)** → Chọn loại **Business (Doanh nghiệp)**.
3. Đặt tên ứng dụng bất kỳ (VD: `Check View Fanpage`) → Bấm **Create App**.
4. Vào **App Settings (Cài đặt ứng dụng) → Basic (Thông tin cơ bản)** để lấy:
   - **App ID** (ID ứng dụng)
   - **App Secret** (Khóa bí mật của ứng dụng — bấm *Show* để copy)

### Bước 1.2: Lấy User Access Token qua Graph API Explorer
1. Mở công cụ [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Ở cột bên phải:
   - **Meta App**: Chọn ứng dụng của bạn vừa tạo.
   - **User or Page**: Chọn **Get User Access Token**.
   - **Permissions (Quyền)**: Tìm và thêm đủ các quyền sau:
     - `pages_show_list` *(hiển thị danh sách Fanpage)*
     - `pages_read_engagement` *(đọc thông số bài viết/video trên Fanpage)*
3. Bấm nút **Generate Access Token (Tạo mã truy cập)** màu xanh → Cửa sổ popup Facebook hiện lên → Chọn các Fanpage muốn theo dõi và bấm **Tiếp tục / Lưu**.
4. Copy chuỗi mã bắt đầu bằng `EAA...` ở ô **Access Token**.

### Bước 1.3: Đổi sang Token Dài Hạn (60 ngày / Page Token vĩnh viễn) — *Khuyên dùng*
Mặc định token vừa lấy chỉ sống được **1–2 giờ**. Để bot chạy suốt ngày đêm mà không bị văng:
- **Cách 1 (Tự động qua Bot)**: Cài đặt `FB_APP_SECRET` lên Cloudflare (xem mục 3.4 bên dưới). Khi bạn gửi token ngắn hạn vào Telegram, bot sẽ tự đổi sang Page Token dài hạn.
- **Cách 2 (Thủ công trên web Facebook)**:
  1. Bấm biểu tượng chữ `ℹ️` màu xanh cạnh chuỗi Token trong Graph API Explorer → Chọn **Open in Access Token Tool**.
  2. Bấm nút **Extend Access Token (Gia hạn mã truy cập)** ở cuối trang.
  3. Copy chuỗi Token mới vừa sinh ra ở dưới cùng và gửi cho Bot.

---

## 🤖 PHẦN 2: Thiết Lập Bot Telegram (BotFather)

*(Hiện tại bạn đã có bot `@alert_view_fb_bot`. Phần này dùng khi bạn muốn tạo bot mới hoặc lấy lại token).*

### Bước 2.1: Tạo Bot mới hoặc Quản lý Bot trên `@BotFather`
1. Mở Telegram, tìm kiếm tài khoản có tích xanh **`@BotFather`**.
2. Gõ lệnh `/newbot` để tạo bot mới:
   - Nhập **Tên hiển thị** của bot (VD: `Alert View FB`).
   - Nhập **Username** của bot (bắt buộc kết thúc bằng chữ `bot`, VD: `alert_view_fb_bot`).
3. `@BotFather` sẽ trả về **HTTP API Token** có dạng:
   ```text
   1234567890:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   *(Nếu muốn đổi token mới vì lộ token cũ: gõ `/revoke` trong `@BotFather` → chọn bot).*

### Bước 2.2: Cách Sử Dụng Bot Hàng Ngày Trên Telegram
Sau khi bot đã được deploy lên Cloudflare (Phần 3), mọi thao tác đều thực hiện ngay trong cửa sổ chat với bot:

1. **Kích hoạt nhận thông báo**:
   - Mở bot trên Telegram, bấm **Start** (`/start`).
   - **Cơ chế bảo mật**: Người đầu tiên gõ `/start` sẽ tự động được khóa làm **Chủ Bot**. Mọi người lạ vào bấm `/start` sau đó sẽ bị từ chối.
2. **Nạp Token Facebook**:
   - Dán thẳng chuỗi `EAA...` vào khung chat (hoặc gõ `/token EAA...`).
   - Bot sẽ **tự động xóa ngay tin nhắn chứa token** để bảo mật, kiểm tra danh sách Fanpage và quét lượt đầu tiên.

#### Bảng lệnh điều khiển Bot:
| Lệnh | Chức năng |
| :--- | :--- |
| `EAAxxxx...` hoặc `/token EAA...` | Kết nối hoặc cập nhật lại Facebook Access Token |
| `/status` | Xem trạng thái bot, số Fanpage, ngưỡng view, thời gian check gần nhất & lỗi (nếu có) |
| `/check` | Yêu cầu bot quét kiểm tra view toàn bộ Fanpage ngay lập tức |
| `/top` | Xem Top 10 video nhiều view nhất hiện tại kèm link mở nhanh |
| `/pages` | Liệt kê danh sách các Fanpage đang được bot theo dõi |
| `/nguong 2000` | Đổi ngưỡng báo view (VD: đổi sang 2.000 view mới báo; mặc định là `1000`) |
| `/pause` | Tạm dừng gửi thông báo tự động |
| `/resume` | Bật lại thông báo tự động |
| `/stop` | Hủy đăng ký nhận thông báo cho cuộc trò chuyện hiện tại |
| `/help` | Hiển thị bảng hướng dẫn lệnh |

> 💡 **Cơ chế chống Spam của Bot**:
> - Mỗi video vượt ngưỡng chỉ được báo **1 lần duy nhất**.
> - Trong lần đầu tiên thêm Fanpage, các video cũ (đăng cách đây **trên 48 giờ**) mà đã trên 1.000 view từ trước sẽ được bot ghi nhận ngầm và **không bắn thông báo hàng loạt**. Chỉ các video mới hoặc video vừa cán mốc mới báo.

---

## ☁️ PHẦN 3: Thiết Lập & Quản Lý Cloudflare Workers

Bot chạy hoàn toàn miễn phí trên nền tảng **Cloudflare Workers** kết hợp **Cloudflare KV** (lưu trữ trạng thái) và **Cron Triggers** (tự động thức dậy mỗi 5 phút).

### Thông tin triển khai hiện tại của bạn:
- **Thư mục code**: `telegram-bot/`
- **Worker URL**: `https://alert-view-fb-bot.alert-view-fb-bot.workers.dev`
- **Webhook URL**: `https://alert-view-fb-bot.alert-view-fb-bot.workers.dev/webhook`
- **KV Namespace (`BOT_KV`)**: `4eede58409bb4d7bb87c49726730f6c1`
- **Lịch chạy tự động (Cron)**: `*/5 * * * *` (5 phút/lần)

---

### Bước 3.1: Đăng nhập Cloudflare CLI (Wrangler)
Mở Terminal tại thư mục dự án:
```bash
cd telegram-bot
npm install
npx wrangler login
```
*(Trình duyệt sẽ mở ra để bạn bấm **Allow** cấp quyền cho Wrangler).*

### Bước 3.2: Tạo bộ nhớ KV (Chỉ làm khi chuyển sang tài khoản Cloudflare mới)
Nếu bạn giữ nguyên tài khoản hiện tại thì **bỏ qua bước này** vì ID đã gắn sẵn trong `wrangler.toml`. Nếu chuyển sang tài khoản Cloudflare mới:
```bash
cd telegram-bot
npx wrangler kv namespace create BOT_KV
```
Copy mã `id = "..."` in ra trên màn hình và thay vào mục `[[kv_namespaces]]` trong file `telegram-bot/wrangler.toml`.

### Bước 3.3: Cấu hình biến trong `telegram-bot/wrangler.toml`
Mở file `telegram-bot/wrangler.toml`:
```toml
[triggers]
crons = ["*/5 * * * *"] # Chu kỳ quét tự động (mặc định 5 phút/lần)

[vars]
FB_APP_ID = "838168192686538"
VIEW_THRESHOLD = "1000"      # Ngưỡng view mặc định
TELEGRAM_CHAT_IDS = ""       # Để trống = người đầu tiên /start là chủ bot. Hoặc điền cố định: "123456789,987654321"
```

### Bước 3.4: Cài đặt các Khóa Bí Mật (Secrets) lên Cloudflare
Các thông tin nhạy cảm không lưu trong file code mà đẩy thẳng lên két sắt mã hóa của Cloudflare:

```bash
cd telegram-bot

# 1. Cài Token của Bot Telegram
npx wrangler secret put TELEGRAM_BOT_TOKEN
# -> Dán mã HTTP API Token lấy từ @BotFather vào đây

# 2. Cài mật khẩu bảo vệ Webhook (chữ ngẫu nhiên bất kỳ, VD: my_secret_123)
npx wrangler secret put WEBHOOK_SECRET

# 3. (Tùy chọn - Khuyên dùng) Cài Facebook App Secret để bot tự đổi Token dài hạn
npx wrangler secret put FB_APP_SECRET
```

### Bước 3.5: Deploy (Đẩy code lên Cloudflare)
Mỗi khi bạn sửa file `telegram-bot/src/index.js` hoặc `wrangler.toml`, chỉ cần chạy:
```bash
cd telegram-bot
npm run deploy
```

### Bước 3.6: Kích hoạt Webhook Telegram (Chỉ cần làm 1 lần hoặc khi đổi Bot/Secret)
Sau khi deploy lần đầu hoặc khi đổi `TELEGRAM_BOT_TOKEN` / `WEBHOOK_SECRET`, mở trình duyệt truy cập đường dẫn:
```text
https://alert-view-fb-bot.alert-view-fb-bot.workers.dev/setup?key=<MẬT_KHẨU_WEBHOOK_SECRET_CỦA_BẠN>
```
Nếu màn hình trả về `{"ok":true,"webhook":true,"bot":"@alert_view_fb_bot",...}` là thành công!

---

## 🛠️ PHẦN 4: Kiểm Tra Lỗi & Vận Hành (Troubleshooting)

1. **Xem log hoạt động của Bot theo thời gian thực**:
   ```bash
   cd telegram-bot
   npm run logs
   ```
2. **Kiểm tra nhanh trạng thái Worker trên trình duyệt**:
   Truy cập [https://alert-view-fb-bot.alert-view-fb-bot.workers.dev/](https://alert-view-fb-bot.alert-view-fb-bot.workers.dev/) sẽ thấy JSON báo số Fanpage, số chat và thời gian quét gần nhất.
3. **Khi Token Facebook hết hạn**:
   Bot sẽ chủ động nhắn cảnh báo lên Telegram: *"⚠️ Không đọc được video của page..."*. Bạn chỉ cần lên Graph API Explorer lấy mã `EAA...` mới và dán thẳng vào chat Telegram là bot chạy tiếp.
4. **Muốn thêm người thứ 2 cùng nhận thông báo**:
   - Người thứ 2 vào bot gõ `/start`, bot sẽ báo mã `Chat ID` của họ (VD: `123456789`).
   - Bạn lấy cả Chat ID của bạn và của họ điền vào `TELEGRAM_CHAT_IDS = "ID_CỦA_BẠN,123456789"` trong `telegram-bot/wrangler.toml` rồi chạy `npm run deploy`.

