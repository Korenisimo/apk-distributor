import { NextResponse, type NextRequest } from 'next/server';
import { verifyMobileToken } from '@/lib/auth/mobile-token';
import { getRegistry, getAppMetadata, getBuildStatus, listBranches, getBranchMetadata } from '@/lib/r2/registry';

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

        // For ROM-type apps, also fetch branch info
        let branches: Array<{ name: string; version?: string; buildDate?: string; size?: number; commitMessage?: string }> | undefined;
        if (entry.fileType === 'rom') {
          const branchNames = await listBranches(entry.slug);
          branches = await Promise.all(
            branchNames.map(async (name) => {
              const branchMeta = await getBranchMetadata(entry.slug, name);
              return {
                name,
                version: branchMeta?.version,
                buildDate: branchMeta?.buildDate,
                size: branchMeta?.size,
                commitMessage: branchMeta?.commitMessage,
              };
            }),
          );
          // Sort by buildDate descending (most recently updated first)
          branches.sort((a, b) => {
            const da = a.buildDate ? new Date(a.buildDate).getTime() : 0;
            const db = b.buildDate ? new Date(b.buildDate).getTime() : 0;
            return db - da;
          });
        }

        return { ...entry, latest: metadata, buildStatus, ...(branches && { branches }) };
      }),
    );
    return NextResponse.json({ apps });
  } catch (err) {
    console.error('Mobile /api/mobile/apps error:', err);
    return NextResponse.json({ error: 'Failed to list apps' }, { status: 500 });
  }
}
