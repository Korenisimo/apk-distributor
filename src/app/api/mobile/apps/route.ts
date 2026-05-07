import { NextResponse, type NextRequest } from "next/server";
import { validateMobileToken } from "@/lib/auth/mobile";
import { verifyGoogleIdToken } from "@/lib/auth/google-token";
import { isEmailAllowed } from "@/lib/auth/whitelist";
import { getRegistry, getAppMetadata, getBuildStatus } from "@/lib/r2/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/mobile/apps
 * Mobile app endpoint — authenticated via Bearer token (MOBILE_API_KEY)
 * and Google ID token (email whitelist).
 * Returns all apps with metadata and build status.
 */
export async function GET(request: NextRequest) {
  if (!validateMobileToken(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idToken = request.headers.get("x-google-id-token");
  if (!idToken) {
    return NextResponse.json(
      { error: "Google authentication required" },
      { status: 401 }
    );
  }

  const googleUser = await verifyGoogleIdToken(idToken);
  if (!googleUser) {
    return NextResponse.json(
      { error: "Invalid Google token" },
      { status: 401 }
    );
  }

  if (!isEmailAllowed(googleUser.email)) {
    return NextResponse.json(
      { error: "Email not authorized" },
      { status: 403 }
    );
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
