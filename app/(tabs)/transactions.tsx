import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTransactionStore } from '@/store/useTransactionStore';
import type { Transaction } from '@/services/api';
import { requeue, reportComplete, reportFail } from '@/services/api';
import { openWhatsAppChat } from '@/services/whatsapp';

type Filter = 'all' | 'pending' | 'completed' | 'failed';

const FILTERS: Filter[] = ['all', 'pending', 'completed', 'failed'];

export default function TransactionsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const { transactions, loading, error, refresh } = useTransactionStore();
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    refresh(filter === 'all' ? undefined : filter);
  }, [filter, refresh]);

  useEffect(() => {
    load();
  }, [load]);

  const data =
    filter === 'all' ? transactions : transactions.filter((t) => t.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + 8 }}>
      <Text style={[styles.title, { color: c.text, paddingHorizontal: 16 }]}>Orders</Text>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f ? c.tint : c.surface,
                borderColor: c.border,
              },
            ]}>
            <Text
              style={{
                color: filter === f ? '#fff' : c.textSecondary,
                fontSize: 12,
                fontWeight: '600',
                textTransform: 'capitalize',
              }}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && (
        <Text style={{ color: c.error, paddingHorizontal: 16, marginBottom: 8 }}>{error}</Text>
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={c.tint} style={{ marginTop: 40 }} />
          ) : (
            <Text style={{ color: c.muted, textAlign: 'center', marginTop: 40 }}>
              No transactions
            </Text>
          )
        }
        renderItem={({ item }) => <TxnCard txn={item} colors={c} onRefresh={load} />}
      />
    </View>
  );
}

function TxnCard({
  txn,
  colors,
  onRefresh,
}: {
  txn: Transaction;
  colors: (typeof Colors)['light'];
  onRefresh: () => void;
}) {
  const statusColor =
    txn.status === 'completed'
      ? colors.success
      : txn.status === 'failed'
        ? colors.error
        : txn.status === 'pending'
          ? colors.warning
          : colors.muted;

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
      {txn.receipt ? (
        <Text style={{ color: colors.muted, fontSize: 11 }}>Receipt: {txn.receipt}</Text>
      ) : null}
      {txn.failure_reason ? (
        <Text style={{ color: colors.error, fontSize: 12 }}>{txn.failure_reason}</Text>
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        {new Date(txn.created_at).toLocaleString()} · attempts {txn.attempts}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() => openWhatsAppChat(txn.phone)}
          style={[styles.actionBtn, { borderColor: colors.border }]}>
          <Text style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }}>WhatsApp</Text>
        </Pressable>
        {txn.status === 'failed' && (
          <Pressable
            onPress={async () => {
              await requeue(txn.id);
              onRefresh();
            }}
            style={[styles.actionBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '600' }}>Requeue</Text>
          </Pressable>
        )}
        {txn.status === 'pending' && (
          <>
            <Pressable
              onPress={async () => {
                await reportComplete(txn.id);
                onRefresh();
              }}
              style={[styles.actionBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: '600' }}>Mark done</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await reportFail(txn.id, 'Manually failed from app');
                onRefresh();
              }}
              style={[styles.actionBtn, { borderColor: colors.border }]}>
              <Text style={{ color: colors.error, fontSize: 12, fontWeight: '600' }}>Fail</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
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
