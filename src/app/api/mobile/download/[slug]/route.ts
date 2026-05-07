import { NextResponse, type NextRequest } from 'next/server';
import { verifyMobileToken } from '@/lib/auth/mobile-token';
import { getR2Client, getR2Bucket } from '@/lib/r2/client';
import { getR2SignedUrl } from '@/lib/r2/signed-url';
import { getAppMetadata } from '@/lib/r2/registry';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]+$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const payload = await verifyMobileToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const { slug } = await params;
  if (!SAFE_SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const apkKey = `apps/${slug}/latest.apk`;

  try {
    try {
      await getR2Client().send(
        new GetObjectCommand({ Bucket: getR2Bucket(), Key: apkKey, Range: 'bytes=0-0' }),
      );
    } catch {
      return NextResponse.json({ error: 'APK not found' }, { status: 404 });
    }

    const metadata = await getAppMetadata(slug);
    const version = metadata?.version || 'unknown';
    const appName = (metadata?.name || slug).replace(/[^a-zA-Z0-9_-]/g, '-');
    const downloadFilename = `${appName}-v${version}.apk`;
    const signedUrl = await getR2SignedUrl(apkKey, 600, downloadFilename);
    return NextResponse.json({ url: signedUrl, filename: downloadFilename });
  } catch (err) {
    console.error(`Mobile download failed for ${slug}:`, err);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
