import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { upsertApp, putBuildStatus, type AppRegistryEntry, type BuildStatus } from "@/lib/r2/registry";

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
 *
 * Events:
 * - build_started:  Build kicked off → status = "building"
 * - build_complete: APK uploaded     → status = "success"
 * - build_failed:   Build errored    → status = "failed"
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

    if (!app?.slug) {
      return NextResponse.json(
        { error: "Invalid payload: missing app.slug" },
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

    const actionsUrl = app.actionsUrl ??
      (app.repo && app.runId
        ? `https://github.com/${app.repo}/actions/runs/${app.runId}`
        : undefined);

    // --- Handle different event types ---
    switch (event) {
      case "build_started": {
        // Ensure app is in registry
        const entry: AppRegistryEntry = {
          slug: app.slug,
          name: app.name ?? app.slug,
          repo: app.repo ?? "unknown",
          registeredAt: new Date().toISOString(),
        };
        await upsertApp(entry);

        // Write build status
        const buildStatus: BuildStatus = {
          status: "building",
          sha: app.sha ?? "",
          runId: app.runId ?? 0,
          runNumber: app.runNumber ?? 0,
          ref: app.ref ?? "main",
          triggeredBy: app.triggeredBy ?? "unknown",
          startedAt: app.startedAt ?? new Date().toISOString(),
          repo: app.repo ?? "unknown",
          actionsUrl,
        };
        await putBuildStatus(app.slug, buildStatus);

        return NextResponse.json({ ok: true, slug: app.slug, status: "building" });
      }

      case "build_complete": {
        const entry: AppRegistryEntry = {
          slug: app.slug,
          name: app.name ?? app.slug,
          repo: app.repo ?? "unknown",
          registeredAt: new Date().toISOString(),
        };
        await upsertApp(entry);

        // Update build status to success
        const buildStatus: BuildStatus = {
          status: "success",
          sha: app.sha ?? "",
          runId: app.runId ?? 0,
          runNumber: app.runNumber ?? parseInt(app.buildNumber, 10) ?? 0,
          ref: app.ref ?? "main",
          triggeredBy: app.triggeredBy ?? "unknown",
          completedAt: app.buildDate ?? new Date().toISOString(),
          repo: app.repo ?? "unknown",
          actionsUrl,
        };
        await putBuildStatus(app.slug, buildStatus);

        return NextResponse.json({ ok: true, slug: app.slug, status: "success" });
      }

      case "build_failed": {
        // Ensure app is in registry
        const entry: AppRegistryEntry = {
          slug: app.slug,
          name: app.name ?? app.slug,
          repo: app.repo ?? "unknown",
          registeredAt: new Date().toISOString(),
        };
        await upsertApp(entry);

        // Write build status as failed
        const buildStatus: BuildStatus = {
          status: "failed",
          sha: app.sha ?? "",
          runId: app.runId ?? 0,
          runNumber: app.runNumber ?? 0,
          ref: app.ref ?? "main",
          triggeredBy: app.triggeredBy ?? "unknown",
          failedAt: app.failedAt ?? new Date().toISOString(),
          failedStep: app.failedStep ?? "unknown",
          repo: app.repo ?? "unknown",
          actionsUrl,
        };
        await putBuildStatus(app.slug, buildStatus);

        return NextResponse.json({ ok: true, slug: app.slug, status: "failed" });
      }

      default:
        return NextResponse.json(
          { error: `Unknown event type: ${event}` },
          { status: 400 }
        );
    }
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
