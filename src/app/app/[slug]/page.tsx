"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

interface AppMetadata {
  slug: string;
  name: string;
  version: string;
  buildDate: string;
  sha: string;
  size: number;
  repo: string;
  buildNumber: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AppDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [meta, setMeta] = useState<AppMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/download/${slug}?info=true`)
      .then((r) => {
        if (!r.ok) throw new Error("App not found");
        return r.json();
      })
      .then((data) => {
        setMeta(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-4">
            {error ?? "App not found"}
          </p>
          <Link href="/" className="text-blue-500 hover:underline">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const downloadUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/download/${slug}`
      : "";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-lg mx-auto px-4 py-12">
        <Link
          href="/"
          className="text-sm text-blue-500 hover:underline mb-6 inline-block"
        >
          ← Back to dashboard
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {meta.name}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            {meta.repo}
          </p>

          <div className="space-y-4 mb-8">
            <InfoRow label="Version" value={meta.version} mono />
            <InfoRow label="Build Number" value={`#${meta.buildNumber}`} mono />
            <InfoRow label="Size" value={formatBytes(meta.size)} />
            <InfoRow label="Built" value={formatDate(meta.buildDate)} />
            <InfoRow label="Commit" value={meta.sha.slice(0, 8)} mono />
          </div>

          <a
            href={`/api/download/${slug}`}
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl text-center transition-colors text-lg"
          >
            ⬇ Download APK
          </a>

          {/* QR code for mobile — rendered client-side, no external service (Fix 4) */}
          {downloadUrl && (
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-400 mb-2">
                Scan to download on phone
              </p>
              <QRCodeSVG
                value={downloadUrl}
                size={150}
                className="mx-auto rounded-lg"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-500 dark:text-gray-400 text-sm">{label}</span>
      <span
        className={`text-gray-900 dark:text-white text-sm ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
