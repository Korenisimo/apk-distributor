import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { upsertApp, type AppRegistryEntry } from "@/lib/r2/registry";

// ---------------------------------------------------------------------------
// Fix 6 — Simple in-memory rate limiting per IP (max 10 requests / minute)
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// ---------------------------------------------------------------------------
// Fix 3 — Slug validation (only alphanumeric, hyphens, underscores)
// ---------------------------------------------------------------------------
const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * POST /api/webhook/build-complete
 *
 * Receives build notifications from GitHub Actions.
 * Validates shared secret via X-Webhook-Secret header.
 * Upserts the app into the registry.
 */
export async function POST(request: NextRequest) {
  // --- Rate limiting (Fix 6) ---
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  // --- Timing-safe secret comparison (Fix 1) ---
  const secret = request.headers.get("x-webhook-secret") ?? "";
  const expected = process.env.WEBHOOK_SECRET ?? "";

  if (!expected || !safeCompare(secret, expected)) {
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

    // --- Slug path-traversal guard (Fix 3) ---
    if (!SAFE_SLUG_RE.test(app.slug)) {
      return NextResponse.json(
        { error: "Invalid slug: only alphanumeric, hyphens, and underscores allowed" },
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

/**
 * Constant-time string comparison.
 * Pads both values to the same length so even the buffer-length
 * is not leaked via timing.
 */
function safeCompare(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  const bufA = Buffer.alloc(len);
  const bufB = Buffer.alloc(len);
  bufA.write(a);
  bufB.write(b);
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}
