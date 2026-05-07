/**
 * Verify a Google ID token using Google's tokeninfo endpoint.
 * Returns the user's email and name if valid, or null otherwise.
 */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<{ email: string; name: string } | null> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) return null;
    const payload = await res.json();

    // Verify the audience matches our client ID (web or Android)
    const validAuds = [
      process.env.GOOGLE_CLIENT_ID, // web client ID
      process.env.GOOGLE_ANDROID_CLIENT_ID, // android client ID (if set separately)
    ].filter(Boolean);

    if (!validAuds.includes(payload.aud)) return null;
    if (!payload.email || payload.email_verified !== "true") return null;

    return { email: payload.email, name: payload.name || "" };
  } catch {
    return null;
  }
}
