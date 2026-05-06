import { describe, it, expect, afterAll } from "vitest";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2Bucket, resetR2Client } from "@/lib/r2/client";
import { getR2SignedUrl } from "@/lib/r2/signed-url";
import {
  getRegistry,
  putRegistry,
  upsertApp,
  getAppMetadata,
  listUploadedApps,
  type AppRegistryEntry,
  type AppMetadata,
} from "@/lib/r2/registry";

/**
 * Integration tests for R2 storage operations.
 *
 * These tests hit REAL Cloudflare R2 using credentials from .env.test.
 * All test data is written under the `apps/_test-run/` prefix and cleaned up after.
 */

const TEST_SLUG = `_test-run-${Date.now()}`;
const TEST_PREFIX = `apps/${TEST_SLUG}/`;
const TEST_REGISTRY_KEY = `apps/_test-registry-${Date.now()}.json`;

// Track all keys we create so we can clean up
const createdKeys: string[] = [];

afterAll(async () => {
  // Clean up all test objects from R2
  const client = getR2Client();
  const bucket = getR2Bucket();

  for (const key of createdKeys) {
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key })
      );
    } catch {
      // Ignore cleanup errors
    }
  }
  resetR2Client();
});

describe("R2 Client", () => {
  it("creates a valid S3Client pointing at R2", () => {
    const client = getR2Client();
    expect(client).toBeInstanceOf(S3Client);
  });

  it("returns the configured bucket name", () => {
    const bucket = getR2Bucket();
    expect(bucket).toBe("hod-travel-journal");
  });
});

describe("R2 Upload / Download / Delete", () => {
  const testKey = `${TEST_PREFIX}test-file.txt`;
  const testContent = `Integration test content — ${new Date().toISOString()}`;

  it("uploads a file to R2", async () => {
    createdKeys.push(testKey);

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: testKey,
        Body: testContent,
        ContentType: "text/plain",
      })
    );

    // Verify by downloading
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: testKey })
    );
    const body = await res.Body?.transformToString();
    expect(body).toBe(testContent);
  });

  it("generates a valid signed download URL", async () => {
    const url = await getR2SignedUrl(testKey, 60);
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain(getR2Bucket());

    // Actually fetch the signed URL to verify it works
    const res = await fetch(url);
    expect(res.ok).toBe(true);
    const body = await res.text();
    expect(body).toBe(testContent);
  });

  it("uploads and downloads a binary (simulated APK)", async () => {
    const apkKey = `${TEST_PREFIX}latest.apk`;
    createdKeys.push(apkKey);

    // Create a small fake APK (just bytes)
    const fakeApk = Buffer.from("PK\x03\x04" + "x".repeat(1000)); // ZIP magic + filler

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: apkKey,
        Body: fakeApk,
        ContentType: "application/vnd.android.package-archive",
      })
    );

    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: apkKey })
    );
    const downloaded = await res.Body?.transformToByteArray();
    expect(downloaded).toBeDefined();
    expect(Buffer.from(downloaded!).length).toBe(fakeApk.length);
    expect(Buffer.from(downloaded!).toString("hex")).toBe(
      fakeApk.toString("hex")
    );
  });

  it("lists objects under a prefix", async () => {
    const res = await getR2Client().send(
      new ListObjectsV2Command({
        Bucket: getR2Bucket(),
        Prefix: TEST_PREFIX,
      })
    );
    expect(res.Contents).toBeDefined();
    expect(res.Contents!.length).toBeGreaterThanOrEqual(2); // test-file.txt + latest.apk
    const keys = res.Contents!.map((c) => c.Key);
    expect(keys).toContain(`${TEST_PREFIX}test-file.txt`);
    expect(keys).toContain(`${TEST_PREFIX}latest.apk`);
  });

  it("deletes a file from R2", async () => {
    const deleteKey = `${TEST_PREFIX}to-delete.txt`;
    createdKeys.push(deleteKey);

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: deleteKey,
        Body: "delete me",
        ContentType: "text/plain",
      })
    );

    // Verify it exists
    const before = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: deleteKey })
    );
    expect(before.Body).toBeDefined();

    // Delete
    await getR2Client().send(
      new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: deleteKey })
    );

    // Verify it's gone
    try {
      await getR2Client().send(
        new GetObjectCommand({ Bucket: getR2Bucket(), Key: deleteKey })
      );
      expect.fail("Should have thrown NoSuchKey");
    } catch (err: unknown) {
      if (err && typeof err === "object" && "name" in err) {
        expect(err.name).toBe("NoSuchKey");
      }
    }
  });
});

describe("Registry Operations", () => {
  // We override REGISTRY_KEY behavior by writing/reading our own test registry
  // These tests exercise the actual R2 read/write patterns used by the registry module

  it("writes and reads JSON metadata", async () => {
    const metaKey = `${TEST_PREFIX}latest.json`;
    createdKeys.push(metaKey);

    const metadata: AppMetadata = {
      slug: TEST_SLUG,
      name: "Test App",
      version: "1.0.0",
      buildDate: new Date().toISOString(),
      sha: "abc123",
      size: 1004,
      repo: "test/repo",
      buildNumber: 1,
    };

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: metaKey,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: "application/json",
      })
    );

    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: metaKey })
    );
    const body = await res.Body?.transformToString();
    const parsed = JSON.parse(body!);

    expect(parsed.slug).toBe(TEST_SLUG);
    expect(parsed.name).toBe("Test App");
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.size).toBe(1004);
    expect(parsed.repo).toBe("test/repo");
  });

  it("getAppMetadata reads metadata for the test slug", async () => {
    // This depends on the metadata we wrote in the previous test
    const meta = await getAppMetadata(TEST_SLUG);
    expect(meta).not.toBeNull();
    expect(meta!.slug).toBe(TEST_SLUG);
    expect(meta!.name).toBe("Test App");
    expect(meta!.version).toBe("1.0.0");
  });

  it("getAppMetadata returns null for non-existent app", async () => {
    const meta = await getAppMetadata("this-app-does-not-exist-ever");
    expect(meta).toBeNull();
  });

  it("listUploadedApps includes the test slug", async () => {
    const slugs = await listUploadedApps();
    expect(slugs).toContain(TEST_SLUG);
  });
});
