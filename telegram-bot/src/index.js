/**
 * ALERT VIEW FB BOT — Cloudflare Worker
 * ------------------------------------------------------------------
 * Chạy 24/7 trên Cloudflare (miễn phí), không cần bật máy / web.
 *
 * - Cron (mặc định 5 phút/lần): lấy view video mới nhất của từng Fanpage,
 *   video nào đạt >= ngưỡng (mặc định 1000) & chưa báo → nhắn Telegram (mỗi video 1 lần).
 * - Telegram webhook: nhận lệnh /start /token /check /top /status ...
 * - Lưu trữ: Cloudflare KV (binding BOT_KV)
 *
 * Secrets (wrangler secret put):  TELEGRAM_BOT_TOKEN, WEBHOOK_SECRET, FB_APP_SECRET (tùy chọn)
 * Vars (wrangler.toml):           FB_APP_ID, VIEW_THRESHOLD, TELEGRAM_CHAT_IDS
 */

const GRAPH = 'https://graph.facebook.com/v20.0';
/** Lần đầu theo dõi 1 page: video đăng trước mốc này đã vượt ngưỡng sẽ KHÔNG báo (tránh spam video cũ) */
const BASELINE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** Xoá lịch sử "đã báo" sau 90 ngày */
const NOTIFIED_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Free plan giới hạn 50 subrequest / lần chạy → giới hạn số page để còn chỗ gửi tin */
const MAX_PAGES_PER_RUN = 35;

/* ═════════════════════════ Entry ═════════════════════════ */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Telegram gửi update vào đây
    if (request.method === 'POST' && url.pathname === '/webhook') {
      if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      const update = await request.json().catch(() => null);
      if (update?.message) ctx.waitUntil(handleMessage(env, update.message).catch((e) => console.error(e)));
      return new Response('ok');
    }

    // Đăng ký webhook (gọi 1 lần sau khi deploy): /setup?key=<WEBHOOK_SECRET>
    if (url.pathname === '/setup') {
      if (!env.WEBHOOK_SECRET || url.searchParams.get('key') !== env.WEBHOOK_SECRET) {
        return new Response('forbidden', { status: 403 });
      }
      const result = await setup(env, `${url.origin}/webhook`);
      return Response.json(result);
    }

    // Trang trạng thái đơn giản (không lộ token)
    const [config, state] = await Promise.all([getConfig(env), getState(env)]);
    return Response.json({
      bot: 'alert-view-fb',
      enabled: config.enabled,
      threshold: config.threshold,
      pages: config.pages.length,
      chats: config.chats.length,
      lastCheckAt: state.lastCheckAt ? new Date(state.lastCheckAt).toISOString() : null,
      lastError: state.lastError,
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCheck(env, 'cron'));
  },
};

/* ═════════════════════════ Storage (KV) ═════════════════════════ */
// config: do lệnh Telegram ghi (chats, token, pages, ngưỡng)
// state : do lượt check ghi (đã báo, lỗi, top video)
async function getConfig(env) {
  const saved = (await env.BOT_KV.get('config', 'json')) || {};
  return {
    enabled: true,
    threshold: Number(env.VIEW_THRESHOLD) || 1000,
    chats: [],
    userToken: null,
    tokenLongLived: false,
    pages: [],
    pagesUpdatedAt: null,
    ...saved,
  };
}
const saveConfig = (env, c) => env.BOT_KV.put('config', JSON.stringify(c));

async function getState(env) {
  const saved = (await env.BOT_KV.get('state', 'json')) || {};
  return {
    notified: {},
    baselinedPages: [],
    pageErrors: {},
    top: [],
    lastCheckAt: null,
    lastError: null,
    ...saved,
  };
}
const saveState = (env, s) => env.BOT_KV.put('state', JSON.stringify(s));

/* ═════════════════════════ Utils ═════════════════════════ */
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const num = (n) => Number(n || 0).toLocaleString('vi-VN');
const VN_TZ = { timeZone: 'Asia/Ho_Chi_Minh' };
const fmtTime = (ts) => (ts ? new Date(ts).toLocaleString('vi-VN', VN_TZ) : 'chưa có');

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

/* ═════════════════════════ Telegram ═════════════════════════ */
async function tg(env, method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.description || `Telegram ${method} lỗi`);
    err.code = data.error_code;
    throw err;
  }
  return data.result;
}

async function send(env, chatId, text, extra = {}) {
  try {
    return await tg(env, 'sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    });
  } catch (e) {
    console.error(`sendMessage ${chatId}:`, e.message);
    return null;
  }
}

async function broadcast(env, config, text, extra) {
  let ok = 0;
  for (const c of config.chats) if (await send(env, c.id, text, extra)) ok++;
  return ok;
}

async function setup(env, webhookUrl) {
  const webhook = await tg(env, 'setWebhook', {
    url: webhookUrl,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  });
  await tg(env, 'setMyCommands', {
    commands: [
      { command: 'status', description: 'Xem trạng thái bot' },
      { command: 'check', description: 'Kiểm tra view ngay' },
      { command: 'top', description: 'Top 10 video nhiều view' },
      { command: 'pages', description: 'Danh sách Fanpage đang theo dõi' },
      { command: 'token', description: 'Cập nhật Facebook Access Token' },
      { command: 'nguong', description: 'Đổi ngưỡng view, VD: /nguong 2000' },
      { command: 'pause', description: 'Tạm dừng thông báo' },
      { command: 'resume', description: 'Bật lại thông báo' },
      { command: 'help', description: 'Hướng dẫn' },
    ],
  });
  const me = await tg(env, 'getMe');
  return { ok: true, webhook, bot: `@${me.username}`, url: webhookUrl };
}

/* ═════════════════════════ Facebook ═════════════════════════ */
async function graph(path, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  const data = await res.json();
  if (data.error) {
    const err = new Error(data.error.message);
    err.code = data.error.code;
    throw err;
  }
  return data;
}

/** Nhận token user (hoặc page) → đổi dài hạn nếu có App Secret → lấy danh sách Fanpage + page token */
async function connectFacebook(env, rawToken) {
  let token = rawToken;
  let longLived = false;

  if (env.FB_APP_ID && env.FB_APP_SECRET) {
    try {
      const ex = await graph('oauth/access_token', {
        grant_type: 'fb_exchange_token',
        client_id: env.FB_APP_ID,
        client_secret: env.FB_APP_SECRET,
        fb_exchange_token: rawToken,
      });
      if (ex.access_token) {
        token = ex.access_token;
        longLived = true;
      }
    } catch (e) {
      console.error('exchange token:', e.message);
    }
  }

  const me = await graph('me', { fields: 'id,name', access_token: token });

  let pages;
  try {
    const acc = await graph('me/accounts', { fields: 'id,name,access_token', limit: '100', access_token: token });
    pages = (acc.data || []).map((p) => ({ id: p.id, name: p.name, access_token: p.access_token }));
  } catch {
    // Có thể đây là Page Access Token → theo dõi chính page đó
    pages = [{ id: me.id, name: me.name, access_token: token }];
  }

  return { me, token, longLived, pages };
}

async function fetchPageVideos(page) {
  const data = await graph(`${page.id}/videos`, {
    fields: 'id,title,description,created_time,permalink_url,views',
    limit: '50',
    access_token: page.access_token,
  });
  return (data.data || []).map((v) => ({
    id: v.id,
    title:
      (v.title && v.title.trim()) ||
      (v.description && v.description.split('\n')[0].trim().slice(0, 120)) ||
      `Video #${v.id}`,
    created_time: v.created_time,
    views: typeof v.views === 'number' ? v.views : 0,
    url: v.permalink_url
      ? v.permalink_url.startsWith('http')
        ? v.permalink_url
        : `https://www.facebook.com${v.permalink_url}`
      : `https://www.facebook.com/${v.id}`,
    pageId: page.id,
    pageName: page.name,
  }));
}

/* ═════════════════════════ Check ═════════════════════════ */
async function runCheck(env, reason = 'cron') {
  const [config, state] = await Promise.all([getConfig(env), getState(env)]);
  const summary = { pages: 0, videos: 0, sent: 0, errors: 0, baselined: 0, skipped: false };

  if (reason === 'cron' && (!config.enabled || !config.chats.length || !config.pages.length)) {
    summary.skipped = true;
    return summary; // không ghi KV khi không có gì để làm (tiết kiệm quota)
  }
  if (!config.pages.length) {
    state.lastError = 'Chưa có Fanpage nào. Gửi /token <access_token> để kết nối Facebook.';
    await saveState(env, state);
    return summary;
  }

  const threshold = config.threshold;
  const pages = config.pages.slice(0, MAX_PAGES_PER_RUN);
  const hits = [];
  const all = [];

  // Gọi song song tất cả page
  const results = await Promise.allSettled(pages.map((p) => fetchPageVideos(p)));

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const r = results[i];
    summary.pages++;

    if (r.status === 'rejected') {
      summary.errors++;
      const msg = r.reason?.message || String(r.reason);
      const wasOk = !state.pageErrors[page.id];
      state.pageErrors[page.id] = msg;
      if (wasOk && (r.reason?.code === 190 || r.reason?.code === 102 || /token|session/i.test(msg))) {
        await broadcast(
          env,
          config,
          `⚠️ <b>Không đọc được video của page "${esc(page.name)}"</b>\n` +
            `Lỗi: <code>${esc(msg)}</code>\n\n` +
            `👉 Lấy token mới rồi gửi lại: <code>/token EAA...</code>`
        );
      }
      continue;
    }

    delete state.pageErrors[page.id];
    const videos = r.value;
    all.push(...videos);
    summary.videos += videos.length;

    const firstTime = !state.baselinedPages.includes(page.id);
    for (const v of videos) {
      if (v.views < threshold || state.notified[v.id]) continue;
      const age = Date.now() - new Date(v.created_time).getTime();
      if (firstTime && age > BASELINE_MAX_AGE_MS) {
        state.notified[v.id] = { at: Date.now(), silent: true };
        summary.baselined++;
      } else {
        hits.push(v);
      }
    }
    if (firstTime) state.baselinedPages.push(page.id);
  }

  // Gửi thông báo (view cao lên trước)
  if (config.chats.length) {
    hits.sort((a, b) => b.views - a.views);
    for (const v of hits) {
      const delivered = await broadcast(
        env,
        config,
        `🔥 <b>Video vượt ${num(threshold)} view!</b>\n\n` +
          `📄 Page: <b>${esc(v.pageName)}</b>\n` +
          `🎬 ${esc(v.title)}\n` +
          `👁 <b>${num(v.views)}</b> lượt xem\n` +
          `🕒 Đăng ${timeAgo(v.created_time)} (${new Date(v.created_time).toLocaleString('vi-VN', VN_TZ)})`,
        { reply_markup: { inline_keyboard: [[{ text: '▶️ Xem video trên Facebook', url: v.url }]] } }
      );
      // Gửi thất bại (vd: hết quota subrequest) → không đánh dấu, lượt sau gửi lại
      if (!delivered) break;
      state.notified[v.id] = { at: Date.now(), views: v.views };
      summary.sent++;
    }
  }

  // Dọn lịch sử cũ
  const cutoff = Date.now() - NOTIFIED_TTL_MS;
  for (const [id, n] of Object.entries(state.notified)) if (n.at < cutoff) delete state.notified[id];

  state.top = all
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map(({ title, views, url, pageName, created_time }) => ({ title: title.slice(0, 80), views, url, pageName, created_time }));
  state.lastCheckAt = Date.now();
  state.lastError =
    summary.errors && summary.errors === summary.pages
      ? 'Tất cả page đều lỗi khi gọi Facebook API'
      : config.pages.length > MAX_PAGES_PER_RUN
        ? `Chỉ theo dõi ${MAX_PAGES_PER_RUN}/${config.pages.length} page đầu (giới hạn Cloudflare free)`
        : null;

  await saveState(env, state);
  console.log(`check(${reason})`, JSON.stringify(summary));
  return summary;
}

/* ═════════════════════════ Commands ═════════════════════════ */
const HELP =
  `🤖 <b>Bot thông báo view video Fanpage</b>\n\n` +
  `/token &lt;access_token&gt; – Kết nối Facebook (token từ Graph API Explorer)\n` +
  `/status – Xem trạng thái\n` +
  `/check – Kiểm tra ngay\n` +
  `/top – Top 10 video nhiều view\n` +
  `/pages – Fanpage đang theo dõi\n` +
  `/nguong 2000 – Đổi ngưỡng view\n` +
  `/pause, /resume – Tạm dừng / bật lại\n` +
  `/stop – Ngừng nhận thông báo ở chat này`;

async function statusText(env, config) {
  const state = await getState(env);
  const errs = Object.keys(state.pageErrors).length;
  return (
    `📊 <b>Trạng thái bot</b>\n\n` +
    `• Trạng thái: ${config.enabled ? '🟢 Đang bật' : '⏸ Tạm dừng'}\n` +
    `• Fanpage theo dõi: <b>${config.pages.length}</b>${errs ? ` (⚠️ ${errs} page lỗi)` : ''}\n` +
    `• Token: ${config.userToken ? (config.tokenLongLived ? '✅ dài hạn' : '⚠️ ngắn hạn (có thể hết hạn sau 1–2h)') : '❌ chưa có'}\n` +
    `• Ngưỡng báo: <b>${num(config.threshold)}</b> view\n` +
    `• Lần check gần nhất: ${fmtTime(state.lastCheckAt)}\n` +
    `• Đã báo: <b>${Object.values(state.notified).filter((n) => !n.silent).length}</b> video` +
    (state.lastError ? `\n\n⚠️ ${esc(state.lastError)}` : '') +
    (errs
      ? '\n\n' +
        Object.entries(state.pageErrors)
          .map(([id, e]) => `• ${esc(config.pages.find((p) => p.id === id)?.name || id)}: <code>${esc(e)}</code>`)
          .join('\n')
      : '')
  );
}

async function handleMessage(env, msg) {
  const chatId = msg.chat.id;
  let text = (msg.text || '').trim();
  if (!text) return;

  // Nếu người dùng dán thẳng chuỗi Facebook Access Token (bắt đầu bằng EAA...) mà quên gõ /token ở đầu
  if (/^EAA[A-Za-z0-9]{20,}/.test(text)) {
    text = `/token ${text}`;
  }

  if (!text.startsWith('/')) return;

  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = rawCmd.split('@')[0].toLowerCase();
  const chatName =
    msg.chat.title || [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(' ') || msg.chat.username || String(chatId);

  const config = await getConfig(env);
  const allowList = String(env.TELEGRAM_CHAT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const registered = config.chats.some((c) => c.id === chatId);

  if (cmd === '/start') {
    if (registered) return send(env, chatId, `✅ Chat này đã đăng ký rồi.\n\n${HELP}`);
    const allowed = allowList.length ? allowList.includes(chatId) : config.chats.length === 0;
    if (!allowed) {
      return send(
        env,
        chatId,
        `🔒 Bot này là bot riêng.\nChat ID của bạn: <code>${chatId}</code>\n` +
          `Chủ bot có thể thêm ID này vào <code>TELEGRAM_CHAT_IDS</code> trong wrangler.toml.`
      );
    }
    config.chats.push({ id: chatId, name: chatName, addedAt: Date.now() });
    await saveConfig(env, config);
    await send(env, chatId, `🎉 <b>Đăng ký thành công!</b>\n\n${HELP}`);
    if (!config.pages.length) {
      await send(
        env,
        chatId,
        `👉 <b>Bước tiếp theo:</b> kết nối Facebook\n\n` +
          `1. Mở https://developers.facebook.com/tools/explorer/\n` +
          `2. Chọn app của bạn → Get User Access Token, tick quyền <code>pages_show_list</code>, <code>pages_read_engagement</code>\n` +
          `3. Copy token và gửi cho bot:\n<code>/token EAAxxxx...</code>`
      );
    }
    return;
  }

  if (!registered) return send(env, chatId, 'Gõ /start để đăng ký nhận thông báo.');

  switch (cmd) {
    case '/help':
      return send(env, chatId, HELP);

    case '/status':
      return send(env, chatId, await statusText(env, config));

    case '/token': {
      const token = args.join('').trim();
      // Xoá tin nhắn chứa token cho an toàn
      tg(env, 'deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
      if (!token) return send(env, chatId, 'Cú pháp: <code>/token EAAxxxx...</code>');

      await send(env, chatId, '🔄 Đang kết nối Facebook...');
      try {
        const fb = await connectFacebook(env, token);
        if (!fb.pages.length) {
          return send(env, chatId, `⚠️ Token của <b>${esc(fb.me.name)}</b> không quản lý Fanpage nào (hoặc thiếu quyền pages_show_list).`);
        }
        config.userToken = fb.token;
        config.tokenLongLived = fb.longLived;
        config.pages = fb.pages;
        config.pagesUpdatedAt = Date.now();
        config.enabled = true;
        await saveConfig(env, config);

        await send(
          env,
          chatId,
          `✅ <b>Đã kết nối: ${esc(fb.me.name)}</b>\n` +
            `Theo dõi <b>${fb.pages.length}</b> Fanpage:\n` +
            fb.pages.map((p) => `• ${esc(p.name)}`).join('\n') +
            (fb.longLived
              ? `\n\n🔐 Đã đổi sang token dài hạn — bot chạy lâu dài không cần nhập lại.`
              : `\n\n⚠️ Token ngắn hạn (hết hạn sau ~1–2h). Để chạy lâu dài: cấu hình <code>FB_APP_SECRET</code> cho bot, ` +
                `hoặc vào Access Token Debugger bấm "Extend Access Token" rồi gửi lại token đã extend.`)
        );
        const s = await runCheck(env, 'token');
        return send(
          env,
          chatId,
          `🔎 Lượt kiểm tra đầu tiên: ${s.videos} video, gửi ${s.sent} thông báo` +
            (s.baselined ? `, bỏ qua ${s.baselined} video cũ (đăng >48h, đã vượt ngưỡng từ trước)` : '') +
            '.'
        );
      } catch (e) {
        return send(env, chatId, `❌ Token không hợp lệ: <code>${esc(e.message)}</code>`);
      }
    }

    case '/pages': {
      if (!config.pages.length) return send(env, chatId, 'Chưa có Fanpage. Gửi <code>/token EAA...</code> để kết nối.');
      return send(env, chatId, `📄 <b>${config.pages.length} Fanpage đang theo dõi</b>\n\n${config.pages.map((p) => `• ${esc(p.name)}`).join('\n')}`);
    }

    case '/nguong':
    case '/threshold': {
      const n = Math.floor(Number(String(args[0] || '').replace(/[.,]/g, '')));
      if (!Number.isFinite(n) || n < 1) return send(env, chatId, `Ngưỡng hiện tại: <b>${num(config.threshold)}</b> view.\nĐổi: <code>/nguong 2000</code>`);
      config.threshold = n;
      await saveConfig(env, config);
      return send(env, chatId, `✅ Đã đổi ngưỡng báo thành <b>${num(n)}</b> view.`);
    }

    case '/check': {
      if (!config.pages.length) return send(env, chatId, 'Chưa có Fanpage. Gửi <code>/token EAA...</code> để kết nối.');
      await send(env, chatId, '🔄 Đang kiểm tra...');
      const s = await runCheck(env, 'manual');
      return send(
        env,
        chatId,
        `✅ Đã kiểm tra ${s.pages} page, ${s.videos} video.\n` +
          (s.sent ? `🔔 Gửi ${s.sent} thông báo mới.` : 'Không có video mới vượt ngưỡng.') +
          (s.errors ? `\n⚠️ ${s.errors} page lỗi – xem /status.` : '')
      );
    }

    case '/top': {
      let state = await getState(env);
      if (!state.top.length && config.pages.length) {
        await runCheck(env, 'manual');
        state = await getState(env);
      }
      if (!state.top.length) return send(env, chatId, 'Chưa có dữ liệu video.');
      const lines = state.top.map(
        (v, i) =>
          `${i + 1}. <b>${num(v.views)}</b> 👁 – <a href="${esc(v.url)}">${esc(v.title.slice(0, 60))}</a>\n` +
          `    <i>${esc(v.pageName)} • ${timeAgo(v.created_time)}</i>`
      );
      return send(env, chatId, `🏆 <b>Top 10 video nhiều view</b> (lúc ${fmtTime(state.lastCheckAt)})\n\n${lines.join('\n')}`);
    }

    case '/pause':
      config.enabled = false;
      await saveConfig(env, config);
      return send(env, chatId, '⏸ Đã tạm dừng thông báo. Gõ /resume để bật lại.');

    case '/resume':
      config.enabled = true;
      await saveConfig(env, config);
      return send(env, chatId, '▶️ Đã bật lại thông báo.');

    case '/stop':
      config.chats = config.chats.filter((c) => c.id !== chatId);
      await saveConfig(env, config);
      return send(env, chatId, '👋 Đã ngừng gửi thông báo cho chat này. Gõ /start để bật lại.');

    default:
      return send(env, chatId, HELP);
  }
}
