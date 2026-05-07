const BASE_URL = process.env.EXPO_PUBLIC_DISTRIBUTOR_URL ?? 'https://apk-distributor.vercel.app';
const API_KEY = process.env.EXPO_PUBLIC_MOBILE_API_KEY ?? '';

const headers = (token: string) => ({
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
  'Authorization': `Bearer ${token}`,
});

export interface BranchInfo {
  name: string;
  version?: string;
  buildDate?: string;
  size?: number;
  commitMessage?: string;
}

export interface AppInfo {
  slug: string;
  name: string;
  repo: string;
  registeredAt: string;
  fileType?: 'apk' | 'rom';
  branches?: BranchInfo[];
  latest: {
    version: string;
    buildDate: string;
    sha: string;
    size: number;
    buildNumber: number;
  } | null;
  buildStatus: {
    status: 'building' | 'success' | 'failed';
    runNumber: number;
    ref: string;
    failedStep?: string;
    actionsUrl?: string;
  } | null;
}

export async function fetchApps(token: string): Promise<AppInfo[]> {
  const res = await fetch(`${BASE_URL}/api/mobile/apps`, { headers: headers(token) });
  if (res.status === 401) throw new Error('NOT_AUTHORIZED');
  if (!res.ok) throw new Error(`Failed to fetch apps: ${res.status}`);
  const data = await res.json();
  return data.apps;
}

export async function fetchDownloadUrl(
  slug: string,
  token: string,
  branch?: string,
): Promise<{ url: string; filename: string }> {
  const params = branch ? `?branch=${encodeURIComponent(branch)}` : '';
  const res = await fetch(`${BASE_URL}/api/mobile/download/${slug}${params}`, {
    headers: headers(token),
  });
  if (res.status === 401) throw new Error('NOT_AUTHORIZED');
  if (!res.ok) throw new Error(`Failed to get download URL: ${res.status}`);
  return res.json();
}
