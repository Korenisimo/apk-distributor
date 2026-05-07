import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { useAuth } from './src/auth/useAuth';
import { View, ActivityIndicator } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

// Lock to portrait on startup
ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});

export default function App() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator color="#3b82f6" size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {auth.isSignedIn ? (
        <HomeScreen token={auth.token!} email={auth.email!} onSignOut={auth.signOut} />
      ) : (
        <LoginScreen auth={auth} />
      )}
    </>
  );
}
