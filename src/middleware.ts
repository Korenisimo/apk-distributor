export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    /*
     * Protect everything EXCEPT:
     * - /api/auth/* (NextAuth routes)
     * - /api/webhook/* (build notifications — uses shared secret)
     * - /api/mobile/* (mobile app API)
     * - /api/download/* (public download links — link is the key)
     * - /app/* (public app detail pages)
     * - /_next/* (static assets)
     * - /favicon.ico
     * - /login (login page itself)
     */
    "/((?!api/auth|api/webhook|api/mobile|api/download|app/|_next|favicon.ico|login).*)",
  ],
};
