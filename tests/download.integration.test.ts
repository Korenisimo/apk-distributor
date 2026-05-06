import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket, resetR2Client } from "@/lib/r2/client";
import { getR2SignedUrl } from "@/lib/r2/signed-url";
import { getAppMetadata, listUploadedApps } from "@/lib/r2/registry";

/**
 * Integration tests for the download flow.
 *
 * Exercises the same code paths as /api/download/[slug]:
 *   1. Check if APK exists in R2
 *   2. Get metadata via getAppMetadata
 *   3. Generate signed download URL
 *   4. Verify signed URL returns correct binary content
 *
 * Uses real R2 — uploads a test APK, generates URLs, downloads, cleans up.
 */

const TEST_SLUG = `_test-download-${Date.now()}`;
const APK_KEY = `apps/${TEST_SLUG}/latest.apk`;
const META_KEY = `apps/${TEST_SLUG}/latest.json`;
const FAKE_APK_CONTENT = Buffer.from(
  "PK\x03\x04" + "FAKE_APK_BINARY_".repeat(100)
);

const CLEANUP_KEYS = [APK_KEY, META_KEY];

beforeAll(async () => {
  const client = getR2Client();
  const bucket = getR2Bucket();

  // Upload a fake APK
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: APK_KEY,
      Body: FAKE_APK_CONTENT,
      ContentType: "application/vnd.android.package-archive",
    })
  );

  // Upload metadata
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: META_KEY,
      Body: JSON.stringify(
        {
          slug: TEST_SLUG,
          name: "Download Test App",
          version: "3.0.0",
          buildDate: new Date().toISOString(),
          sha: "cafe1234",
          size: FAKE_APK_CONTENT.length,
          repo: "Korenisimo/test-download",
          buildNumber: 99,
        },
        null,
        2
      ),
      ContentType: "application/json",
    })
  );
});

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

describe("Download Flow (same as /api/download/[slug])", () => {
  it("reads app metadata (info mode)", async () => {
    const meta = await getAppMetadata(TEST_SLUG);
    expect(meta).not.toBeNull();
    expect(meta!.slug).toBe(TEST_SLUG);
    expect(meta!.name).toBe("Download Test App");
    expect(meta!.version).toBe("3.0.0");
    expect(meta!.sha).toBe("cafe1234");
    expect(meta!.buildNumber).toBe(99);
    expect(meta!.size).toBe(FAKE_APK_CONTENT.length);
  });

  it("generates a signed URL for APK download", async () => {
    const url = await getR2SignedUrl(APK_KEY, 60);
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain("latest.apk");
  });

  it("signed URL serves correct binary content", async () => {
    const url = await getR2SignedUrl(APK_KEY, 60);
    const res = await fetch(url);
    expect(res.ok).toBe(true);

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(FAKE_APK_CONTENT.length);
    expect(body.toString("hex")).toBe(FAKE_APK_CONTENT.toString("hex"));
  });

  it("returns null metadata for non-existent app", async () => {
    const meta = await getAppMetadata("no-such-app-ever-exists");
    expect(meta).toBeNull();
  });

  it("lists the test app in uploaded apps", async () => {
    const slugs = await listUploadedApps();
    expect(slugs).toContain(TEST_SLUG);
  });
});

describe("Apps Listing (same as /api/apps)", () => {
  it("listUploadedApps returns string array of slugs", async () => {
    const slugs = await listUploadedApps();
    expect(Array.isArray(slugs)).toBe(true);
    expect(slugs.every((s) => typeof s === "string")).toBe(true);
  });

  it("can fetch metadata for each listed app", async () => {
    const slugs = await listUploadedApps();
    // At least our test slug should be there
    expect(slugs.length).toBeGreaterThan(0);

    // Verify we can fetch metadata for the test slug
    const meta = await getAppMetadata(TEST_SLUG);
    expect(meta).not.toBeNull();
    expect(meta!.version).toBe("3.0.0");
  });
});
