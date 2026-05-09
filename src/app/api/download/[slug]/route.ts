import { NextResponse, type NextRequest } from "next/server";
import { getR2Client, getR2Bucket } from "@/lib/r2/client";
import { getR2SignedUrl } from "@/lib/r2/signed-url";
import { getAppMetadata } from "@/lib/r2/registry";
import { GetObjectCommand } from "@aws-sdk/client-s3";

// Fix 2 — Slug validation (only alphanumeric, hyphens, underscores)
const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * GET /api/download/[slug]
 *
 * ?info=true  → returns JSON metadata for the app
 * default     → 302 redirect to a signed R2 download URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // --- Slug path-traversal guard (Fix 2) ---
  if (!SAFE_SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "Invalid slug: only alphanumeric, hyphens, and underscores allowed" },
      { status: 400 }
    );
  }

  const apkKey = `apps/${slug}/latest.apk`;

  try {
    // Info mode — return metadata only
    if (request.nextUrl.searchParams.get("info") === "true") {
      const metadata = await getAppMetadata(slug);
      if (!metadata) {
        return NextResponse.json({ error: "App not found" }, { status: 404 });
      }
      return NextResponse.json(metadata);
    }

    // Verify APK exists before generating signed URL
    try {
      await getR2Client().send(
        new GetObjectCommand({
          Bucket: getR2Bucket(),
          Key: apkKey,
          Range: "bytes=0-0", // HEAD-like check
        })
      );
    } catch {
      return NextResponse.json(
        { error: "APK not found for this app" },
        { status: 404 }
      );
    }

    // Fetch metadata to build a proper download filename
    const metadata = await getAppMetadata(slug);
    const version = metadata?.version || "unknown";
    const appName = (metadata?.name || slug).replace(/[^a-zA-Z0-9_-]/g, "-");
    const downloadFilename = `${appName}-v${version}.apk`;

    const signedUrl = await getR2SignedUrl(apkKey, 300, downloadFilename);
    return NextResponse.redirect(signedUrl, 302);
  } catch (err) {
    console.error(`Download failed for ${slug}:`, err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
