import { NextRequest, NextResponse } from 'next/server';
import { exchangeForLongLivedToken } from '@/lib/facebook';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const appId = body.appId || process.env.FB_APP_ID || process.env.NEXT_PUBLIC_FB_APP_ID;
    const appSecret = body.appSecret || process.env.FB_APP_SECRET || process.env.NEXT_PUBLIC_FB_APP_SECRET;
    const shortLivedToken = body.shortLivedToken;

    if (!appId || !appSecret || !shortLivedToken) {
      return NextResponse.json(
        { error: 'Thiếu App ID, App Secret hoặc Short-lived Token.' },
        { status: 400 }
      );
    }

    const result = await exchangeForLongLivedToken(appId, appSecret, shortLivedToken);

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
