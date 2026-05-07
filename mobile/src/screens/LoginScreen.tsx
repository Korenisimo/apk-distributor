import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { AuthState } from '../auth/useGoogleAuth';

interface Props {
  auth: AuthState;
}

export function LoginScreen({ auth }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>📦</Text>
        <Text style={styles.title}>APK Distributor</Text>
        <Text style={styles.subtitle}>Sign in to access your apps</Text>

        {auth.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{auth.error}</Text>
          </View>
        )}

        {auth.isLoading ? (
          <ActivityIndicator size="large" color="#60a5fa" />
        ) : (
          <TouchableOpacity style={styles.button} onPress={auth.signIn}>
            <Text style={styles.buttonText}>Sign in with Google</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', padding: 32 },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#94a3b8', marginBottom: 32 },
  errorBox: { backgroundColor: '#7f1d1d', borderRadius: 8, padding: 12, marginBottom: 16, maxWidth: 300 },
  errorText: { color: '#fca5a5', fontSize: 14, textAlign: 'center' },
  button: { backgroundColor: '#3b82f6', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
