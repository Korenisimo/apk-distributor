import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { fetchApps, fetchDownloadUrl, type AppInfo } from '../api';

type DownloadState =
  | { status: 'idle' }
  | { status: 'downloading'; progress: number }
  | { status: 'installing' }
  | { status: 'done' };

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function BuildBadge({ buildStatus }: { buildStatus: AppInfo['buildStatus'] }) {
  if (!buildStatus || buildStatus.status === 'success') return null;

  if (buildStatus.status === 'building') {
    return (
      <View style={[styles.badge, styles.badgeBuilding]}>
        <ActivityIndicator size="small" color="#60a5fa" style={{ marginRight: 6 }} />
        <Text style={styles.badgeBuildingText}>
          Building… run #{buildStatus.runNumber}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.badgeFailed]}>
      <Text style={styles.badgeFailedText}>
        ❌ Build failed{buildStatus.failedStep && buildStatus.failedStep !== 'unknown'
          ? ` at: ${buildStatus.failedStep}`
          : ''}
      </Text>
    </View>
  );
}

function AppCard({ app, token }: { app: AppInfo; token: string }) {
  const [dlState, setDlState] = useState<DownloadState>({ status: 'idle' });

  const handleInstall = useCallback(async () => {
    if (dlState.status !== 'idle') return;

    const localPath = `${(FileSystem as any).cacheDirectory ?? ""}${app.slug}-latest.apk`;

    try {
      // 1. Get signed download URL
      setDlState({ status: 'downloading', progress: 0 });
      const url = await fetchDownloadUrl(app.slug, token);

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
        }
      );

      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) throw new Error('Download failed — no URI returned');

      // 3. Launch Android package installer
      setDlState({ status: 'installing' });
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });

      setDlState({ status: 'done' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert('Install failed', msg);
      setDlState({ status: 'idle' });
    } finally {
      // Clean up APK file regardless of outcome
      FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
    }
  }, [app.slug, dlState.status]);

  const resetState = useCallback(() => setDlState({ status: 'idle' }), []);

  const isBuilding = app.buildStatus?.status === 'building';
  const hasFailed = app.buildStatus?.status === 'failed';
  const hasApk = !!app.latest;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <Text style={styles.appIcon}>📦</Text>
        <View style={styles.cardHeaderText}>
          <Text style={styles.appName}>{app.name}</Text>
          <Text style={styles.appRepo}>{app.repo}</Text>
        </View>
      </View>

      {/* Build status badge */}
      <BuildBadge buildStatus={app.buildStatus} />

      {/* Metadata */}
      {hasApk && (
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Version</Text>
            <Text style={styles.metaValue}>{app.latest!.version}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Size</Text>
            <Text style={styles.metaValue}>{formatBytes(app.latest!.size)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Build</Text>
            <Text style={styles.metaValue}>#{app.latest!.buildNumber}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Built</Text>
            <Text style={styles.metaValue}>{formatDate(app.latest!.buildDate)}</Text>
          </View>
        </View>
      )}

      {/* Action button */}
      {hasApk && !isBuilding && (
        <>
          {dlState.status === 'idle' && (
            <Pressable style={styles.btn} onPress={handleInstall}>
              <Text style={styles.btnText}>⬇ Download & Install</Text>
            </Pressable>
          )}

          {dlState.status === 'downloading' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round(dlState.progress * 100)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                Downloading… {Math.round(dlState.progress * 100)}%
              </Text>
            </View>
          )}

          {dlState.status === 'installing' && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#60a5fa" />
              <Text style={styles.statusText}>Waiting for installer…</Text>
            </View>
          )}

          {dlState.status === 'done' && (
            <Pressable style={[styles.btn, styles.btnDone]} onPress={resetState}>
              <Text style={styles.btnText}>✓ Done — tap to reset</Text>
            </Pressable>
          )}
        </>
      )}

      {!hasApk && !isBuilding && !hasFailed && (
        <Text style={styles.noBuild}>No build yet</Text>
      )}
    </View>
  );
}

export function HomeScreen({ token, email, onSignOut }: { token: string; email: string; onSignOut: () => void }) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await fetchApps(token);
      setApps(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load apps');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📦 APK Distributor</Text>
        <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>{email}</Text>
        <Pressable onPress={onSignOut} style={{ position: 'absolute', right: 20, top: 56 }}><Text style={{ color: '#60a5fa', fontSize: 13 }}>Sign out</Text></Pressable>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading apps…</Text>
        </View>
      )}

      {error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.btn} onPress={() => load()}>
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && (
        <FlatList
          data={apps}
          keyExtractor={(a) => a.slug}
          renderItem={({ item }) => <AppCard app={item} token={token} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#60a5fa"
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No apps registered yet.</Text>
          }
        />
      )}
    </View>
  );
}

const BG = '#0f0c29';
const CARD = '#1a1740';
const ACCENT = '#60a5fa';
const TEXT = '#f1f5f9';
const MUTED = '#94a3b8';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff18',
  },
  title: { fontSize: 22, fontWeight: '700', color: TEXT },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  loadingText: { color: MUTED, marginTop: 8 },
  errorText: { color: '#f87171', textAlign: 'center', marginBottom: 8 },
  emptyText: { color: MUTED, textAlign: 'center', marginTop: 40 },
  list: { padding: 16, gap: 14 },

  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#ffffff12',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardHeaderText: { flex: 1 },
  appIcon: { fontSize: 32 },
  appName: { fontSize: 17, fontWeight: '600', color: TEXT },
  appRepo: { fontSize: 12, color: MUTED, marginTop: 2 },

  badge: { borderRadius: 8, padding: 10, flexDirection: 'row', alignItems: 'center' },
  badgeBuilding: { backgroundColor: '#1e3a5f' },
  badgeBuildingText: { color: ACCENT, fontSize: 13 },
  badgeFailed: { backgroundColor: '#3b1a1a' },
  badgeFailedText: { color: '#f87171', fontSize: 13 },

  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaItem: { flex: 1, minWidth: '45%' },
  metaLabel: { fontSize: 11, color: MUTED, marginBottom: 2 },
  metaValue: { fontSize: 13, color: TEXT, fontVariant: ['tabular-nums'] },

  btn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnDone: { backgroundColor: '#16a34a' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  progressContainer: { gap: 6 },
  progressTrack: {
    height: 6,
    backgroundColor: '#ffffff20',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 3 },
  progressText: { color: MUTED, fontSize: 12, textAlign: 'center' },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  statusText: { color: MUTED, fontSize: 13 },

  noBuild: { color: MUTED, fontSize: 13, textAlign: 'center' },
});
