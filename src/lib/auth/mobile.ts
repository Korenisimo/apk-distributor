import { timingSafeEqual } from "crypto";

/**
 * Validate the Bearer token from an Authorization header.
 * Used by /api/mobile/* routes (excluded from NextAuth middleware).
 */
export function validateMobileToken(authHeader: string | null): boolean {
  const expected = process.env.MOBILE_API_KEY ?? "";
  if (!expected) return false;

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) return false;

  const len = Math.max(token.length, expected.length);
  const bufA = Buffer.alloc(len);
  const bufB = Buffer.alloc(len);
  bufA.write(token);
  bufB.write(expected);
  return timingSafeEqual(bufA, bufB) && token.length === expected.length;
}
