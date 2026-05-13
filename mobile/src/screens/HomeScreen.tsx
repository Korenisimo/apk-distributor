import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl,
  AppState, Platform, Animated, Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { fetchApps, fetchDownloadUrl, AppInfo } from '../api';

const BG = '#0f172a';
const CARD = '#1e293b';
const CARD_BORDER = '#334155';
const ACCENT = '#3b82f6';
const SUCCESS = '#22c55e';
const WARN = '#f59e0b';
const DANGER = '#ef4444';
const MUTED = '#94a3b8';
const WHITE = '#f8fafc';

// Android intent flags
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;
const FLAG_ACTIVITY_NEW_TASK        = 0x10000000;

// Notification channel for download progress
const DOWNLOAD_CHANNEL_ID = 'apk-downloads';

// AsyncStorage key for Play Protect first-time alert
const PLAY_PROTECT_SHOWN_KEY = 'play_protect_shown';

// Deterministic color palette for avatars — seeded by slug
const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

function slugToColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Notification helpers ────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function setupNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(DOWNLOAD_CHANNEL_ID, {
    name: 'APK Downloads',
    importance: Notifications.AndroidImportance.LOW,
    showBadge: false,
    vibrationPattern: [],
  });
}

async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function showProgressNotification(
  notifId: string,
  appName: string,
  progress: number,
) {
  const pct = Math.round(progress * 100);
  await Notifications.scheduleNotificationAsync({
    identifier: notifId,
    content: {
      title: `Downloading ${appName}`,
      body: `${pct}%`,
      data: {},
      sticky: true,
      ...(Platform.OS === 'android' && {
        priority: Notifications.AndroidNotificationPriority.LOW,
      }),
    },
    trigger: null,
  });
}

async function dismissNotification(notifId: string) {
  await Notifications.dismissNotificationAsync(notifId).catch(() => {});
}

// ─── Types ───────────────────────────────────────────────────────────────────

type DownloadState =
  | { status: 'idle' }
  | { status: 'downloading'; progress: number }
  | { status: 'installing' }
  | { status: 'done' };

// ─── AppAvatar ───────────────────────────────────────────────────────────────

function AppAvatar({ name, slug }: { name: string; slug: string }) {
  const letter = (name || slug).charAt(0).toUpperCase();
  const bg = slugToColor(slug);
  return (
    <View style={[styles.avatar, { backgroundColor: bg }]}>
      <Text style={styles.avatarLetter}>{letter}</Text>
    </View>
  );
}

// ─── BuildBadge ──────────────────────────────────────────────────────────────

function BuildBadge({ buildStatus }: { buildStatus: AppInfo['buildStatus'] }) {
  if (!buildStatus || buildStatus.status === 'success') return null;

  const isBuilding = buildStatus.status === 'building';
  return (
    <View style={[styles.badge, { backgroundColor: isBuilding ? WARN : DANGER }]}>
      <Text style={styles.badgeText}>
        {isBuilding ? `Building #${buildStatus.runNumber}` : 'Build failed'}
      </Text>
    </View>
  );
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100);
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 300],
  });

  return (
    <View style={styles.progressBg}>
      <View style={[styles.progressFill, { width: `${pct}%` }]}>
        {/* Shimmer overlay */}
        <Animated.View
          style={[
            styles.progressShimmer,
            { transform: [{ translateX: shimmerTranslate }] },
          ]}
        />
      </View>
      <Text style={styles.progressPct}>{pct}%</Text>
    </View>
  );
}

// ─── AppCard ─────────────────────────────────────────────────────────────────

function AppCard({ app, token }: { app: AppInfo; token: string }) {
  const [dlState, setDlState] = useState<DownloadState>({ status: 'idle' });
  const notifId = `dl-${app.slug}`;
  const downloadRef = useRef<FileSystem.DownloadResumable | null>(null);
  const autoResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When installer opens, app goes to background. Listen for return.
  useEffect(() => {
    if (dlState.status !== 'installing') return;

    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setDlState({ status: 'done' });
      }
    });
    return () => sub.remove();
  }, [dlState.status]);

  // Auto-reset "done" state after 4 seconds
  useEffect(() => {
    if (dlState.status === 'done') {
      autoResetTimer.current = setTimeout(() => {
        setDlState({ status: 'idle' });
      }, 4000);
    }
    return () => {
      if (autoResetTimer.current) clearTimeout(autoResetTimer.current);
    };
  }, [dlState.status]);

  // Clean up notification on unmount
  useEffect(() => {
    return () => { dismissNotification(notifId); };
  }, [notifId]);

  const launchInstaller = useCallback(async (contentUri: string) => {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
        type: 'application/vnd.android.package-archive',
      });
    } catch {
      // AppState listener handles the reset
    }
  }, []);

  const handleInstall = useCallback(async () => {
    if (dlState.status !== 'idle') return;

    const appName = app.name ?? app.slug;
    const localPath = `${FileSystem.cacheDirectory ?? ''}${app.slug}-latest.apk`;

    const canNotify = await requestNotificationPermission();

    try {
      // 1. Get signed download URL
      setDlState({ status: 'downloading', progress: 0 });
      const { url } = await fetchDownloadUrl(app.slug, token);

      // 2. Download (foreground — BACKGROUND is iOS-only and corrupts files on Android)
      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        localPath,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          const progress = totalBytesExpectedToWrite > 0
            ? totalBytesWritten / totalBytesExpectedToWrite
            : 0;
          setDlState({ status: 'downloading', progress });
          if (canNotify) {
            showProgressNotification(notifId, appName, progress).catch(() => {});
          }
        },
      );

      downloadRef.current = downloadResumable;
      const result = await downloadResumable.downloadAsync();
      downloadRef.current = null;

      if (canNotify) await dismissNotification(notifId);
      if (!result?.uri) throw new Error('Download failed — no URI returned');

      // 3. Prepare installer
      setDlState({ status: 'installing' });
      const contentUri = await FileSystem.getContentUriAsync(result.uri);

      // Show Play Protect warning only once (first time ever)
      const alreadyShown = await AsyncStorage.getItem(PLAY_PROTECT_SHOWN_KEY);
      if (!alreadyShown) {
        await AsyncStorage.setItem(PLAY_PROTECT_SHOWN_KEY, 'true');
        Alert.alert(
          'Heads up',
          'Google Play Protect may show a warning because this app is sideloaded.\n\n'
          + 'If that happens, tap "More details" → "Install anyway".\n\n'
          + 'If you get "App not installed", uninstall the old version first (signatures may differ between builds).',
          [{ text: 'Got it', onPress: () => launchInstaller(contentUri) }],
          { cancelable: false },
        );
      } else {
        await launchInstaller(contentUri);
      }

      // Clean up APK after a delay
      setTimeout(() => {
        FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
      }, 10_000);

    } catch (err: unknown) {
      downloadRef.current = null;
      if (canNotify) await dismissNotification(notifId);
      const msg = err instanceof Error ? err.message : String(err);

      // Detect signature mismatch / "App not installed" scenario
      if (msg.toLowerCase().includes('not installed') || msg.toLowerCase().includes('conflict')) {
        Alert.alert(
          'Install failed — signature mismatch',
          `The installed version of "${appName}" was signed with a different key.\n\n`
          + 'Uninstall the old version first, then try again.',
          [{ text: 'OK' }],
        );
      } else {
        Alert.alert('Install failed', msg);
      }
      setDlState({ status: 'idle' });
    }
  }, [app.slug, app.name, dlState.status, token, notifId, launchInstaller]);

  const isBuilding = app.buildStatus?.status === 'building';
  const hasFailed  = app.buildStatus?.status === 'failed';
  const displayName = app.name ?? app.slug;

  return (
    <View style={styles.card}>
      {/* Card header with avatar */}
      <View style={styles.cardHeader}>
        <AppAvatar name={displayName} slug={app.slug} />
        <View style={styles.cardHeaderText}>
          <View style={styles.nameRow}>
            <Text style={styles.appName} numberOfLines={1}>{displayName}</Text>
            <BuildBadge buildStatus={app.buildStatus} />
          </View>
          <Text style={styles.repo} numberOfLines={1}>{app.repo}</Text>
        </View>
      </View>

      {/* Version metadata */}
      {app.latest && (
        <View style={styles.metaGrid}>
          <MetaItem label="Version" value={app.latest.version} />
          <MetaItem label="Build" value={`#${app.latest.buildNumber}`} />
          <MetaItem label="Size" value={formatBytes(app.latest.size)} />
          <MetaItem label="Built" value={formatDate(app.latest.buildDate)} />
        </View>
      )}

      {/* SHA chip */}
      {app.latest?.sha && (
        <View style={styles.shaRow}>
          <Text style={styles.shaLabel}>SHA</Text>
          <Text style={styles.shaValue}>{app.latest.sha.slice(0, 7)}</Text>
        </View>
      )}

      {/* Action area */}
      <View style={styles.actionRow}>
        {dlState.status === 'idle' && (
          <TouchableOpacity
            style={[styles.btn, (isBuilding || hasFailed || !app.latest) && styles.btnDisabled]}
            onPress={handleInstall}
            disabled={isBuilding || hasFailed || !app.latest}
            activeOpacity={0.7}
          >
            <Text style={styles.btnText}>Download & Install</Text>
          </TouchableOpacity>
        )}

        {dlState.status === 'downloading' && (
          <View style={styles.progressWrap}>
            <ProgressBar progress={dlState.progress} />
            <Text style={styles.progressLabel}>
              Downloading… {Math.round(dlState.progress * 100)}%
            </Text>
          </View>
        )}

        {dlState.status === 'installing' && (
          <View style={styles.statusRow}>
            <ActivityIndicator color={ACCENT} size="small" />
            <Text style={styles.statusText}>Opening installer…</Text>
          </View>
        )}

        {dlState.status === 'done' && (
          <View style={styles.doneRow}>
            <Text style={styles.doneIcon}>✓</Text>
            <Text style={styles.doneText}>Install complete</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── MetaItem ────────────────────────────────────────────────────────────────

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000)     return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── HomeScreen ──────────────────────────────────────────────────────────────

export function HomeScreen({
  token, email, onSignOut,
}: {
  token: string;
  email: string;
  onSignOut: () => void;
}) {
  const [apps, setApps]           = useState<AppInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => { setupNotificationChannel(); }, []);

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
        <View>
          <Text style={styles.headerTitle}>APK Distributor</Text>
          <Text style={styles.headerEmail}>{email}</Text>
        </View>
        <TouchableOpacity onPress={onSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={ACCENT}
              colors={[ACCENT]}
            />
          }
        >
          {apps.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No apps yet</Text>
              <Text style={styles.emptySubtitle}>
                Register an app on the web dashboard to see it here.
              </Text>
            </View>
          ) : (
            apps.map(app => (
              <AppCard key={app.slug} app={app} token={token} />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: CARD_BORDER,
  },
  headerTitle: { color: WHITE, fontSize: 20, fontWeight: '700' },
  headerEmail: { color: MUTED, fontSize: 12, marginTop: 2 },
  signOutBtn: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1, borderColor: CARD_BORDER,
  },
  signOut: { color: MUTED, fontSize: 13, fontWeight: '500' },

  // Layout
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { padding: 16, gap: 16, paddingBottom: 32 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 64 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: WHITE, fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { color: MUTED, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText: { color: MUTED, fontSize: 14, textAlign: 'center', marginTop: 12 },

  // Card
  card: {
    backgroundColor: CARD, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: CARD_BORDER,
    // Subtle elevation on Android
    ...Platform.select({
      android: { elevation: 4 },
      ios: {
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15, shadowRadius: 8,
      },
    }),
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 16,
  },
  cardHeaderText: { flex: 1, marginLeft: 12 },
  nameRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  appName: { color: WHITE, fontSize: 17, fontWeight: '700', flex: 1 },
  repo: { color: MUTED, fontSize: 12, marginTop: 2 },

  // Avatar
  avatar: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 20, fontWeight: '700' },

  // Badge
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // Meta grid
  metaGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12,
  },
  metaItem: { minWidth: '40%' },
  metaLabel: { color: MUTED, fontSize: 11, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { color: WHITE, fontSize: 14, fontWeight: '500' },

  // SHA chip
  shaRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 16,
  },
  shaLabel: {
    color: MUTED, fontSize: 10, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginRight: 6,
  },
  shaValue: {
    color: MUTED, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: '#0f172a', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, overflow: 'hidden',
  },

  // Action row
  actionRow: { marginTop: 4 },
  btn: {
    backgroundColor: ACCENT, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.35 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Progress bar
  progressWrap: { gap: 8 },
  progressBg: {
    height: 28, backgroundColor: '#334155', borderRadius: 14,
    overflow: 'hidden', justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: ACCENT, borderRadius: 14,
    overflow: 'hidden',
  },
  progressShimmer: {
    position: 'absolute', top: 0, bottom: 0, width: 120,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
  },
  progressPct: {
    color: '#fff', fontSize: 12, fontWeight: '700',
    textAlign: 'center', zIndex: 1,
  },
  progressLabel: { color: MUTED, fontSize: 12, textAlign: 'center' },

  // Status / done
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 14 },
  statusText: { color: MUTED, fontSize: 13 },

  doneRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 12,
  },
  doneIcon: { color: SUCCESS, fontSize: 18, fontWeight: '700', marginRight: 8 },
  doneText: { color: SUCCESS, fontSize: 15, fontWeight: '600' },
});
