import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
  AppState,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { fetchApps, fetchDownloadUrl, AppInfo } from '../api';

const BG = '#0f172a';
const CARD = '#1e293b';
const ACCENT = '#3b82f6';
const SUCCESS = '#22c55e';
const WARN = '#f59e0b';
const DANGER = '#ef4444';
const MUTED = '#94a3b8';
const WHITE = '#f8fafc';

// Android intent flags
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const FLAG_ACTIVITY_NEW_TASK        = 0x10000000;

type DownloadState =
  | { status: 'idle' }
  | { status: 'downloading'; progress: number }
  | { status: 'installing' }
  | { status: 'done' };

function BuildBadge({ buildStatus }: { buildStatus: AppInfo['buildStatus'] }) {
  if (!buildStatus || buildStatus.status === 'success') return null;

  if (buildStatus.status === 'building') {
    return (
      <View style={[styles.badge, { backgroundColor: WARN }]}>
        <Text style={styles.badgeText}>Building #{buildStatus.runNumber}</Text>
      </View>
    );
  }
  if (buildStatus.status === 'failed') {
    return (
      <View style={[styles.badge, { backgroundColor: DANGER }]}>
        <Text style={styles.badgeText}>Build failed</Text>
      </View>
    );
  }
  return null;
}

function AppCard({ app, token }: { app: AppInfo; token: string }) {
  const [dlState, setDlState] = useState<DownloadState>({ status: 'idle' });

  // When the Android installer opens, the app goes to background.
  // startActivityAsync with FLAG_ACTIVITY_NEW_TASK may never resolve because
  // the intent result isn't delivered across task boundaries.
  // Fix: listen for foreground return and auto-reset the state.
  useEffect(() => {
    if (dlState.status !== 'installing') return;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        // User returned from installer — reset to done briefly, then idle
        setDlState({ status: 'done' });
      }
    });
    return () => sub.remove();
  }, [dlState.status]);

  const handleInstall = useCallback(async () => {
    if (dlState.status !== 'idle') return;

    const localPath = `${FileSystem.cacheDirectory ?? ''}${app.slug}-latest.apk`;

    try {
      // 1. Get signed download URL
      setDlState({ status: 'downloading', progress: 0 });
      const { url } = await fetchDownloadUrl(app.slug, token);

      // 2. Download with progress
      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        localPath,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          const progress = totalBytesExpectedToWrite > 0
            ? totalBytesWritten / totalBytesExpectedToWrite
            : 0;
          setDlState({ status: 'downloading', progress });
        },
      );

      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) throw new Error('Download failed — no URI returned');

      // 3. Launch Android package installer — do NOT await
      // startActivityAsync may never resolve with FLAG_ACTIVITY_NEW_TASK
      setDlState({ status: 'installing' });
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
        type: 'application/vnd.android.package-archive',
      }).catch(() => {}); // fire-and-forget — AppState listener handles the reset

      // Clean up APK after a delay (installer copies it before installing)
      setTimeout(() => {
        FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
      }, 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Install failed', msg);
      setDlState({ status: 'idle' });
    }
  }, [app.slug, dlState.status, token]);

  const resetState = useCallback(() => setDlState({ status: 'idle' }), []);

  const isBuilding = app.buildStatus?.status === 'building';
  const hasFailed = app.buildStatus?.status === 'failed';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.appName}>{app.name ?? app.slug}</Text>
        <BuildBadge buildStatus={app.buildStatus} />
      </View>

      <Text style={styles.repo}>{app.repo}</Text>

      {app.latest && (
        <View style={styles.metaGrid}>
          <MetaItem label="Version" value={`${app.latest.version}`} />
          <MetaItem label="Build" value={`#${app.latest.buildNumber}`} />
          <MetaItem label="Size" value={formatBytes(app.latest.size)} />
          <MetaItem label="Built" value={formatDate(app.latest.buildDate)} />
        </View>
      )}

      {/* Action area */}
      <View style={styles.actionRow}>
        {dlState.status === 'idle' && (
          <TouchableOpacity
            style={[styles.btn, (isBuilding || hasFailed || !app.latest) && styles.btnDisabled]}
            onPress={handleInstall}
            disabled={isBuilding || hasFailed || !app.latest}
          >
            <Text style={styles.btnText}>⬇ Download & Install</Text>
          </TouchableOpacity>
        )}

        {dlState.status === 'downloading' && (
          <View style={styles.progressWrap}>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${Math.round(dlState.progress * 100)}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{Math.round(dlState.progress * 100)}%</Text>
          </View>
        )}

        {dlState.status === 'installing' && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={ACCENT} size="small" />
            <Text style={styles.statusText}>Waiting for installer…</Text>
          </View>
        )}

        {dlState.status === 'done' && (
          <TouchableOpacity style={[styles.btn, { backgroundColor: SUCCESS }]} onPress={resetState}>
            <Text style={styles.btnText}>✓ Installed — tap to reset</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function HomeScreen({
  token, email, onSignOut,
}: {
  token: string;
  email: string;
  onSignOut: () => void;
}) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await fetchApps(token);
      setApps(data);
    } catch (err: any) {
      if (err?.message === 'NOT_AUTHORIZED') {
        onSignOut();
      } else {
        setError('Failed to load apps. Pull down to retry.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, onSignOut]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>APK Distributor</Text>
        <TouchableOpacity onPress={onSignOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        >
          {apps.map(app => (
            <AppCard key={app.slug} app={app} token={token} />
          ))}
          {apps.length === 0 && (
            <Text style={[styles.errorText, { textAlign: 'center' }]}>No apps registered yet.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#334155',
  },
  headerTitle: { color: WHITE, fontSize: 20, fontWeight: '700' },
  signOut: { color: ACCENT, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: MUTED, fontSize: 14 },
  list: { padding: 16, gap: 16 },
  card: {
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  appName: { color: WHITE, fontSize: 18, fontWeight: '700', flex: 1 },
  repo: { color: MUTED, fontSize: 12, marginBottom: 16 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  metaItem: { minWidth: '40%' },
  metaLabel: { color: MUTED, fontSize: 11, marginBottom: 2 },
  metaValue: { color: WHITE, fontSize: 14, fontWeight: '500' },
  actionRow: { alignItems: 'stretch' },
  btn: {
    backgroundColor: ACCENT, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  progressWrap: { gap: 8 },
  progressBg: { height: 8, backgroundColor: '#334155', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 4 },
  progressLabel: { color: MUTED, fontSize: 12, textAlign: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  statusText: { color: MUTED, fontSize: 13 },
});
