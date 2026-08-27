import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSimStore } from '@/store/useSimStore';
import { useTransactionStore } from '@/store/useTransactionStore';
import type { LocalTransaction } from '@/store/useTransactionStore';
import { useUnmatchedStore } from '@/store/useUnmatchedStore';
import type { UnmatchedSms } from '@/store/useUnmatchedStore';
import { retryDelivery, manualDeliver } from '@/services/smsAutomation';
import { openWhatsAppChat } from '@/services/whatsapp';
import { Link } from 'expo-router';

type Network = 'safaricom' | 'airtel';
type StatusFilter = 'all' | 'pending' | 'completed' | 'failed';

const NETWORKS: { key: Network; label: string; refPrefix: string }[] = [
  { key: 'safaricom', label: 'Safaricom', refPrefix: 'S-' },
  { key: 'airtel', label: 'Airtel', refPrefix: 'A-' },
];

const STATUS_FILTERS: StatusFilter[] = ['all', 'pending', 'completed', 'failed'];

export default function AirtimeManagerScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [network, setNetwork] = useState<Network>('safaricom');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [showUnmatched, setShowUnmatched] = useState(false);

  const {
    availableSims,
    safaricomExecutionSubscriptionId,
    airtelExecutionSubscriptionId,
    setSafaricomExecutionSim,
    setAirtelExecutionSim,
  } = useSimStore();

  const transactions = useTransactionStore((s) => s.transactions);
  const deleteTransaction = useTransactionStore((s) => s.deleteTransaction);
  const unmatched = useUnmatchedStore((s) => s.items);
  const dismissUnmatched = useUnmatchedStore((s) => s.remove);

  const networkTxns = useMemo(
    () => transactions.filter((t) => t.network === network),
    [transactions, network]
  );

  const counts = useMemo(
    () => ({
      all: networkTxns.length,
      pending: networkTxns.filter((t) => t.status === 'pending').length,
      completed: networkTxns.filter((t) => t.status === 'completed').length,
      failed: networkTxns.filter((t) => t.status === 'failed').length,
    }),
    [networkTxns]
  );

  const visibleTxns = useMemo(() => {
    let data = statusFilter === 'all' ? networkTxns : networkTxns.filter((t) => t.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      data = data.filter(
        (t) =>
          t.phone.toLowerCase().includes(q) ||
          t.ref.toLowerCase().includes(q) ||
          (t.receipt ?? '').toLowerCase().includes(q)
      );
    }
    return data;
  }, [networkTxns, statusFilter, search]);

  const executionSubId = network === 'safaricom' ? safaricomExecutionSubscriptionId : airtelExecutionSubscriptionId;
  const setExecutionSim = network === 'safaricom' ? setSafaricomExecutionSim : setAirtelExecutionSim;
  const activeNetwork = NETWORKS.find((n) => n.key === network)!;

  const handleDelete = (txn: LocalTransaction) => {
    Alert.alert('Delete order?', `KES ${txn.amount} to ${txn.phone} (${txn.ref})`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(txn.id) },
    ]);
  };

  const handleShare = (txn: LocalTransaction) => {
    Share.share({
      message: `Webazi order ${txn.ref} · KES ${txn.amount} · ${txn.phone} · ${txn.status}`,
    }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + 8 }}>
      <Text style={[styles.title, { color: c.text, paddingHorizontal: 16 }]}>Airtime Manager</Text>

      {/* Network sub-tabs */}
      <View style={styles.subTabs}>
        {NETWORKS.map((n) => {
          const selected = network === n.key;
          return (
            <Pressable
              key={n.key}
              onPress={() => setNetwork(n.key)}
              style={[
                styles.subTabBtn,
                { backgroundColor: selected ? c.tint : c.surface, borderColor: c.border },
              ]}>
              <Text style={{ color: selected ? '#fff' : c.textSecondary, fontWeight: '700' }}>
                {n.label}
              </Text>
              <Text style={{ color: selected ? '#fff' : c.muted, fontSize: 11 }}>
                ref {n.refPrefix}…
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visibleTxns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text style={[styles.cardTitle, { color: c.text }]}>
                {activeNetwork.label} execution SIM
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>
                Orders with ref prefix "{activeNetwork.refPrefix}" dial delivery USSD from this SIM.
              </Text>
              {availableSims.length === 0 && (
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  No SIMs detected — refresh from Settings first.
                </Text>
              )}
              {availableSims.map((sim) => {
                const selected = executionSubId === sim.subscriptionId;
                return (
                  <Pressable
                    key={sim.subscriptionId}
                    onPress={() => setExecutionSim(sim.subscriptionId)}
                    style={[
                      styles.simRow,
                      {
                        borderColor: selected ? c.tint : c.border,
                        backgroundColor: selected ? c.surfaceAlt : c.background,
                      },
                    ]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>
                        {sim.carrierName || sim.displayName || `SIM ${sim.slotIndex}`}
                      </Text>
                      <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                        slot {sim.slotIndex} · sub {sim.subscriptionId}
                        {sim.number ? ` · ${sim.number}` : ''}
                      </Text>
                    </View>
                    {selected && <Text style={{ color: c.tint, fontWeight: '700' }}>✓</Text>}
                  </Pressable>
                );
              })}
              {executionSubId == null && availableSims.length > 0 && (
                <Text style={{ color: c.warning, fontSize: 12 }}>
                  No SIM selected — {activeNetwork.label} orders won't dial until you pick one.
                </Text>
              )}
            </View>

            {/* Search */}
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search phone / ref / receipt…"
              placeholderTextColor={c.muted}
              autoCapitalize="none"
              style={[
                styles.input,
                { backgroundColor: c.surface, borderColor: c.border, color: c.text },
              ]}
            />

            {/* Status filter chips with counts */}
            <View style={styles.filters}>
              {STATUS_FILTERS.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setStatusFilter(f)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: statusFilter === f ? c.tint : c.surface,
                      borderColor: c.border,
                    },
                  ]}>
                  <Text
                    style={{
                      color: statusFilter === f ? '#fff' : c.textSecondary,
                      fontSize: 12,
                      fontWeight: '600',
                      textTransform: 'capitalize',
                    }}>
                    {f} ({counts[f]})
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Manual delivery */}
            <Pressable
              onPress={() => setShowManual((v) => !v)}
              style={[styles.outlineBtn, { borderColor: c.border }]}>
              <Text style={{ color: c.tint, fontWeight: '600' }}>
                {showManual ? 'Hide manual delivery' : '+ Manual delivery'}
              </Text>
            </Pressable>
            {showManual && (
              <ManualDeliveryForm network={network} executionSubId={executionSubId} colors={c} />
            )}

            <Link href="/ussd-scheduler" asChild>
              <Pressable style={[styles.outlineBtn, { borderColor: c.border }]}>
                <Text style={{ color: c.tint, fontWeight: '600' }}>USSD Scheduler</Text>
              </Pressable>
            </Link>

            {/* Unmatched SMS */}
            <Pressable
              onPress={() => setShowUnmatched((v) => !v)}
              style={[styles.outlineBtn, { borderColor: c.border }]}>
              <Text style={{ color: c.tint, fontWeight: '600' }}>
                {showUnmatched ? 'Hide unmatched' : `Unmatched SMS (${unmatched.length})`}
              </Text>
            </Pressable>
            {showUnmatched && (
              <View style={{ gap: 8 }}>
                {unmatched.length === 0 ? (
                  <Text style={{ color: c.muted, fontSize: 12, paddingHorizontal: 2 }}>
                    No unmatched SMS — every Till SMS decoded into an order.
                  </Text>
                ) : (
                  unmatched.map((u) => (
                    <UnmatchedCard key={u.id} item={u} colors={c} onDismiss={() => dismissUnmatched(u.id)} />
                  ))
                )}
              </View>
            )}

            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
              {activeNetwork.label} orders
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: c.muted, textAlign: 'center', marginTop: 20 }}>
            No {activeNetwork.label} orders match
          </Text>
        }
        renderItem={({ item }) => (
          <TxnCard
            txn={item}
            colors={c}
            expanded={expandedId === item.id}
            onToggleExpand={() => setExpandedId((id) => (id === item.id ? null : item.id))}
            onDelete={() => handleDelete(item)}
            onShare={() => handleShare(item)}
          />
        )}
      />
    </View>
  );
}

function ManualDeliveryForm({
  network,
  executionSubId,
  colors,
}: {
  network: Network;
  executionSubId: number | null;
  colors: (typeof Colors)['light'];
}) {
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!phone.trim() || !Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Check the form', 'Enter a valid phone number and amount.');
      return;
    }
    if (executionSubId == null) {
      Alert.alert('No execution SIM', `Pick a ${network} execution SIM above first.`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await manualDeliver({ phone: phone.trim(), amount: amt, network });
      if (result.ok) {
        setPhone('');
        setAmount('');
        Alert.alert('Queued', 'Manual delivery added to the dial queue.');
      } else {
        Alert.alert('Could not queue', result.reason ?? 'Unknown error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[stylesManual.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 4 }}>
        Trigger a {network} delivery directly — same queue, tracking and WhatsApp notifications as an
        SMS-triggered order.
      </Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone (07XXXXXXXX)"
        placeholderTextColor={colors.muted}
        keyboardType="phone-pad"
        style={[stylesManual.input, { borderColor: colors.border, color: colors.text }]}
      />
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Amount (KES)"
        placeholderTextColor={colors.muted}
        keyboardType="numeric"
        style={[stylesManual.input, { borderColor: colors.border, color: colors.text }]}
      />
      <Pressable
        onPress={submit}
        disabled={submitting}
        style={[stylesManual.btn, { backgroundColor: colors.tint, opacity: submitting ? 0.6 : 1 }]}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {submitting ? 'Queuing…' : 'Deliver now'}
        </Text>
      </Pressable>
    </View>
  );
}

function UnmatchedCard({
  item,
  colors,
  onDismiss,
}: {
  item: UnmatchedSms;
  colors: (typeof Colors)['light'];
  onDismiss: () => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
          {item.sender} · sub {item.subscriptionId}
        </Text>
        <Text style={{ color: colors.warning, fontSize: 11, fontWeight: '700' }}>
          {item.reason === 'no_ref' ? 'NO REF' : 'BAD REF'}
        </Text>
      </View>
      {item.ref && <Text style={{ color: colors.muted, fontSize: 11 }}>Ref: {item.ref}</Text>}
      <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>
        {item.bodyPreview}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        {new Date(item.receivedAt).toLocaleString()}
      </Text>
      <Pressable onPress={onDismiss} style={[styles.actionBtn, { borderColor: colors.border, alignSelf: 'flex-start' }]}>
        <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

function TxnCard({
  txn,
  colors,
  expanded,
  onToggleExpand,
  onDelete,
  onShare,
}: {
  txn: LocalTransaction;
  colors: (typeof Colors)['light'];
  expanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const statusColor =
    txn.status === 'completed' ? colors.success : txn.status === 'failed' ? colors.error : colors.warning;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>KES {txn.amount}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>
              {txn.status.toUpperCase()}
            </Text>
          </View>
          <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={8}>
            <Text style={{ color: colors.muted, fontSize: 18, fontWeight: '700' }}>⋮</Text>
          </Pressable>
        </View>
      </View>

      {menuOpen && (
        <View style={[styles.menu, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              onShare();
            }}
            style={styles.menuItem}>
            <Text style={{ color: colors.text }}>Share ref</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMenuOpen(false);
              onDelete();
            }}
            style={styles.menuItem}>
            <Text style={{ color: colors.error }}>Delete</Text>
          </Pressable>
        </View>
      )}

      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{txn.phone}</Text>
      <Text style={{ color: colors.muted, fontSize: 11 }}>Ref: {txn.ref}</Text>
      {txn.receipt ? (
        <Text style={{ color: colors.muted, fontSize: 11 }}>Receipt: {txn.receipt}</Text>
      ) : null}
      {txn.status === 'pending' && txn.deliveredAmount > 0 && (
        <Text style={{ color: colors.warning, fontSize: 12 }}>
          KES {txn.deliveredAmount} of {txn.amount} delivered so far
        </Text>
      )}
      {txn.failureReason ? (
        <Text style={{ color: colors.error, fontSize: 12 }}>{txn.failureReason}</Text>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        {new Date(txn.createdAt).toLocaleString()} · attempts {txn.attempts}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => openWhatsAppChat(txn.phone)}
          style={[styles.actionBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }}>WhatsApp</Text>
        </Pressable>
        {txn.status === 'failed' && (
          <Pressable
            onPress={() => retryDelivery(txn)}
            style={[styles.actionBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }}>Requeue</Text>
          </Pressable>
        )}
        {txn.dialResults.length > 0 && (
          <Pressable onPress={onToggleExpand} style={[styles.actionBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {expanded ? 'Hide dial log' : `Dial log (${txn.dialResults.length})`}
            </Text>
          </Pressable>
        )}
      </View>

      {expanded && (
        <View style={[styles.dialLog, { borderColor: colors.border }]}>
          {txn.dialResults.map((d, i) => (
            <View key={i} style={styles.dialLogRow}>
              <Text
                style={{
                  color: d.success ? colors.success : colors.error,
                  fontSize: 11,
                  fontWeight: '700',
                }}>
                {d.success ? '✓' : '✕'} {d.ussdCode}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                KES {d.amount} · {d.result || (d.success ? 'confirmed' : 'no response')}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  subTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 4 },
  subTabBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '700', paddingHorizontal: 2 },
  simRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  menu: {
    position: 'absolute',
    top: 30,
    right: 0,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 4,
    zIndex: 10,
    elevation: 4,
    minWidth: 110,
  },
  menuItem: { paddingHorizontal: 14, paddingVertical: 8 },
  dialLog: {
    borderTopWidth: 1,
    marginTop: 6,
    paddingTop: 6,
    gap: 4,
  },
  dialLogRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
});

const stylesManual = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
});

# Webazi brand assets

| File | Use |
|------|-----|
| `icon.svg` | App icon, favicon source |
| `logo.svg` | Wordmark for light backgrounds |
| `logo-white.svg` | Wordmark for dark backgrounds |
| `og-image.svg` | Open Graph / social share (1200×630) |

**Colors**
- Brand green: `#00A86B`
- Dark: `#0B1F17`
- Accent: `#2DD4A0`
- Light surface: `#E8F5EE`

PNG exports (icon sizes, wordmark, og-image.png):

```bash
pip install Pillow
python scripts/generate-brand-pngs.py
```

That writes PNGs into `assets/brand/` and `assets/images/` (app icon, splash, favicon, adaptive icons, OG).

/**
 * SMS → decode account ref → dial Sambaza USSD automation.
 * Uses native SmsListener + UssdExecutor modules.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';

import SmsListener from '../modules/sms-listener/src/SmsListenerModule';
import type { SmsReceivedPayload } from '../modules/sms-listener/src/SmsListener.types';

import UssdExecutor from '../modules/ussd-executor/src/UssdExecutorModule';

import { decodeAccountRef, extractAccountRef, extractReceipt, toMsisdn } from './accountRef';
import { planFulfillment } from './offerMatcher';

import { useSimStore } from '../store/useSimStore';
import { useActivityStore } from '../store/useActivityStore';
import { useTransactionStore } from '../store/useTransactionStore';
import type { DialResult, LocalTransaction } from '../store/useTransactionStore';
import { useUnmatchedStore } from '../store/useUnmatchedStore';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import { useMessageLogStore } from '../store/useMessageLogStore';
import type { MessageLogSource } from '../store/useMessageLogStore';

import { notifyWhatsApp } from './whatsapp';

let smsSubscription: EventSubscription | null = null;

/** Resolves after `ms` milliseconds — used for the inter-dial delay. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DialJob = {
  txnId: string;
  network: 'safaricom' | 'airtel';
  amount: number;
  phone: string; // local format, e.g. 0735830024
  executionSubId: number;
  dials: { ussdCode: string; amount: number; label: string }[];
  summary: string;
};

const dialQueue: DialJob[] = [];
let processingQueue = false;

/**
 * Request SMS-related permissions.
 */
export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS,
  ]);

  return Object.values(granted).every(
    (status) => status === PermissionsAndroid.RESULTS.GRANTED
  );
}

/**
 * Request CALL_PHONE permission.
 */
export async function requestCallPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CALL_PHONE,
    {
      title: 'Phone Call Permission',
      message:
        'Webazi needs permission to dial USSD codes for airtime delivery.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    }
  );

  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Refresh the available SIM slots.
 */
export function refreshSimSlots() {
  try {
    const slots = SmsListener.getSimSlots();

    useSimStore.getState().setAvailableSims(slots ?? []);

    return slots;
  } catch (e: any) {
    useActivityStore
      .getState()
      .addLog(
        'error',
        `getSimSlots failed: ${String(e?.message ?? e)}`
      );

    return [];
  }
}

/**
 * Start listening for incoming SMS messages.
 */
export async function startSmsListening(): Promise<boolean> {
  const ok = await requestSmsPermissions();

  if (!ok) {
    useActivityStore
      .getState()
      .addLog('error', 'SMS permissions denied');

    return false;
  }

  if (smsSubscription) {
    return true;
  }

  try {
    SmsListener.startListening();

    smsSubscription = SmsListener.addListener(
      'onSmsReceived',
      handleSms
    );

    // Requires a native rebuild — guarded so this still works against an
    // older build of the sms-listener module.
    if (typeof SmsListener.startForegroundService === 'function') {
      try {
        SmsListener.startForegroundService();
      } catch (e: any) {
        useActivityStore
          .getState()
          .addLog('warn', `Could not start foreground service: ${String(e?.message ?? e)}`);
      }
    }

    useSimStore.getState().setSmsListening(true);

    useActivityStore
      .getState()
      .addLog('success', 'SMS listener active');

    return true;
  } catch (e: any) {
    useActivityStore
      .getState()
      .addLog(
        'error',
        `startListening failed: ${String(e?.message ?? e)}`
      );

    return false;
  }
}

/**
 * Stop listening for SMS messages.
 */
export function stopSmsListening() {
  try {
    if (smsSubscription) {
      smsSubscription.remove();
      smsSubscription = null;
    }

    SmsListener.stopListening();

    if (typeof SmsListener.stopForegroundService === 'function') {
      SmsListener.stopForegroundService();
    }
  } catch {
    // Ignore cleanup errors.
  }

  useSimStore.getState().setSmsListening(false);

  useActivityStore
    .getState()
    .addLog('info', 'SMS listener stopped');
}

/**
 * Handle a live incoming SMS from the native listener — thin wrapper
 * around the shared processSmsPayload().
 */
function handleSms(event: SmsReceivedPayload) {
  processSmsPayload(
    {
      sender: event.sender,
      body: event.body,
      subscriptionId: event.subscriptionId,
      timestamp: event.timestamp,
    },
    'live'
  );
}

/**
 * Core SMS → order decode pipeline. Shared by three entry points:
 *  - handleSms()          live SMS via the native BroadcastReceiver
 *  - scanMissedMessages() the on-launch inbox scan, for SMS that arrived
 *                         while the app/process was killed
 *  - rerunMessage()       manually reprocessing one entry from the
 *                         MPESA Messages log, for debugging
 *
 * Every trusted-sender, Till-SIM message is written to the raw message
 * log (useMessageLogStore) regardless of outcome, so the MPESA Messages
 * screen shows the full picture — not just the ones that failed.
 */
export function processSmsPayload(
  event: { sender: string; body: string; subscriptionId: number; timestamp: number },
  source: MessageLogSource
) {
  const log = useActivityStore.getState().addLog;

  const tillSubscriptionId = useSimStore.getState().tillSubscriptionId;

  log(
    'info',
    `SMS from ${event.sender} on subscription ${event.subscriptionId}: ${event.body.slice(
      0,
      80
    )}…`
  );

  /**
   * No Till SIM has been selected.
   */
  if (tillSubscriptionId == null) {
    log(
      'warn',
      'SMS received but no Till SIM is selected. Open Settings and select the Till SIM.'
    );

    return;
  }

  /**
   * Ignore SMS messages received on another SIM. Payment SMS always
   * arrives on the Till SIM regardless of which network the order is for.
   */
  if (event.subscriptionId !== tillSubscriptionId) {
    log(
      'info',
      `Ignoring SMS from subscription ${event.subscriptionId}; Till SIM is subscription ${tillSubscriptionId}`
    );

    return;
  }

  /**
   * Verified Senders check — only parse SMS whose sender name matches one
   * of the trusted senders (default: "MPESA"). Any Till-SIM message from
   * something else — a spoofed/app-generated SMS, another app's alert —
   * is dropped here, before it ever reaches the ref parser, and is not
   * added to the message log (the log is for genuine Till-SIM traffic).
   */
  const trustedSenders = useAppSettingsStore.getState().trustedSenders;
  const senderTrusted =
    trustedSenders.length === 0 ||
    trustedSenders.some((s) => event.sender.toLowerCase().includes(s.toLowerCase()));

  if (!senderTrusted) {
    log(
      'warn',
      `Ignoring SMS from untrusted sender "${event.sender}" — add it in Settings → Verified Senders if this is legitimate`
    );

    return;
  }

  const receivedAt = new Date(event.timestamp || Date.now()).toISOString();
  const logMessage = useMessageLogStore.getState().addMessage;

  /**
   * Pull the account reference out of the SMS. If there isn't one, this
   * isn't a Webazi order confirmation — log it to the unmatched bucket
   * (Airtime Manager → Unmatched) so a paid customer isn't silently lost,
   * then stop.
   */
  const ref = extractAccountRef(event.body);

  if (!ref) {
    useUnmatchedStore.getState().addUnmatched({
      sender: event.sender,
      subscriptionId: event.subscriptionId,
      body: event.body,
      reason: 'no_ref',
    });

    logMessage({
      sender: event.sender,
      subscriptionId: event.subscriptionId,
      body: event.body,
      receivedAt,
      status: 'no_ref',
      source,
    });

    return;
  }

  const decoded = decodeAccountRef(ref);

  if (!decoded) {
    log(
      'warn',
      `Found account ref "${ref}" but could not decode it — ignoring`
    );

    useUnmatchedStore.getState().addUnmatched({
      sender: event.sender,
      subscriptionId: event.subscriptionId,
      body: event.body,
      reason: 'undecodable_ref',
      ref,
    });

    logMessage({
      sender: event.sender,
      subscriptionId: event.subscriptionId,
      body: event.body,
      receivedAt,
      status: 'undecodable_ref',
      ref,
      source,
    });

    return;
  }

  const { network, amount, phone } = decoded;
  const receipt = extractReceipt(event.body);

  /**
   * Ref-dedupe — the same M-Pesa receipt can otherwise be processed twice
   * (e.g. the live listener already queued it before the missed-messages
   * scan also finds it, or a message is manually Rerun after it already
   * succeeded). A receipt code is unique per M-Pesa transaction, so treat
   * a matching existing order as the same payment and skip re-dialing.
   */
  if (receipt) {
    const alreadyExists = useTransactionStore
      .getState()
      .transactions.some((t) => t.receipt === receipt);

    if (alreadyExists) {
      log('info', `Skipping duplicate — receipt ${receipt} already has an order`);

      logMessage({
        sender: event.sender,
        subscriptionId: event.subscriptionId,
        body: event.body,
        receivedAt,
        status: 'duplicate',
        ref,
        source,
      });

      return;
    }
  }

  /**
   * Execution SIM is chosen by network, independent of the Till SIM:
   * Safaricom orders dial from the Safaricom line, Airtel orders dial
   * from the Airtel line.
   */
  const executionSubId =
    network === 'airtel'
      ? useSimStore.getState().airtelExecutionSubscriptionId
      : useSimStore.getState().safaricomExecutionSubscriptionId;

  if (executionSubId == null) {
    log(
      'error',
      `No execution SIM configured for ${network} — set it in Settings`
    );

    logMessage({
      sender: event.sender,
      subscriptionId: event.subscriptionId,
      body: event.body,
      receivedAt,
      status: 'invalid',
      ref,
      source,
    });

    return;
  }

  const job = planFulfillment(toMsisdn(phone), amount);

  if (!job) {
    log(
      'error',
      `Invalid phone or amount for ref ${ref} (phone=${phone}, amount=${amount})`
    );

    logMessage({
      sender: event.sender,
      subscriptionId: event.subscriptionId,
      body: event.body,
      receivedAt,
      status: 'invalid',
      ref,
      source,
    });

    return;
  }

  log(
    'success',
    `Decoded ${ref} → ${network} KES ${amount} to ${phone}. ${job.summary}`
  );

  const txnId = useTransactionStore.getState().addPending({
    ref,
    receipt,
    network,
    phone,
    amount,
  });

  logMessage({
    sender: event.sender,
    subscriptionId: event.subscriptionId,
    body: event.body,
    receivedAt,
    status: 'queued',
    ref,
    source,
  });

  enqueueDial({
    txnId,
    network,
    amount,
    phone,
    executionSubId,
    dials: job.dials,
    summary: job.summary,
  });
}

/**
 * Manually reprocess one entry from the MPESA Messages log — the
 * "Rerun" button, for debugging when something silently failed. Goes
 * through the exact same pipeline as a live SMS, including the
 * duplicate-receipt check, so re-running an already-delivered message
 * is a safe no-op.
 */
export function rerunMessage(entry: {
  sender: string;
  subscriptionId: number;
  body: string;
}) {
  processSmsPayload(
    {
      sender: entry.sender,
      body: entry.body,
      subscriptionId: entry.subscriptionId,
      timestamp: Date.now(),
    },
    'rerun'
  );
}

/**
 * Add a USSD job to the queue.
 */
function enqueueDial(job: DialJob) {
  dialQueue.push(job);

  useActivityStore
    .getState()
    .addLog(
      'info',
      `${job.summary} added to USSD queue (${dialQueue.length} pending)`
    );

  void processDialQueue();
}

/**
 * Process queued USSD jobs sequentially.
 */
async function processDialQueue() {
  if (processingQueue) {
    return;
  }

  processingQueue = true;

  try {
    while (dialQueue.length > 0) {
      const job = dialQueue.shift();

      if (!job) {
        continue;
      }

      await autoDial(job);
    }
  } finally {
    processingQueue = false;
  }
}

/**
 * Automatically dial the USSD chunks for a decoded order.
 */
async function autoDial(job: DialJob) {
  const log = useActivityStore.getState().addLog;
  const txnStore = useTransactionStore.getState();
  const settings = useAppSettingsStore.getState();

  let wakeLockHeld = false;

  try {
    /**
     * Request permission to make phone calls.
     */
    const callOk = await requestCallPermission();

    if (!callOk) {
      log('error', 'CALL_PHONE denied');
      txnStore.markFailed(job.txnId, 'CALL_PHONE permission denied');
      scheduleAutoRetry(job);
      return;
    }

    /**
     * USSD automation requires the Accessibility service.
     */
    if (!UssdExecutor.isAccessibilityEnabled()) {
      const reason = 'Accessibility service not enabled — cannot dial USSD';

      log('error', `Enable Accessibility service for Webazi in system settings`);

      UssdExecutor.openAccessibilitySettings();

      txnStore.markFailed(job.txnId, reason);

      return;
    }

    /**
     * Keep the screen on for the duration of this (possibly multi-chunk)
     * dial. Requires a native rebuild — safe to call even on a build that
     * doesn't have it yet, since it's guarded.
     */
    if (settings.keepScreenAwakeDuringDial && typeof UssdExecutor.acquireDialWakeLock === 'function') {
      try {
        UssdExecutor.acquireDialWakeLock();
        wakeLockHeld = true;
      } catch (e: any) {
        log('warn', `Could not acquire wake lock: ${String(e?.message ?? e)}`);
      }
    }

    let allOk = true;
    let failReason = '';

    for (const [dialIndex, dial] of job.dials.entries()) {
      /**
       * Transaction Processing Delay — a deliberate pause before every
       * dial after the first. Orders over KES 10,000 get chunked into
       * multiple back-to-back *140*10000*...# dials; firing them with no
       * gap at all is likely to trip telco rate-limiting.
       */
      if (dialIndex > 0 && settings.interDialDelayMs > 0) {
        await sleep(settings.interDialDelayMs);
      }

      /**
       * Close any lingering USSD dialog before sending the next one —
       * a common cause of "no response" is a stale dialog from a
       * previous session still sitting on top. Requires a native
       * rebuild; safe to call even if not yet present.
       */
      if (settings.autoCloseUssdDialogs && typeof UssdExecutor.closeLingeringUssdDialog === 'function') {
        try {
          UssdExecutor.closeLingeringUssdDialog();
        } catch {
          // Non-fatal — proceed with the dial regardless.
        }
      }

      log(
        'info',
        `Dialing ${dial.label} on ${job.network} execution SIM → ${dial.ussdCode}`
      );

      const outcome = await dialWithTimeout(
        dial.ussdCode,
        job.executionSubId,
        [],
        settings.ussdTimeoutMs
      );

      const dialResult: DialResult = {
        ussdCode: dial.ussdCode,
        amount: dial.amount,
        success: outcome.success,
        result: outcome.result,
      };

      txnStore.recordDialResult(job.txnId, dialResult);

      if (!outcome.success) {
        allOk = false;
        failReason = `${dial.label} failed: ${outcome.result}`;
        log('error', failReason);
        break;
      }

      log(
        'success',
        `${dial.label} confirmed by USSD (${outcome.result || 'sent'})`
      );
    }

    if (allOk) {
      log(
        'success',
        `KES ${job.amount} delivered to ${job.phone} (${job.network})`
      );

      txnStore.markCompleted(job.txnId);

      await notifyWhatsApp({
        to: job.phone,
        template: 'delivery_success',
        planName: `${job.network} airtime KES ${job.amount}`,
      }).catch(() => {});
    } else {
      log(
        'error',
        `Delivery failed for ${job.phone} (${job.network} KES ${job.amount}): ${failReason}`
      );

      txnStore.markFailed(job.txnId, failReason);

      await notifyWhatsApp({
        to: job.phone,
        template: 'delivery_failed',
        planName: `${job.network} airtime KES ${job.amount}`,
        reason: failReason,
      }).catch(() => {});

      scheduleAutoRetry(job);
    }
  } catch (e: any) {
    const reason = String(e?.message ?? e);

    log('error', `autoDial error: ${reason}`);

    txnStore.markFailed(job.txnId, reason);

    scheduleAutoRetry(job);
  } finally {
    if (wakeLockHeld && typeof UssdExecutor.releaseDialWakeLock === 'function') {
      try {
        UssdExecutor.releaseDialWakeLock();
      } catch {
        // Non-fatal.
      }
    }
  }
}

const AUTO_RETRY_MAX_ATTEMPTS = 3;

/**
 * If auto-retry is enabled in Settings, schedule another attempt for a
 * failed order after the configured delay — capped at
 * AUTO_RETRY_MAX_ATTEMPTS so a persistently failing order doesn't retry
 * forever. Re-checks the transaction at fire time in case it was deleted,
 * manually requeued, or resolved in the meantime.
 */
function scheduleAutoRetry(job: DialJob) {
  const settings = useAppSettingsStore.getState();

  if (!settings.autoRetryEnabled) {
    return;
  }

  const txn = useTransactionStore.getState().transactions.find((t) => t.id === job.txnId);

  if (!txn || txn.status !== 'failed' || txn.attempts >= AUTO_RETRY_MAX_ATTEMPTS) {
    return;
  }

  useActivityStore
    .getState()
    .addLog(
      'info',
      `Auto-retry scheduled for ${job.phone} in ${Math.round(settings.autoRetryDelayMs / 1000)}s (attempt ${
        txn.attempts + 1
      }/${AUTO_RETRY_MAX_ATTEMPTS})`
    );

  setTimeout(() => {
    const latest = useTransactionStore.getState().transactions.find((t) => t.id === job.txnId);

    if (!latest || latest.status !== 'failed') {
      return;
    }

    void retryDelivery(latest);
  }, settings.autoRetryDelayMs);
}

/**
 * Re-run delivery for a failed order from the Orders screen's "Requeue"
 * action. Rebuilds the USSD dial plan and dials again from the same
 * per-network execution SIM — entirely local, no backend involved.
 */
export async function retryDelivery(txn: LocalTransaction) {
  const log = useActivityStore.getState().addLog;

  const executionSubId =
    txn.network === 'airtel'
      ? useSimStore.getState().airtelExecutionSubscriptionId
      : useSimStore.getState().safaricomExecutionSubscriptionId;

  if (executionSubId == null) {
    log(
      'error',
      `No execution SIM configured for ${txn.network} — set it in Settings`
    );

    return;
  }

  const job = planFulfillment(toMsisdn(txn.phone), txn.amount);

  if (!job) {
    log('error', `Cannot retry ${txn.ref}: invalid phone/amount`);
    return;
  }

  useTransactionStore.getState().bumpAttempts(txn.id);

  enqueueDial({
    txnId: txn.id,
    network: txn.network,
    amount: txn.amount,
    phone: txn.phone,
    executionSubId,
    dials: job.dials,
    summary: job.summary,
  });
}

/**
 * Dial a USSD code with a timeout.
 */
function dialWithTimeout(
  ussdCode: string,
  subscriptionId: number,
  menuInputs: string[],
  timeoutMs: number
): Promise<{ success: boolean; result: string }> {
  return new Promise((resolve) => {
    let settled = false;

    const subscription = UssdExecutor.addListener(
      'onUssdResult',
      (event: any) => {
        if (settled) {
          return;
        }

        settled = true;

        subscription.remove();
        clearTimeout(timer);

        resolve({
          success: Boolean(event?.success),
          result: String(event?.result ?? ''),
        });
      }
    );

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;

      subscription.remove();

      resolve({
        success: false,
        result: 'Timed out waiting for USSD response',
      });
    }, timeoutMs);

    try {
      UssdExecutor.dialUssd(
        ussdCode,
        subscriptionId,
        menuInputs
      );
    } catch (e: any) {
      if (settled) {
        return;
      }

      settled = true;

      subscription.remove();
      clearTimeout(timer);

      resolve({
        success: false,
        result: String(e?.message ?? e),
      });
    }
  });
}

/**
 * Manually trigger a delivery without waiting for a payment SMS — for
 * support/testing, or to resolve an entry from the Unmatched bucket once
 * you know the real phone/amount. Order-shaped (unlike manualDial, which
 * just fires a raw USSD code): it goes through the same planFulfillment
 * queue as an SMS-triggered order, so it shows up on the Orders/Airtime
 * screens with the same tracking, retries and WhatsApp notifications.
 */
export async function manualDeliver(input: {
  phone: string; // local format, e.g. 0735830024
  amount: number;
  network: 'safaricom' | 'airtel';
}): Promise<{ ok: boolean; reason?: string; txnId?: string }> {
  const log = useActivityStore.getState().addLog;
  const { phone, amount, network } = input;

  const executionSubId =
    network === 'airtel'
      ? useSimStore.getState().airtelExecutionSubscriptionId
      : useSimStore.getState().safaricomExecutionSubscriptionId;

  if (executionSubId == null) {
    const reason = `No execution SIM configured for ${network} — set it in Airtime Manager`;
    log('error', reason);
    return { ok: false, reason };
  }

  const job = planFulfillment(toMsisdn(phone), amount);

  if (!job) {
    const reason = `Invalid phone or amount (phone=${phone}, amount=${amount})`;
    log('error', reason);
    return { ok: false, reason };
  }

  log('info', `Manual delivery: ${network} KES ${amount} to ${phone}. ${job.summary}`);

  const txnId = useTransactionStore.getState().addPending({
    ref: `MANUAL-${Date.now()}`,
    receipt: null,
    network,
    phone,
    amount,
  });

  enqueueDial({
    txnId,
    network,
    amount,
    phone,
    executionSubId,
    dials: job.dials,
    summary: job.summary,
  });

  return { ok: true, txnId };
}

/**
 * Manual test dial from the UI (e.g. a future USSD Console screen).
 * Pass the subscriptionId to dial from explicitly — now that execution SIM
 * is chosen per network (Safaricom/Airtel), there's no single "the" dial
 * SIM to default to.
 */
export async function manualDial(
  ussdCode: string,
  subscriptionId: number,
  menuInputs: string[] = []
) {
  const callOk = await requestCallPermission();

  if (!callOk) {
    throw new Error('CALL_PHONE denied');
  }

  if (!UssdExecutor.isAccessibilityEnabled()) {
    UssdExecutor.openAccessibilitySettings();

    throw new Error('Accessibility service not enabled');
  }

  if (subscriptionId == null || subscriptionId < 0) {
    throw new Error('No SIM specified for USSD dialing');
  }

  return dialWithTimeout(
    ussdCode,
    subscriptionId,
    menuInputs,
    useAppSettingsStore.getState().ussdTimeoutMs
  );
}
