import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isEmailAllowed } from "@/lib/auth/whitelist";

// Re-export for convenience
export { isEmailAllowed } from "@/lib/auth/whitelist";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized({ auth }) {
      return !!auth; // block if no session
    },
    async signIn({ user }) {
      if (!user.email) return false;
      return isEmailAllowed(user.email);
    },
    async session({ session }) {
      return session;
    },
  },
});
