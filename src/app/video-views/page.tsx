'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFacebookPages } from '@/hooks/useFacebookPages';
import {
  Eye, RefreshCw, Video, Loader2, AlertCircle, Facebook, CheckSquare, Square, ExternalLink,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────── */
interface VideoInsight {
  id: string;
  title?: string;
  description?: string;
  created_time: string;
  total_video_views: number;
  permalink_url?: string;
  pageId: string;
  pageName: string;
  pageAvatar?: string;
}

/* ─── Helpers ────────────────────────────────────────────── */
function fmt(n?: number): string {
  if (n == null || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('vi-VN');
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function VideoViewsPage() {
  const { pages, session } = useFacebookPages();

  // Multi-select pages
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());

  // Map pageId → loading/error/videos
  const [pageData, setPageData] = useState<Record<string, {
    loading: boolean;
    error: string | null;
    videos: VideoInsight[];
  }>>({});

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Auto-select all pages on first load
  useEffect(() => {
    if (pages.length > 0 && selectedPageIds.size === 0) {
      setSelectedPageIds(new Set(pages.map((p) => p.id)));
    }
  }, [pages]);

  /* ── Fetch videos for a single page ── */
  const fetchPage = useCallback(async (pageId: string, pageToken: string, pageName: string, pageAvatar?: string) => {
    setPageData((prev) => ({
      ...prev,
      [pageId]: { loading: true, error: null, videos: prev[pageId]?.videos ?? [] },
    }));

    try {
      const params = new URLSearchParams({ pageId, pageAccessToken: pageToken, limit: '50' });
      const res = await fetch(`/api/facebook/video-insights?${params}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const videos: VideoInsight[] = (data.videos ?? []).map((v: any) => ({
        id: v.id,
        title: v.title,
        description: v.description,
        created_time: v.created_time,
        total_video_views: typeof v.total_video_views === 'number' ? v.total_video_views : (v.views ?? 0),
        permalink_url: v.permalink_url,
        pageId,
        pageName,
        pageAvatar,
      }));

      setPageData((prev) => ({
        ...prev,
        [pageId]: { loading: false, error: null, videos },
      }));
    } catch (e: any) {
      setPageData((prev) => ({
        ...prev,
        [pageId]: { loading: false, error: e.message ?? 'Lỗi không xác định', videos: [] },
      }));
    }
  }, []);

  /* ── Fetch tất cả pages đang selected ── */
  const fetchSelected = useCallback(async (ids: Set<string>) => {
    setIsRefreshing(true);
    await Promise.all(
      pages
        .filter((p) => ids.has(p.id))
        .map((p) => fetchPage(p.id, p.access_token, p.name, p.picture?.data?.url))
    );
    setIsRefreshing(false);
  }, [pages, fetchPage]);

  // Fetch khi selectedPageIds thay đổi (chỉ fetch page mới chưa có data)
  const prevSelected = useRef<Set<string>>(new Set());
  useEffect(() => {
    const newIds = new Set<string>();
    selectedPageIds.forEach((id) => {
      if (!prevSelected.current.has(id)) newIds.add(id);
    });
    prevSelected.current = new Set(selectedPageIds);

    if (newIds.size === 0) return;

    newIds.forEach((id) => {
      const page = pages.find((p) => p.id === id);
      if (page) fetchPage(page.id, page.access_token, page.name, page.picture?.data?.url);
    });
  }, [selectedPageIds, pages, fetchPage]);

  /* ── Toggle page select ── */
  const togglePage = (id: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedPageIds.size === pages.length) {
      setSelectedPageIds(new Set());
    } else {
      const allIds = new Set(pages.map((p) => p.id));
      setSelectedPageIds(allIds);
    }
  };

  /* ── Gộp và sort tất cả videos của các page đang selected theo views giảm dần (cao nhất lên trước) ── */
  const allVideos: VideoInsight[] = [];
  selectedPageIds.forEach((id) => {
    const d = pageData[id];
    if (d?.videos) allVideos.push(...d.videos);
  });
  allVideos.sort((a, b) => b.total_video_views - a.total_video_views);

  const anyLoading = Array.from(selectedPageIds).some((id) => pageData[id]?.loading);

  /* ── Not logged in ── */
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
        <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
          <Facebook className="w-10 h-10 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Chưa kết nối Facebook</h2>
        <p className="text-sm text-slate-400">Vào <strong className="text-slate-200">Cấu hình & Kết nối API</strong> để đăng nhập trước.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Video className="w-6 h-6 text-blue-400" />
            Lượt xem Video
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {allVideos.length > 0
              ? `${allVideos.length} video từ ${selectedPageIds.size} Fanpage được chọn • Xếp view cao lên trước`
              : 'Chọn page để xem view video'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchSelected(selectedPageIds)}
          disabled={isRefreshing || anyLoading || selectedPageIds.size === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || anyLoading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>
      </div>

      {/* ── Page Multi-Select (Chọn Page) ── */}
      {pages.length > 0 && (
        <div className="mac-card rounded-xl border border-slate-700/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Chọn Fanpage cần xem ({selectedPageIds.size}/{pages.length})
            </p>
            <button
              type="button"
              onClick={toggleAll}
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              {selectedPageIds.size === pages.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {pages.map((p) => {
              const active = selectedPageIds.has(p.id);
              const d = pageData[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePage(p.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    active
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-200 ring-1 ring-blue-500/30'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  {active ? (
                    <CheckSquare className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  )}
                  {p.picture?.data?.url ? (
                    <img src={p.picture.data.url} alt={p.name} className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-blue-600/40 flex items-center justify-center text-[8px] text-blue-300 font-bold">
                      {p.name[0]}
                    </div>
                  )}
                  <span className="max-w-[150px] truncate">{p.name}</span>
                  {d?.loading && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
                  {d?.videos && !d.loading && (
                    <span className="text-[10px] text-slate-500 font-normal">({d.videos.length})</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Errors ── */}
      {Array.from(selectedPageIds).map((id) => {
        const d = pageData[id];
        if (!d?.error) return null;
        const page = pages.find((p) => p.id === id);
        return (
          <div key={id} className="flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/20 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span><strong>{page?.name ?? id}:</strong> {d.error}</span>
          </div>
        );
      })}

      {/* ── Loading placeholder ── */}
      {anyLoading && allVideos.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Đang lấy dữ liệu video từ Facebook...
        </div>
      )}

      {/* ── Empty ── */}
      {!anyLoading && allVideos.length === 0 && selectedPageIds.size > 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-sm gap-2">
          <Video className="w-10 h-10 opacity-20" />
          <p>Không tìm thấy video nào từ các page đã chọn.</p>
        </div>
      )}

      {/* ── Video List (Dạng list ngang, tối ưu xem được nhiều) ── */}
      {allVideos.length > 0 && (
        <div className="mac-card rounded-xl border border-slate-700/60 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_120px_140px] gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400">
            <span className="w-8 text-center text-slate-500">#</span>
            <span>Tên Page / Video</span>
            <span className="text-right">Lượt view</span>
            <span className="text-right">Thời gian</span>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-slate-800/60">
            {allVideos.map((video, idx) => (
              <div
                key={`${video.pageId}-${video.id}`}
                className="grid grid-cols-[auto_1fr_120px_140px] gap-3 items-center px-4 py-2.5 hover:bg-slate-800/40 transition-colors text-xs"
              >
                {/* 1. Thứ hạng */}
                <span className={`w-8 text-center font-bold font-mono text-[11px] ${
                  idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-slate-500'
                }`}>
                  {idx + 1}
                </span>

                {/* 2. Tên Page & Video */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {video.pageAvatar ? (
                    <img src={video.pageAvatar} alt={video.pageName} className="w-6 h-6 rounded-full object-cover shrink-0 border border-slate-700" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-blue-600/30 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {video.pageName[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex items-center gap-2 flex-1">
                    <span className="font-semibold text-blue-300 shrink-0 max-w-[140px] truncate">
                      {video.pageName}
                    </span>
                    <span className="text-slate-600 shrink-0">•</span>
                    <span className="text-slate-300 truncate" title={video.title}>
                      {video.title}
                    </span>
                    {video.permalink_url && (
                      <a
                        href={video.permalink_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-500 hover:text-blue-400 transition-colors shrink-0"
                        title="Xem trên Facebook"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* 3. Lượt view */}
                <div className="flex items-center justify-end gap-1.5 font-bold tabular-nums">
                  <Eye className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-white text-sm">
                    {fmt(video.total_video_views)}
                  </span>
                </div>

                {/* 4. Thời gian (dạng X phút trước / X giờ trước) */}
                <div className="text-right text-slate-400 text-[11px]">
                  {timeAgo(video.created_time)}
                </div>
              </div>
            ))}
          </div>

          {/* Table footer */}
          <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/40 text-[10px] text-slate-500 flex items-center justify-between">
            <span>Tổng cộng: <strong className="text-slate-300">{allVideos.length}</strong> video</span>
            <span>Dữ liệu thực từ Facebook API (lượt xem trực tiếp)</span>
          </div>
        </div>
      )}
    </div>
  );
}
