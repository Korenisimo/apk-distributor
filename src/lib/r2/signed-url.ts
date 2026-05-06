import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Client, getR2Bucket } from "./client";

/**
 * Generate a time-limited signed download URL for an R2 object.
 * Default expiry: 1 hour.
 */
export async function getR2SignedUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
  });
  return getSignedUrl(getR2Client(), command, {
    expiresIn: expiresInSeconds,
  });
}
