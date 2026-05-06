import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getR2Client, getR2Bucket } from "@/lib/r2/client";
import { getR2SignedUrl } from "@/lib/r2/signed-url";
import { getAppMetadata } from "@/lib/r2/registry";
import { GetObjectCommand } from "@aws-sdk/client-s3";

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
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
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

    const signedUrl = await getR2SignedUrl(apkKey);
    return NextResponse.redirect(signedUrl, 302);
  } catch (err) {
    console.error(`Download failed for ${slug}:`, err);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
