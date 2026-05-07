import { NextResponse, type NextRequest } from 'next/server';
import { verifyMobileToken } from '@/lib/auth/mobile-token';
import { getRegistry, getAppMetadata, getBuildStatus } from '@/lib/r2/registry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  }

  const payload = await verifyMobileToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  try {
    const registry = await getRegistry();
    const apps = await Promise.all(
      registry.map(async (entry) => {
        const [metadata, buildStatus] = await Promise.all([
          getAppMetadata(entry.slug),
          getBuildStatus(entry.slug),
        ]);
        return { ...entry, latest: metadata, buildStatus };
      }),
    );
    return NextResponse.json({ apps });
  } catch (err) {
    console.error('Mobile /api/mobile/apps error:', err);
    return NextResponse.json({ error: 'Failed to list apps' }, { status: 500 });
  }
}
