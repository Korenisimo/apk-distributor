import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { useAuth } from './src/auth/useAuth';
import { View, ActivityIndicator } from 'react-native';

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
