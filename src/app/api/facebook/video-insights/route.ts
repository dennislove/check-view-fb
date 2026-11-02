import { NextRequest, NextResponse } from 'next/server';

const GRAPH_API_VERSION = 'v20.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface VideoInsight {
  id: string;
  title?: string;
  description?: string;
  created_time: string;
  length?: number;
  picture?: string;
  permalink_url?: string;
  views?: number;
  total_video_views?: number;
  total_video_views_unique?: number;
  total_video_impressions?: number;
  total_video_complete_views?: number;
  total_video_10s_views?: number;
  total_video_avg_time_watched?: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pageId = searchParams.get('pageId');
  const pageAccessToken = searchParams.get('pageAccessToken');
  const limit = searchParams.get('limit') || '30';

  if (!pageId || !pageAccessToken) {
    return NextResponse.json({ error: 'Thiếu pageId hoặc pageAccessToken' }, { status: 400 });
  }

  try {
    // Fetch videos & reels from the page with direct `views` field
    // In Facebook Graph API, `views` is an integer directly on the Video object
    // (This does NOT require the restricted read_insights permission).
    const fields = [
      'id',
      'title',
      'description',
      'created_time',
      'length',
      'picture',
      'permalink_url',
      'views',
    ].join(',');

    const videosUrl =
      `${GRAPH_BASE_URL}/${pageId}/videos` +
      `?fields=${fields}` +
      `&limit=${limit}` +
      `&access_token=${encodeURIComponent(pageAccessToken)}`;

    const videosRes = await fetch(videosUrl);
    const videosData = await videosRes.json();

    if (videosData.error) {
      console.error(`[facebook/videos] Error for page ${pageId}:`, videosData.error);
      return NextResponse.json(
        { error: videosData.error.message, code: videosData.error.code },
        { status: 400 }
      );
    }

    const rawVideos: any[] = videosData.data ?? [];
    if (rawVideos.length === 0) {
      return NextResponse.json({ videos: [], total: 0 });
    }

    // Process videos: extract real views and clean title/description
    const videos: VideoInsight[] = rawVideos.map((v) => {
      // Real view count directly from Facebook Video object
      const realViews = typeof v.views === 'number' ? v.views : 0;

      // Reel or mobile video often has null title; use first line of description if title is missing
      const cleanTitle =
        (v.title && v.title.trim()) ||
        (v.description && v.description.split('\n')[0].trim().slice(0, 120)) ||
        `Video #${v.id}`;

      return {
        id: v.id,
        title: cleanTitle,
        description: v.description,
        created_time: v.created_time,
        length: v.length,
        picture: v.picture,
        permalink_url: v.permalink_url?.startsWith('http')
          ? v.permalink_url
          : v.permalink_url
          ? `https://www.facebook.com${v.permalink_url}`
          : undefined,
        views: realViews,
        total_video_views: realViews,
      };
    });

    // Sort by real views descending (cao nhất lên trước)
    videos.sort((a, b) => (b.total_video_views ?? 0) - (a.total_video_views ?? 0));

    return NextResponse.json({
      videos,
      total: videos.length,
      pageId,
    });
  } catch (err: any) {
    console.error('[facebook/video-insights] Unexpected error:', err);
    return NextResponse.json(
      { error: `Lỗi fetch video: ${err.message}` },
      { status: 500 }
    );
  }
}
