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

export function useAuth(): AuthState {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore session on mount
  useEffect(() => {
    (async () => {
      const [storedToken, storedEmail] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(EMAIL_KEY),
      ]);
      if (storedToken && storedEmail) {
        setToken(storedToken);
        setEmail(storedEmail);
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
        // Decode email from token payload (first segment is base64url JSON)
        let parsedEmail = returnedEmail ?? '';
        if (!parsedEmail) {
          try {
            const payload = JSON.parse(
              Buffer.from(returnedToken.split('.')[0], 'base64').toString(),
            );
            parsedEmail = payload.email ?? '';
          } catch {}
        }
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
