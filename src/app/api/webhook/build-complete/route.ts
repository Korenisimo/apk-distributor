import { NextResponse, type NextRequest } from "next/server";
import { upsertApp, type AppRegistryEntry } from "@/lib/r2/registry";

/**
 * POST /api/webhook/build-complete
 *
 * Receives build notifications from GitHub Actions.
 * Validates shared secret via X-Webhook-Secret header.
 * Upserts the app into the registry.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.WEBHOOK_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { event, app } = body;

    if (event !== "build_complete" || !app?.slug) {
      return NextResponse.json(
        { error: "Invalid payload: expected event=build_complete with app.slug" },
        { status: 400 }
      );
    }

    const entry: AppRegistryEntry = {
      slug: app.slug,
      name: app.name ?? app.slug,
      repo: app.repo ?? "unknown",
      registeredAt: new Date().toISOString(),
    };

    await upsertApp(entry);

    return NextResponse.json({ ok: true, slug: app.slug });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
