"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface BuildStatus {
  status: "building" | "success" | "failed";
  sha: string;
  runId: number;
  runNumber: number;
  ref: string;
  triggeredBy: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failedStep?: string;
  actionsUrl?: string;
  repo: string;
}

interface AppInfo {
  slug: string;
  name: string;
  repo: string;
  description?: string;
  icon?: string;
  registeredAt: string;
  latest: {
    version: string;
    buildDate: string;
    sha: string;
    size: number;
    buildNumber: number;
  } | null;
  buildStatus: BuildStatus | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BuildStatusBadge({ buildStatus }: { buildStatus: BuildStatus | null }) {
  if (!buildStatus) return null;

  switch (buildStatus.status) {
    case "building":
      return (
        <div className="text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span className="font-medium">Building…</span>
          </div>
          <p className="text-xs mt-1 opacity-70">
            Run #{buildStatus.runNumber} • {buildStatus.ref} • {buildStatus.sha?.slice(0, 7)}
            {buildStatus.startedAt && ` • started ${formatDate(buildStatus.startedAt)}`}
          </p>
          {buildStatus.actionsUrl && (
            <a
              href={buildStatus.actionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline mt-1 inline-block"
            >
              View in GitHub Actions →
            </a>
          )}
        </div>
      );
    case "failed":
      return (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span>❌</span>
            <span className="font-medium">Build Failed</span>
          </div>
          <p className="text-xs mt-1 opacity-70">
            Run #{buildStatus.runNumber} • {buildStatus.ref} • {buildStatus.sha?.slice(0, 7)}
            {buildStatus.failedStep && buildStatus.failedStep !== "unknown" && ` • failed at: ${buildStatus.failedStep}`}
            {buildStatus.failedAt && ` • ${formatDate(buildStatus.failedAt)}`}
          </p>
          {buildStatus.actionsUrl && (
            <a
              href={buildStatus.actionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline mt-1 inline-block"
            >
              View logs in GitHub Actions →
            </a>
          )}
        </div>
      );
    default:
      return null; // "success" — don't show badge, the download button is enough
  }
}

function AppCard({ app }: { app: AppInfo }) {
  const icon = app.icon ?? "📦";
  const hasBuilt = !!app.latest;
  const isBuilding = app.buildStatus?.status === "building";
  const hasFailed = app.buildStatus?.status === "failed";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 p-6 flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <span className="text-4xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {app.name}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {app.repo}
          </p>
          {app.description && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {app.description}
            </p>
          )}
        </div>
      </div>

      {/* Build status banner (building or failed) */}
      {(isBuilding || hasFailed) && (
        <BuildStatusBadge buildStatus={app.buildStatus} />
      )}

      {hasBuilt ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Version</span>
              <p className="font-mono text-gray-900 dark:text-white">
                {app.latest!.version}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Size</span>
              <p className="font-mono text-gray-900 dark:text-white">
                {formatBytes(app.latest!.size)}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Build</span>
              <p className="font-mono text-gray-900 dark:text-white">
                #{app.latest!.buildNumber}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Built</span>
              <p className="text-gray-900 dark:text-white text-xs">
                {formatDate(app.latest!.buildDate)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/download/${app.slug}`}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-center transition-colors"
            >
              ⬇ Download APK
            </a>
            <Link
              href={`/app/${app.slug}`}
              className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium py-2.5 px-4 rounded-lg transition-colors"
            >
              Details
            </Link>
          </div>
        </>
      ) : !isBuilding && !hasFailed ? (
        <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          ⏳ Registered but no build yet. Push to main to trigger the first
          build.
        </div>
      ) : null}
    </div>
  );
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/apps")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setApps(data.apps ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [status]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              📦 APK Distributor
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {session?.user?.email}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading apps…</div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">Error: {error}</div>
        ) : apps.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">
              No apps registered yet
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-sm max-w-md mx-auto">
              Add the reusable GitHub Actions workflow to your app repo and push
              to main. Your app will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {apps.map((app) => (
              <AppCard key={app.slug} app={app} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
