import { NextResponse, type NextRequest } from "next/server";
import { validateMobileToken } from "@/lib/auth/mobile";
import { getR2Client, getR2Bucket } from "@/lib/r2/client";
import { getR2SignedUrl } from "@/lib/r2/signed-url";
import { getAppMetadata } from "@/lib/r2/registry";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * GET /api/mobile/download/[slug]
 * Mobile app endpoint — authenticated via Bearer token (MOBILE_API_KEY).
 * Returns a signed R2 download URL (JSON, not redirect — easier for mobile).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!validateMobileToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  if (!SAFE_SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const apkKey = `apps/${slug}/latest.apk`;

  try {
    // Verify APK exists
    try {
      await getR2Client().send(
        new GetObjectCommand({
          Bucket: getR2Bucket(),
          Key: apkKey,
          Range: "bytes=0-0",
        })
      );
    } catch {
      return NextResponse.json({ error: "APK not found" }, { status: 404 });
    }

    const metadata = await getAppMetadata(slug);
    const version = metadata?.version || "unknown";
    const appName = (metadata?.name || slug).replace(/[^a-zA-Z0-9_-]/g, "-");
    const downloadFilename = `${appName}-v${version}.apk`;

    // Return JSON with the signed URL (mobile downloads it directly)
    const signedUrl = await getR2SignedUrl(apkKey, 600, downloadFilename);
    return NextResponse.json({ url: signedUrl, filename: downloadFilename });
  } catch (err) {
    console.error(`Mobile download failed for ${slug}:`, err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
