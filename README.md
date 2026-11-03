# Check View FB - Thống Kê Lượt Xem Video Facebook Fanpage

Ứng dụng tinh gọn chuyên dùng để xem và thống kê lượt xem video trên các Fanpage Facebook theo thời gian thực.

## Tính năng chính
- **Xem View Video Fanpage**: Xem danh sách video, reels từ nhiều Fanpage, sắp xếp theo số lượng view từ cao đến thấp.
- **Chọn đa Fanpage**: Cho phép chọn xem cùng lúc 1 hoặc tất cả Fanpage đang quản lý.
- **Cấu hình FB**: Đăng nhập nhanh bằng OAuth hoặc dán Access Token từ Facebook Graph API Explorer, tự động gia hạn phiên làm việc 7 ngày.

## Chạy dự án
```bash
# Cài đặt thư viện
npm install

# Chạy môi trường phát triển (HTTP)
npm run dev

# Chạy môi trường phát triển có HTTPS (để đăng nhập Facebook 1-click popup)
npm run dev:https

# Build sản phẩm
npm run build
```

## Bot Telegram báo video vượt 1000 view (chạy 24/7 trên Cloudflare)

👉 **Xem hướng dẫn chi tiết từng bước tại file: [HUONG_DAN_CAIDAT.md](./HUONG_DAN_CAIDAT.md)**

Thư mục `telegram-bot/` là Cloudflare Worker, chạy độc lập và không cần bật máy hay web. Bot là `@alert_view_fb_bot`.

- 5 phút check 1 lần. Video nào đạt từ ngưỡng (mặc định 1000) trở lên thì bot nhắn Telegram, mỗi video chỉ báo 1 lần.
- Lệnh trên Telegram: `/start`, `/token <access_token>`, `/status`, `/check`, `/top`, `/pages`, `/nguong 2000`, `/pause`, `/resume`, `/stop`.
- Token Facebook gửi cho bot bằng lệnh `/token`. Bot sẽ tự xoá tin nhắn chứa token.

Deploy lại sau khi sửa code:
```bash
cd telegram-bot
npm install
npx wrangler deploy
npx wrangler tail      # xem log realtime
```

Muốn token Facebook không bị hết hạn (bot tự đổi sang token dài hạn), đặt App Secret cho bot:
```bash
cd telegram-bot && npx wrangler secret put FB_APP_SECRET
```
