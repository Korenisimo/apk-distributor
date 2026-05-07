import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? '(not set)',
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? '(not set)',
  });
}
