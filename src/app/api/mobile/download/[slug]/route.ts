import { NextRequest, NextResponse } from 'next/server';
import { getDownloadUrl } from '@/lib/apps';
import { verifyMobileToken } from '@/lib/auth/mobile-token';

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const apiKey = req.headers.get('x-api-key');
  const expectedKey = process.env.MOBILE_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = getToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
  }

  const payload = await verifyMobileToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const { slug } = await params;
  const url = await getDownloadUrl(slug);
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.redirect(url);
}
