import {
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket } from "./client";

export interface AppRegistryEntry {
  slug: string;
  name: string;
  repo: string;
  description?: string;
  icon?: string;
  registeredAt: string;
  fileType?: "apk" | "rom";
}

export interface AppMetadata {
  slug: string;
  name: string;
  version: string;
  buildDate: string;
  sha: string;
  size: number;
  repo: string;
  buildNumber: number;
}

export interface BuildStatus {
  status: "building" | "success" | "failed";
  sha: string;
  runId: number;
  runNumber: number;
  ref: string;
  triggeredBy: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failedStep?: string;
  actionsUrl?: string;
  repo: string;
}

export interface BranchMetadata {
  branchName: string;
  version?: string;
  buildDate?: string;
  size?: number;
  commitMessage?: string;
}

const REGISTRY_KEY = "apps/registry.json";

/** Read the master app registry from R2. Returns empty array if not found. */
export async function getRegistry(): Promise<AppRegistryEntry[]> {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({ Bucket: getR2Bucket(), Key: REGISTRY_KEY })
    );
    const body = await res.Body?.transformToString();
    if (!body) return [];
    const data = JSON.parse(body);
    return data.apps ?? [];
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "NoSuchKey") return [];
    throw err;
  }
}

/** Write the master app registry to R2. */
export async function putRegistry(apps: AppRegistryEntry[]): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: REGISTRY_KEY,
      Body: JSON.stringify({ apps }, null, 2),
      ContentType: "application/json",
    })
  );
}

/** Register a new app or update an existing one. */
export async function upsertApp(
  entry: AppRegistryEntry
): Promise<AppRegistryEntry[]> {
  const apps = await getRegistry();
  const idx = apps.findIndex((a) => a.slug === entry.slug);
  if (idx >= 0) {
    apps[idx] = { ...apps[idx], ...entry };
  } else {
    apps.push(entry);
  }
  await putRegistry(apps);
  return apps;
}

/** Get the latest.json metadata for a specific app. Returns null if not found. */
export async function getAppMetadata(
  slug: string
): Promise<AppMetadata | null> {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: `apps/${slug}/latest.json`,
      })
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "NoSuchKey") return null;
    throw err;
  }
}

/** Get the build status for a specific app. Returns null if not found. */
export async function getBuildStatus(
  slug: string
): Promise<BuildStatus | null> {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: `apps/${slug}/build-status.json`,
      })
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "name" in err && err.name === "NoSuchKey") return null;
    throw err;
  }
}

/** Write the build status for a specific app. */
export async function putBuildStatus(
  slug: string,
  buildStatus: BuildStatus
): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: `apps/${slug}/build-status.json`,
      Body: JSON.stringify(buildStatus, null, 2),
      ContentType: "application/json",
    })
  );
}

/** List all app slugs that have APK files uploaded. */
export async function listUploadedApps(): Promise<string[]> {
  const res = await getR2Client().send(
    new ListObjectsV2Command({
      Bucket: getR2Bucket(),
      Prefix: "apps/",
      Delimiter: "/",
    })
  );
  return (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix?.replace("apps/", "").replace("/", "") ?? "")
    .filter(Boolean);
}

/** List branch names for a ROM-type app by scanning R2 prefix. */
export async function listBranches(slug: string): Promise<string[]> {
  const prefix = `apps/${slug}/branches/`;
  const res = await getR2Client().send(
    new ListObjectsV2Command({
      Bucket: getR2Bucket(),
      Prefix: prefix,
      Delimiter: "/",
    })
  );
  return (res.CommonPrefixes ?? [])
    .map((p) => p.Prefix?.replace(prefix, "").replace(/\/$/, "") ?? "")
    .filter(Boolean);
}

/** Get metadata for a specific branch of a ROM app. Returns null if not found. */
export async function getBranchMetadata(
  slug: string,
  branch: string
): Promise<BranchMetadata | null> {
  try {
    const res = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getR2Bucket(),
        Key: `apps/${slug}/branches/${branch}/latest.json`,
      })
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      err.name === "NoSuchKey"
    )
      return null;
    throw err;
  }
}

/** Upload a ROM file and metadata for a specific branch. */
export async function putBranchFile(
  slug: string,
  branch: string,
  fileBuffer: Buffer,
  metadata: BranchMetadata
): Promise<void> {
  const prefix = `apps/${slug}/branches/${branch}`;
  const client = getR2Client();
  const bucket = getR2Bucket();

  await Promise.all([
    client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}/latest.gba`,
        Body: fileBuffer,
        ContentType: "application/octet-stream",
      })
    ),
    client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}/latest.json`,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: "application/json",
      })
    ),
  ]);
}
