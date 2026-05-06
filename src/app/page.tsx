"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

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

function AppCard({ app }: { app: AppInfo }) {
  const icon = app.icon ?? "📦";
  const hasBuilt = !!app.latest;

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
      ) : (
        <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
          ⏳ Registered but no build yet. Push to main to trigger the first
          build.
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: session } = useSession();
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/apps")
      .then((r) => r.json())
      .then((data) => {
        setApps(data.apps ?? []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

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
            onClick={() => signOut()}
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
