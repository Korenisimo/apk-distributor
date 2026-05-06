import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getRegistry, getAppMetadata } from "@/lib/r2/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/apps
 * List all registered apps with their latest metadata.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const registry = await getRegistry();

    const apps = await Promise.all(
      registry.map(async (entry) => {
        const metadata = await getAppMetadata(entry.slug);
        return { ...entry, latest: metadata };
      })
    );

    return NextResponse.json({ apps });
  } catch (err) {
    console.error("Failed to list apps:", err);
    return NextResponse.json(
      { error: "Failed to list apps" },
      { status: 500 }
    );
  }
}
