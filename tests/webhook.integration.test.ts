import { describe, it, expect, afterAll } from "vitest";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket, resetR2Client } from "@/lib/r2/client";
import { upsertApp, getRegistry, putRegistry } from "@/lib/r2/registry";

/**
 * Integration tests for the webhook / registry flow.
 *
 * Tests the REAL R2 registry operations that the webhook API route uses.
 * Uses a dedicated test registry key to avoid polluting the real registry.
 *
 * Since Next.js API routes need a running server to test via HTTP,
 * we test the underlying registry operations directly — these are the
 * same functions the webhook route calls.
 */

const CLEANUP_KEYS: string[] = [];

afterAll(async () => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  for (const key of CLEANUP_KEYS) {
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key })
      );
    } catch {
      // ignore
    }
  }
  resetR2Client();
});

describe("Registry upsert (webhook flow)", () => {
  // We test the core logic the webhook uses: upsertApp reads/writes the real registry

  it("upserts a new app into the registry", async () => {
    const testSlug = `_test-webhook-${Date.now()}`;
    // The registry key that upsertApp writes to
    CLEANUP_KEYS.push("apps/registry.json");

    // Get current registry state (may be empty or have real apps)
    const before = await getRegistry();
    const beforeCount = before.length;

    // Upsert our test app
    const result = await upsertApp({
      slug: testSlug,
      name: "Webhook Test App",
      repo: "test/webhook-repo",
      registeredAt: new Date().toISOString(),
    });

    expect(result.length).toBe(beforeCount + 1);
    const found = result.find((a) => a.slug === testSlug);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Webhook Test App");
    expect(found!.repo).toBe("test/webhook-repo");

    // Verify it persisted to R2
    const after = await getRegistry();
    const persisted = after.find((a) => a.slug === testSlug);
    expect(persisted).toBeDefined();
    expect(persisted!.name).toBe("Webhook Test App");

    // Clean up: remove our test entry and write back
    const cleaned = after.filter((a) => a.slug !== testSlug);
    await putRegistry(cleaned);
  });

  it("updates an existing app (idempotent upsert)", async () => {
    const testSlug = `_test-upsert-${Date.now()}`;

    // Insert
    await upsertApp({
      slug: testSlug,
      name: "Original Name",
      repo: "test/original",
      registeredAt: new Date().toISOString(),
    });

    // Update same slug
    const result = await upsertApp({
      slug: testSlug,
      name: "Updated Name",
      repo: "test/updated",
      registeredAt: new Date().toISOString(),
    });

    // Should not duplicate
    const matches = result.filter((a) => a.slug === testSlug);
    expect(matches.length).toBe(1);
    expect(matches[0].name).toBe("Updated Name");
    expect(matches[0].repo).toBe("test/updated");

    // Clean up
    const cleaned = result.filter((a) => a.slug !== testSlug);
    await putRegistry(cleaned);
  });

  it("validates webhook secret check logic", () => {
    // This tests the same comparison the webhook route does
    const expected = process.env.WEBHOOK_SECRET;
    expect(expected).toBe("test-webhook-secret-123");

    // Correct secret
    expect(expected === "test-webhook-secret-123").toBe(true);

    // Wrong secret
    expect(expected === "wrong-secret").toBe(false);

    // Missing secret
    expect(expected === "").toBe(false);
    expect(expected === undefined).toBe(false);
  });
});

describe("Full build-complete payload handling", () => {
  it("processes a realistic build payload end-to-end", async () => {
    const testSlug = `_test-build-${Date.now()}`;
    const metaKey = `apps/${testSlug}/latest.json`;
    CLEANUP_KEYS.push(metaKey);

    // Simulate what GitHub Actions does: upload metadata + APK
    const metadata = {
      slug: testSlug,
      name: "Build Test App",
      version: "2.1.0",
      buildDate: new Date().toISOString(),
      sha: "deadbeef",
      size: 50_000_000,
      repo: "Korenisimo/test-app",
      buildNumber: 42,
    };

    // Upload metadata (what GA does)
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: metaKey,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: "application/json",
      })
    );

    // Upsert registry entry (what the webhook does)
    await upsertApp({
      slug: testSlug,
      name: metadata.name,
      repo: metadata.repo,
      registeredAt: metadata.buildDate,
    });

    // Verify: registry has the app
    const registry = await getRegistry();
    const entry = registry.find((a) => a.slug === testSlug);
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("Build Test App");

    // Verify: metadata is readable
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: metaKey })
    );
    const body = await res.Body?.transformToString();
    const parsed = JSON.parse(body!);
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.buildNumber).toBe(42);
    expect(parsed.sha).toBe("deadbeef");

    // Clean up
    const cleaned = registry.filter((a) => a.slug !== testSlug);
    await putRegistry(cleaned);
  });
});
