import { useState, useEffect, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

const BASE_URL = process.env.EXPO_PUBLIC_DISTRIBUTOR_URL ?? 'https://apk-distributor.vercel.app';
const TOKEN_KEY = 'apk_distributor_token';
const EMAIL_KEY = 'apk_distributor_email';

export interface AuthState {
  isSignedIn: boolean;
  isLoading: boolean;
  isSigningIn: boolean;
  token: string | null;
  email: string | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Decode email from our HMAC token payload (base64url-encoded JSON) */
function emailFromToken(token: string): string {
  try {
    const payloadB64 = token.split('.')[0];
    // base64url → base64 → decode
    const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64); // atob is available in React Native (Hermes)
    const { email } = JSON.parse(json);
    return email ?? '';
  } catch {
    return '';
  }
}

export function useAuth(): AuthState {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem(TOKEN_KEY);
        if (storedToken) {
          const storedEmail = (await AsyncStorage.getItem(EMAIL_KEY)) || emailFromToken(storedToken);
          setToken(storedToken);
          setEmail(storedEmail || 'signed in');
        }
      } catch {
        // AsyncStorage read failed — treat as not signed in
      }
      setIsLoading(false);
    })();
  }, []);

  const signIn = useCallback(async () => {
    setIsSigningIn(true);
    setError(null);
    try {
      const redirectUrl = Linking.createURL('auth/callback');
      const result = await WebBrowser.openAuthSessionAsync(
        `${BASE_URL}/api/mobile/auth/google`,
        redirectUrl,
      );

      if (result.type !== 'success') {
        setIsSigningIn(false);
        return;
      }

      const url = new URL(result.url);
      const returnedError = url.searchParams.get('error');
      const returnedToken = url.searchParams.get('token');
      const returnedEmail = url.searchParams.get('email');

      if (returnedError === 'not_authorized') {
        setError('Your email is not authorized to access this app.');
      } else if (returnedError) {
        setError('Sign-in failed. Please try again.');
      } else if (returnedToken) {
        // Derive email: prefer URL param, then decode from token
        const parsedEmail = returnedEmail || emailFromToken(returnedToken) || 'signed in';

        await AsyncStorage.setItem(TOKEN_KEY, returnedToken);
        await AsyncStorage.setItem(EMAIL_KEY, parsedEmail);
        setToken(returnedToken);
        setEmail(parsedEmail);
      }
    } catch (e) {
      setError('Sign-in failed. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, EMAIL_KEY]);
    setToken(null);
    setEmail(null);
  }, []);

  return {
    isSignedIn: !!token,
    isLoading,
    isSigningIn,
    token,
    email,
    error,
    signIn,
    signOut,
  };
}
