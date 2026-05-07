import { NextResponse, type NextRequest } from 'next/server';
import { verifyMobileToken } from '@/lib/auth/mobile-token';
import { getR2Client, getR2Bucket } from '@/lib/r2/client';
import { getR2SignedUrl } from '@/lib/r2/signed-url';
import { getAppMetadata, getBranchMetadata } from '@/lib/r2/registry';
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

  const branch = request.nextUrl.searchParams.get('branch');
  const SAFE_BRANCH_RE = /^[a-zA-Z0-9_.\-]+$/;
  if (branch && !SAFE_BRANCH_RE.test(branch)) {
    return NextResponse.json({ error: 'Invalid branch name' }, { status: 400 });
  }

  try {
    if (branch) {
      // ── ROM branch download ──
      const romKey = `apps/${slug}/branches/${branch}/latest.gba`;

      try {
        await getR2Client().send(
          new GetObjectCommand({ Bucket: getR2Bucket(), Key: romKey, Range: 'bytes=0-0' }),
        );
      } catch {
        return NextResponse.json({ error: 'ROM not found for this branch' }, { status: 404 });
      }

      const branchMeta = await getBranchMetadata(slug, branch);
      const version = branchMeta?.version || 'unknown';
      const appName = slug.replace(/[^a-zA-Z0-9_-]/g, '-');
      const downloadFilename = `${appName}-${branch}-v${version}.gba`;
      const signedUrl = await getR2SignedUrl(romKey, 600, downloadFilename);
      return NextResponse.json({ url: signedUrl, filename: downloadFilename });
    } else {
      // ── Existing APK download (unchanged) ──
      const apkKey = `apps/${slug}/latest.apk`;

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
    }
  } catch (err) {
    console.error(`Mobile download failed for ${slug}:`, err);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
