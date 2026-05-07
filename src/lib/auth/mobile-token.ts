/**
 * Stateless signed tokens for native app auth.
 * Uses HMAC-SHA256 with NEXTAUTH_SECRET — no DB needed.
 * Token format: base64url(payload).base64url(signature)
 */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function getKey(usage: 'sign' | 'verify') {
  const secret = process.env.NEXTAUTH_SECRET!;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signMobileToken(email: string): Promise<string> {
  const payload = JSON.stringify({ email, exp: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  const key = await getKey('sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = Buffer.from(sig).toString('base64url');
  return `${payloadB64}.${sigB64}`;
}

export async function verifyMobileToken(token: string): Promise<{ email: string } | null> {
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;

    const key = await getKey('verify');
    const sig = Buffer.from(sigB64, 'base64url');
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(payloadB64));
    if (!valid) return null;

    const { email, exp } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (Date.now() > exp) return null;

    return { email };
  } catch {
    return null;
  }
}
