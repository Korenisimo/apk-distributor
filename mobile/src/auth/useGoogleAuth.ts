import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useState, useEffect } from "react";

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID =
  "1011334268673-vr2l7tj2mb6r0odgvus6k0o3oc749kh6.apps.googleusercontent.com";

export interface AuthState {
  isSignedIn: boolean;
  isLoading: boolean;
  idToken: string | null;
  user: { email: string; name: string } | null;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
}

export function useGoogleAuth(): AuthState {
  const [idToken, setIdToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ email: string; name: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_CLIENT_ID,
  });

  // Effect syncs external OAuth response into component state — setState is intentional here.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (response?.type === "success") {
      const token = response.params.id_token;
      setIdToken(token);
      // Decode the JWT payload (base64) to get user info
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUser({ email: payload.email, name: payload.name || "" });
        setError(null);
      } catch {
        setError("Failed to parse token");
      }
    } else if (response?.type === "error") {
      setError(response.error?.message || "Sign-in failed");
    }
  }, [response]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    isSignedIn: !!idToken,
    isLoading: !request,
    idToken,
    user,
    error,
    signIn: () => promptAsync(),
    signOut: () => {
      setIdToken(null);
      setUser(null);
    },
  };
}
