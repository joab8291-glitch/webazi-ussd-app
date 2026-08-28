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
  const clearByNetwork = useTransactionStore((s) => s.clearByNetwork);
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

  const handleClearAllForNetwork = () => {
    if (networkTxns.length === 0) return;
    Alert.alert(
      `Clear all ${activeNetwork.label} orders?`,
      'This deletes every order on this tab — including any still pending delivery. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear all', style: 'destructive', onPress: () => clearByNetwork(network) },
      ]
    );
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

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
                {activeNetwork.label} orders
              </Text>
              <Pressable onPress={handleClearAllForNetwork} hitSlop={8}>
                <Text
                  style={{
                    color: networkTxns.length ? c.error : c.muted,
                    fontSize: 12,
                    fontWeight: '600',
                  }}>
                  Clear all
                </Text>
              </Pressable>
            </View>
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
