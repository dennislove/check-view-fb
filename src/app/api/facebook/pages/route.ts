import { NextRequest, NextResponse } from 'next/server';
import { getManagedPages } from '@/lib/facebook';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') || process.env.FB_USER_TOKEN || process.env.NEXT_PUBLIC_FB_USER_TOKEN;

  if (!token) {
    return NextResponse.json({ error: 'User Access Token là bắt buộc. Vui lòng cung cấp token hoặc cấu hình trong .env.' }, { status: 400 });
  }

  const { pages, error } = await getManagedPages(token);

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ pages });
}
