import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Switch,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSimStore } from '@/store/useSimStore';
import { useActivityStore } from '@/store/useActivityStore';
import { useTransactionStore } from '@/store/useTransactionStore';
import { useAppSettingsStore } from '@/store/useAppSettingsStore';
import {
  startSmsListening,
  stopSmsListening,
  refreshSimSlots,
  requestSmsPermissions,
  requestCallPermission,
} from '@/services/smsAutomation';
import { startSchedulerLoop, stopSchedulerLoop } from '@/services/scheduler';
import { scanMissedMessages } from '@/services/missedMessages';
import UssdExecutor from '@/modules/ussd-executor/src/UssdExecutorModule';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function HomeScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();

  const { smsListening, tillSubscriptionId, availableSims } = useSimStore();
  const logs = useActivityStore((s) => s.logs);
  const clearLogs = useActivityStore((s) => s.clear);
  const { transactions } = useTransactionStore();
  const statsHidden = useAppSettingsStore((s) => s.statsHidden);
  const setStatsHidden = useAppSettingsStore((s) => s.setStatsHidden);

  const [a11yOk, setA11yOk] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const pendingCount = transactions.filter((t) => t.status === 'pending').length;
  const completedCount = transactions.filter((t) => t.status === 'completed').length;
  const failedCount = transactions.filter((t) => t.status === 'failed').length;

  const bootstrap = useCallback(async () => {
    refreshSimSlots();
    try {
      setA11yOk(UssdExecutor.isAccessibilityEnabled());
    } catch {
      setA11yOk(false);
    }

    // Purge old completed/failed orders if auto-delete is configured.
    // Pending orders are never touched, regardless of age.
    const { autoDeleteDays, setAutoDeleteLastRunAt } = useAppSettingsStore.getState();
    if (autoDeleteDays != null && autoDeleteDays > 0) {
      useTransactionStore.getState().purgeOlderThan(autoDeleteDays);
      setAutoDeleteLastRunAt(new Date().toISOString());
    }

    // Missed Messages — catch any Till-SIM SMS that arrived while the
    // app/process was killed and the live listener wasn't around to see it.
    scanMissedMessages().catch(() => {});
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // USSD Scheduler only fires while the app is open — start/stop the
  // polling loop with this screen's lifecycle.
  useEffect(() => {
    startSchedulerLoop();
    return () => stopSchedulerLoop();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await bootstrap();
    setRefreshing(false);
  };

  const toggleSms = async () => {
    if (smsListening) {
      stopSmsListening();
    } else {
      await startSmsListening();
    }
  };

  const ensurePermissions = async () => {
    await requestSmsPermissions();
    await requestCallPermission();
    try {
      if (!UssdExecutor.isAccessibilityEnabled()) {
        UssdExecutor.openAccessibilitySettings();
      }
      setA11yOk(UssdExecutor.isAccessibilityEnabled());
    } catch {
      // module may not be available on web/simulator
    }
    refreshSimSlots();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={[styles.brand, { color: c.tint }]}>Webazi</Text>
      <Text style={[styles.subtitle, { color: c.textSecondary }]}>
        USSD data delivery · auto-fulfillment
      </Text>

      {/* Status row */}
      <View style={styles.statusRow}>
        <StatusChip label="Accessibility" ok={a11yOk} colors={c} />
        <StatusChip label="SMS" ok={smsListening} colors={c} />
      </View>

      {/* Stats */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.logHeader}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Today&apos;s queue</Text>
          <Pressable onPress={() => setStatsHidden(!statsHidden)} hitSlop={8}>
            <IconSymbol
              name={statsHidden ? 'eye.slash.fill' : 'eye.fill'}
              size={18}
              color={c.textSecondary}
            />
          </Pressable>
        </View>
        <View style={styles.statsRow}>
          <Stat label="Pending" value={pendingCount} color={c.warning} hidden={statsHidden} />
          <Stat label="Done" value={completedCount} color={c.success} hidden={statsHidden} />
          <Stat label="Failed" value={failedCount} color={c.error} hidden={statsHidden} />
        </View>
      </View>

      {/* Controls */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Automation</Text>

        <Row
          label="SMS auto-dial"
          hint="Listen for M-Pesa SMS and fulfill instantly"
          value={smsListening}
          onToggle={toggleSms}
          colors={c}
        />
        <Pressable
          onPress={ensurePermissions}
          style={[styles.primaryBtn, { backgroundColor: c.tint }]}>
          <Text style={styles.primaryBtnText}>Grant permissions &amp; refresh SIMs</Text>
        </Pressable>

        {availableSims.length > 0 && (
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            SIMs: {availableSims.map((s) => s.carrierName || `slot ${s.slotIndex}`).join(', ')}{'\n'}
            Till SIM: {tillSubscriptionId != null ? `sub ${tillSubscriptionId}` : 'not set — open Settings'}
          </Text>
        )}
      </View>

      {/* Activity log */}
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.logHeader}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Activity</Text>
          <Pressable onPress={clearLogs}>
            <Text style={{ color: c.tint, fontSize: 13 }}>Clear</Text>
          </Pressable>
        </View>
        {logs.length === 0 ? (
          <Text style={[styles.hint, { color: c.muted }]}>No activity yet</Text>
        ) : (
          logs.slice(0, 30).map((entry) => (
            <Text
              key={entry.id}
              style={[
                styles.logLine,
                {
                  color:
                    entry.level === 'error'
                      ? c.error
                      : entry.level === 'warn'
                        ? c.warning
                        : entry.level === 'success'
                          ? c.success
                          : c.textSecondary,
                },
              ]}>
              {new Date(entry.timestamp).toLocaleTimeString()} · {entry.message}
            </Text>
          ))
        )}
      </View>

      {Platform.OS !== 'android' && (
        <Text style={[styles.hint, { color: c.warning, marginTop: 8 }]}>
          Native USSD / SMS modules require an Android device or emulator with a development build.
        </Text>
      )}
    </ScrollView>
  );
}

function StatusChip({
  label,
  ok,
  colors,
}: {
  label: string;
  ok: boolean | null;
  colors: (typeof Colors)['light'];
}) {
  const bg =
    ok === null ? colors.surfaceAlt : ok ? colors.surfaceAlt : '#FEECEC';
  const fg = ok === null ? colors.muted : ok ? colors.success : colors.error;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function Stat({
  label,
  value,
  color,
  hidden,
}: {
  label: string;
  value: number;
  color: string;
  hidden?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color }}>{hidden ? '•••' : value}</Text>
      <Text style={{ fontSize: 12, color: '#687076' }}>{label}</Text>
    </View>
  );
}

function Row({
  label,
  hint,
  value,
  onToggle,
  colors,
}: {
  label: string;
  hint: string;
  value: boolean;
  onToggle: () => void;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ true: colors.tint, false: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 14 },
  brand: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginBottom: 4 },
  statusRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 18 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logLine: { fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 16 },
});
