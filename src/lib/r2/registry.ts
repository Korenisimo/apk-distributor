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
