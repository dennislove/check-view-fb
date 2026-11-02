'use client';

import React, { useState, useEffect } from 'react';
import { storage } from '@/lib/storage';
import { useFacebookPages } from '@/hooks/useFacebookPages';
import {
  Facebook, Save, RefreshCw, Key,
  CheckCircle2, ShieldCheck,
  Loader2, LogOut, Clock, Eye, EyeOff, Info,
} from 'lucide-react';

/* ─── Inline Facebook JS SDK loader ─────────────────────── */
declare global {
  interface Window { FB: any; fbAsyncInit: () => void; }
}

function loadFbSDK(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (location.protocol !== 'https:') {
      reject(new Error(
        'Facebook Login yêu cầu HTTPS. Vui lòng chạy: npm run dev:https\n' +
        'rồi truy cập https://localhost:3000 thay vì http://localhost:3000\n' +
        '(Hoặc bạn có thể dán User Access Token trực tiếp bên dưới không cần HTTPS)'
      ));
      return;
    }

    if (window.FB) {
      window.FB.init({ appId, cookie: true, xfbml: true, version: 'v20.0' });
      resolve();
      return;
    }

    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: true, version: 'v20.0' });
      resolve();
    };

    if (document.getElementById('facebook-jssdk')) return;

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/vi_VN/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error(
      'Không thể tải Facebook JS SDK. Kiểm tra kết nối mạng hoặc bật HTTPS.'
    ));
    document.head.appendChild(script);
  });
}

/* ─── Main Component ───────────────────────────────────── */
export default function SettingsPage() {
  const [fbLoginLoading, setFbLoginLoading] = useState(false);
  const [fbLoginError, setFbLoginError] = useState<string | null>(null);
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const {
    pages,
    appId, setAppId, appSecret, setAppSecret,
    session, saveSession, renewSession, logout,
    isLoading, refreshPages,
  } = useFacebookPages();

  // Load default fallback for App ID if empty
  useEffect(() => {
    const saved = storage.getFbAppId();
    if (!saved) {
      const defaultId = process.env.NEXT_PUBLIC_FB_APP_ID || '838168192686538';
      setAppId(defaultId);
      storage.setFbAppId(defaultId);
    }
  }, [setAppId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const daysLeft = session?.expiresAt
    ? Math.max(0, Math.ceil((session.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  /* ── Save App Credentials to LocalStorage ── */
  const handleSaveAppCredentials = () => {
    const trimmedId = appId.trim();
    const trimmedSecret = appSecret.trim();

    storage.setFbAppId(trimmedId);
    storage.setFbAppSecret(trimmedSecret);
    setFbLoginError(null);
    showToast('Đã lưu Facebook App ID & App Secret vào trình duyệt!');
  };

  /* ── Facebook 1-Click Login ── */
  const handleFbLogin = async () => {
    const activeAppId = appId.trim() || storage.getFbAppId();
    if (!activeAppId) {
      setFbLoginError('Vui lòng nhập Facebook App ID ở mục trên trước khi đăng nhập.');
      return;
    }

    setFbLoginLoading(true);
    setFbLoginError(null);

    try {
      await loadFbSDK(activeAppId);

      window.FB.login(
        (res: any) => {
          if (res.authResponse) {
            const { accessToken, userID } = res.authResponse;
            window.FB.api('/me', { fields: 'id,name,picture.type(large)' }, async (me: any) => {
              const userName = me?.name || 'Tài khoản Facebook';
              const userPic = me?.picture?.data?.url;
              const userEmail = me?.email;

              let finalToken = accessToken;
              let isLongLived = false;

              // Tự động đổi Long-lived Token nếu có App Secret
              const activeSecret = appSecret.trim() || storage.getFbAppSecret();
              if (activeSecret) {
                try {
                  const exRes = await fetch('/api/facebook/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      appId: activeAppId,
                      appSecret: activeSecret,
                      shortLivedToken: accessToken,
                    }),
                  });
                  const exData = await exRes.json();
                  if (exData.access_token) {
                    finalToken = exData.access_token;
                    isLongLived = true;
                  }
                } catch {
                  // Fallback to original token
                }
              }

              // Lưu phiên làm việc 7 ngày
              await saveSession(
                {
                  user: {
                    id: userID,
                    name: userName,
                    email: userEmail,
                    picture: userPic,
                  },
                  accessToken: finalToken,
                  isLongLived,
                },
                7
              );

              setFbLoginLoading(false);
              showToast('Đăng nhập Facebook thành công! Đã lưu phiên 1 tuần.');
            });
          } else {
            setFbLoginError('Đăng nhập bị hủy hoặc trình duyệt chặn popup Facebook.');
            setFbLoginLoading(false);
          }
        },
        {
          scope: 'public_profile,pages_show_list,pages_read_engagement',
          return_scopes: true,
          auth_type: 'rerequest',
        }
      );
    } catch (err: any) {
      setFbLoginError(err.message || 'Lỗi tải Facebook SDK. Kiểm tra kết nối mạng.');
      setFbLoginLoading(false);
    }
  };

  /* ── Đăng nhập bằng Token thủ công ── */
  const handleManualTokenLogin = async () => {
    const token = manualToken.trim();
    if (!token) {
      setFbLoginError('Vui lòng dán chuỗi Access Token Facebook.');
      return;
    }

    setFbLoginLoading(true);
    setFbLoginError(null);

    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/me?fields=id,name,picture.type(large)&access_token=${encodeURIComponent(
          token
        )}`
      );
      const me = await res.json();

      if (me.error) {
        setFbLoginError(`Token không hợp lệ hoặc đã hết hạn: ${me.error.message}`);
        setFbLoginLoading(false);
        return;
      }

      let finalToken = token;
      let isLongLived = false;
      const activeAppId = appId.trim() || storage.getFbAppId();
      const activeSecret = appSecret.trim() || storage.getFbAppSecret();

      if (activeAppId && activeSecret) {
        try {
          const exRes = await fetch('/api/facebook/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              appId: activeAppId,
              appSecret: activeSecret,
              shortLivedToken: token,
            }),
          });
          const exData = await exRes.json();
          if (exData.access_token) {
            finalToken = exData.access_token;
            isLongLived = true;
          }
        } catch { }
      }

      await saveSession(
        {
          user: {
            id: me.id,
            name: me.name || 'Người dùng Facebook',
            email: me.email,
            picture: me.picture?.data?.url,
          },
          accessToken: finalToken,
          isLongLived,
        },
        7
      );

      setManualToken('');
      setShowManualToken(false);
      setFbLoginLoading(false);
      showToast('Đã kích hoạt phiên làm việc 1 tuần thành công!');
    } catch (err: any) {
      setFbLoginError(err?.message || 'Lỗi kiểm tra Token.');
      setFbLoginLoading(false);
    }
  };

  /* ── Facebook logout ── */
  const handleFbLogout = () => {
    if (window.FB) {
      try {
        window.FB.logout(() => { });
      } catch { }
    }
    logout();
    showToast('Đã đăng xuất tài khoản Facebook.');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-2">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Facebook className="w-6 h-6 text-blue-400" />
          Cấu hình Facebook
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Thiết lập Facebook App ID, kết nối tài khoản và quản lý danh sách Fanpage
        </p>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-300 flex items-center gap-2 shadow-lg animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* ════ CARD 1: CẤU HÌNH APP ID & APP SECRET (LUÔN HIỂN THỊ, LƯU TRÌNH DUYỆT) ════ */}
      <div className="mac-card rounded-2xl border border-slate-700/60 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600/10 to-transparent border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/20">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Khóa Ứng Dụng (App ID &amp; App Secret)</h2>
              <p className="text-xs text-slate-400">Nhập trực tiếp trên giao diện — <a href="https://developers.facebook.com/apps" target="_blank" className="text-blue-400 hover:text-blue-300">https://developers.facebook.com/apps</a></p>
            </div>
          </div>
          {appId && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/25">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã có App ID
            </span>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Facebook App ID</span>
                <span className="text-[10px] text-blue-400">Bắt buộc cho OAuth</span>
              </label>
              <input
                type="text"
                value={appId}
                onChange={(e) => {
                  setAppId(e.target.value);
                  storage.setFbAppId(e.target.value);
                  setFbLoginError(null);
                }}
                placeholder="VD: 838168192686538"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>App Secret</span>
                <span className="text-[10px] text-slate-500">Tùy chọn (đổi token 60 ngày)</span>
              </label>
              <div className="relative">
                <input
                  type={showAppSecret ? 'text' : 'password'}
                  value={appSecret}
                  onChange={(e) => {
                    setAppSecret(e.target.value);
                    storage.setFbAppSecret(e.target.value);
                  }}
                  placeholder="Dán App Secret của ứng dụng..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-xs text-white font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                />
                <button
                  type="button"
                  onClick={() => setShowAppSecret(!showAppSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showAppSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              Lấy tại <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">developers.facebook.com/apps</a>. Dữ liệu lưu trong LocalStorage máy bạn.
            </p>

            <button
              type="button"
              onClick={handleSaveAppCredentials}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all shrink-0"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400" />
              Lưu cấu hình App
            </button>
          </div>
        </div>
      </div>

      {/* ════ CARD 2: KẾT NỐI TÀI KHOẢN & PHIÊN ĐĂNG NHẬP (OAUTH HOẶC TOKEN) ════ */}
      <div className="mac-card rounded-2xl border border-slate-700/60 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600/10 to-transparent border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/20">
              <Facebook className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Phiên Làm Việc Facebook</h2>
              <p className="text-xs text-slate-400">Đăng nhập bằng tài khoản hoặc kích hoạt nhanh bằng Access Token</p>
            </div>
          </div>
          {session && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/25">
              <CheckCircle2 className="w-4 h-4" /> Đang hoạt động ({daysLeft} ngày)
            </span>
          )}
        </div>

        <div className="p-6 space-y-5">
          {session ? (
            /* ── TRẠNG THÁI: ĐÃ ĐĂNG NHẬP ── */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-3.5">
                  {session.user.picture ? (
                    <img
                      src={session.user.picture}
                      alt={session.user.name}
                      className="w-12 h-12 rounded-full border-2 border-emerald-400/60 object-cover shadow"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow">
                      {session.user.name?.[0] || 'F'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white text-sm">{session.user.name}</p>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Đang hoạt động
                      </span>
                    </div>
                    {session.user.email && (
                      <p className="text-xs text-slate-400">{session.user.email}</p>
                    )}
                    <p className="text-xs text-emerald-400 font-medium flex items-center gap-1 pt-1">
                      <Clock className="w-3.5 h-3.5" />
                      Phiên lưu 1 tuần: Còn <strong>{daysLeft} ngày</strong> (đến {new Date(session.expiresAt).toLocaleDateString('vi-VN')})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      renewSession(7);
                      showToast('Đã gia hạn phiên đăng nhập thêm 7 ngày!');
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
                    title="Gia hạn thêm 7 ngày từ thời điểm này"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Gia hạn 7 ngày
                  </button>
                  <button
                    type="button"
                    onClick={handleFbLogout}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/30 transition-all"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Đăng xuất
                  </button>
                </div>
              </div>

              {/* Fanpage list */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Fanpage được cấp quyền ({pages.length})
                  </span>
                  <button
                    onClick={() => refreshPages()}
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    Làm mới Fanpage
                  </button>
                </div>

                {pages.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pages.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                        {p.picture?.data?.url ? (
                          <img src={p.picture.data.url} alt={p.name} className="w-9 h-9 rounded-full border border-slate-700 object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-blue-600/20 text-blue-400 font-bold flex items-center justify-center shrink-0">{p.name[0]}</div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">ID: {p.id}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                    Chưa tìm thấy Fanpage nào thuộc quyền quản lý của tài khoản này.
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* ── TRẠNG THÁI: CHƯA ĐĂNG NHẬP ── */
            <div className="space-y-4">
              {/* HTTPS Warning Banner */}
              {typeof window !== 'undefined' && window.location.protocol !== 'https:' && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
                  <span className="text-amber-400 text-base leading-none shrink-0">⚠️</span>
                  <div className="space-y-1">
                    <p className="font-semibold text-amber-300">Facebook Login Popup yêu cầu giao thức HTTPS</p>
                    <p className="text-amber-200/80">Bạn đang chạy trên <code className="bg-amber-500/15 px-1 rounded font-mono">http://</code>. Để đăng nhập 1-click popup, chạy lệnh:</p>
                    <code className="block bg-slate-950 border border-amber-500/20 rounded-lg px-3 py-2 font-mono text-emerald-300 mt-1.5">npm run dev:https</code>
                    <p className="text-amber-200/70">Hoặc bạn có thể dán User Token trực tiếp ở khung bên dưới mà không cần HTTPS.</p>
                  </div>
                </div>
              )}

              {fbLoginError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                  {fbLoginError}
                </div>
              )}

              {/* 1-Click Login Button */}
              <button
                type="button"
                onClick={handleFbLogin}
                disabled={fbLoginLoading}
                className={`w-full relative flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl font-bold text-sm text-white overflow-hidden transition-all shadow-lg ${fbLoginLoading
                    ? 'bg-[#1877f2]/70 cursor-wait'
                    : 'bg-[#1877f2] hover:bg-[#166fe5] active:bg-[#1564d3] hover:scale-[1.005] shadow-blue-600/30'
                  }`}
              >
                {fbLoginLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang kết nối Facebook...</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white shrink-0">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                    <span>Đăng nhập bằng Facebook (Lưu session 1 tuần)</span>
                  </>
                )}
              </button>

              <p className="text-center text-[11px] text-slate-400">
                ✓ Phiên làm việc được tự động lưu 7 ngày trên máy của bạn • Không cần đăng nhập lại mỗi ngày.
              </p>

              {/* Dán token thủ công (Graph API Explorer) */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowManualToken(!showManualToken)}
                  className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  {showManualToken ? '▲ Thu gọn ô dán Token' : '▼ Hoặc dán Access Token trực tiếp (Graph API Explorer)'}
                </button>
              </div>

              {showManualToken && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300">
                      Dán User Access Token từ Meta Graph API Explorer
                    </label>
                    <a
                      href="https://developers.facebook.com/tools/explorer/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-blue-400 hover:underline"
                    >
                      Mở Graph API Explorer →
                    </a>
                  </div>
                  <textarea
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    rows={3}
                    placeholder="Dán chuỗi Token EAAL... vào đây để kích hoạt phiên 7 ngày..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleManualTokenLogin}
                    disabled={fbLoginLoading || !manualToken.trim()}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2"
                  >
                    {fbLoginLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Lưu &amp; Kích hoạt phiên 7 ngày
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
