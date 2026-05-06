import { NextResponse, type NextRequest } from "next/server";
import { validateMobileToken } from "@/lib/auth/mobile";
import { getRegistry, getAppMetadata, getBuildStatus } from "@/lib/r2/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/apps
 * Mobile app endpoint — authenticated via Bearer token (MOBILE_API_KEY).
 * Returns all apps with metadata and build status.
 */
export async function GET(request: NextRequest) {
  if (!validateMobileToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      })
    );

    return NextResponse.json({ apps });
  } catch (err) {
    console.error("Mobile /api/mobile/apps error:", err);
    return NextResponse.json({ error: "Failed to list apps" }, { status: 500 });
  }
}
