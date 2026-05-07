import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { useGoogleAuth } from './src/auth/useGoogleAuth';

export default function App() {
  const auth = useGoogleAuth();

  return (
    <>
      <StatusBar style="light" />
      {auth.isSignedIn ? (
        <HomeScreen idToken={auth.idToken!} user={auth.user!} onSignOut={auth.signOut} />
      ) : (
        <LoginScreen auth={auth} />
      )}
    </>
  );
}
