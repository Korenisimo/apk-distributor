import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { AuthState } from '../auth/useAuth';

export function LoginScreen({ auth }: { auth: AuthState }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>APK Distributor</Text>
      <Text style={styles.subtitle}>Internal app distribution</Text>

      {auth.error ? (
        <Text style={styles.error}>{auth.error}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.button, auth.isSigningIn && styles.buttonDisabled]}
        onPress={auth.signIn}
        disabled={auth.isSigningIn}
      >
        {auth.isSigningIn ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign in with Google</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    marginBottom: 48,
  },
  error: {
    color: '#f87171',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 220,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
