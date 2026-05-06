export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    /*
     * Protect everything EXCEPT:
     * - /api/auth/* (NextAuth routes)
     * - /api/webhook/* (build notifications — uses shared secret)
     * - /_next/* (static assets)
     * - /favicon.ico
     * - /login (login page itself)
     */
    "/((?!api/auth|api/webhook|api/mobile|_next|favicon.ico|login).*)",
  ],
};
