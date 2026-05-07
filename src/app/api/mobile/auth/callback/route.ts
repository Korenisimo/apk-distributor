import { NextRequest, NextResponse } from 'next/server';
import { signMobileToken } from '@/lib/auth/mobile-token';

const APP_SCHEME = 'apk-distributor';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${APP_SCHEME}://auth/callback?error=oauth_failed`);
  }

  try {
    const baseUrl = process.env.NEXTAUTH_URL ?? 'https://apk-distributor.vercel.app';
    const redirectUri = `${baseUrl}/api/mobile/auth/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access token from Google');

    // Get user email
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userRes.json();
    const email: string = user.email;

    // Check against allowed emails
    const allowed = (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!allowed.includes(email.toLowerCase())) {
      return NextResponse.redirect(`${APP_SCHEME}://auth/callback?error=not_authorized`);
    }

    // Issue a signed token valid for 30 days
    const token = await signMobileToken(email);
    return NextResponse.redirect(`${APP_SCHEME}://auth/callback?token=${token}`);
  } catch (err) {
    console.error('[mobile/auth/callback]', err);
    return NextResponse.redirect(`${APP_SCHEME}://auth/callback?error=server_error`);
  }
}
