import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSimStore } from '@/store/useSimStore';
import { useTransactionStore } from '@/store/useTransactionStore';
import type { LocalTransaction } from '@/store/useTransactionStore';
import { retryDelivery } from '@/services/smsAutomation';
import { openWhatsAppChat } from '@/services/whatsapp';

type Network = 'safaricom' | 'airtel';

const NETWORKS: { key: Network; label: string; refPrefix: string }[] = [
  { key: 'safaricom', label: 'Safaricom', refPrefix: 'S-' },
  { key: 'airtel', label: 'Airtel', refPrefix: 'A-' },
];

export default function AirtimeManagerScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [network, setNetwork] = useState<Network>('safaricom');

  const {
    availableSims,
    safaricomExecutionSubscriptionId,
    airtelExecutionSubscriptionId,
    setSafaricomExecutionSim,
    setAirtelExecutionSim,
  } = useSimStore();

  const transactions = useTransactionStore((s) => s.transactions);
  const networkTxns = useMemo(
    () => transactions.filter((t) => t.network === network),
    [transactions, network]
  );

  const executionSubId = network === 'safaricom' ? safaricomExecutionSubscriptionId : airtelExecutionSubscriptionId;
  const setExecutionSim = network === 'safaricom' ? setSafaricomExecutionSim : setAirtelExecutionSim;
  const activeNetwork = NETWORKS.find((n) => n.key === network)!;

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
                {
                  backgroundColor: selected ? c.tint : c.surface,
                  borderColor: c.border,
                },
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
        data={networkTxns}
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

            <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>
              {activeNetwork.label} orders
            </Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: c.muted, textAlign: 'center', marginTop: 20 }}>
            No {activeNetwork.label} orders yet
          </Text>
        }
        renderItem={({ item }) => <TxnCard txn={item} colors={c} />}
      />
    </View>
  );
}

function TxnCard({ txn, colors }: { txn: LocalTransaction; colors: (typeof Colors)['light'] }) {
  const statusColor =
    txn.status === 'completed' ? colors.success : txn.status === 'failed' ? colors.error : colors.warning;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>KES {txn.amount}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
          <Text style={{ color: statusColor, fontSize: 11, fontWeight: '700' }}>
            {txn.status.toUpperCase()}
          </Text>
        </View>
      </View>
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
      </View>
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
});