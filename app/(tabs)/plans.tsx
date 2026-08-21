import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DATA_PLANS } from '@/modules/offer-matcher/plans';
import type { DataPlan } from '@/modules/offer-matcher/types';
import { manualDial } from '@/services/smsAutomation';
import { useActivityStore } from '@/store/useActivityStore';

export default function PlansScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const log = useActivityStore((s) => s.addLog);

  const categories = useMemo(() => {
    const set = new Set(DATA_PLANS.map((p) => p.category));
    return Array.from(set);
  }, []);

  const filtered = DATA_PLANS.filter((p) => {
    if (category && p.category !== category) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      String(p.price).includes(q) ||
      p.ussdTemplate.toLowerCase().includes(q)
    );
  });

  const testDial = (plan: DataPlan) => {
    Alert.alert(
      'Test dial',
      `Dial ${plan.name}?\n${plan.ussdTemplate.replace('pn', '2547XXXXXXXX')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dial',
          onPress: async () => {
            try {
              const code = plan.ussdTemplate.replace('pn', '254700000000');
              const result = await manualDial(code, plan.followUpInputs);
              log(
                result.success ? 'success' : 'error',
                `Test dial ${plan.name}: ${result.result || (result.success ? 'OK' : 'failed')}`
              );
            } catch (e: any) {
              log('error', String(e?.message ?? e));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + 8 }}>
      <Text style={[styles.title, { color: c.text, paddingHorizontal: 16 }]}>Data plans</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, price, USSD…"
        placeholderTextColor={c.muted}
        style={[
          styles.search,
          { backgroundColor: c.surface, borderColor: c.border, color: c.text },
        ]}
      />

      <FlatList
        horizontal
        data={[null, ...categories]}
        keyExtractor={(item) => item ?? 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setCategory(item)}
            style={[
              styles.catChip,
              {
                backgroundColor: category === item ? c.tint : c.surface,
                borderColor: c.border,
              },
            ]}>
            <Text
              style={{
                color: category === item ? '#fff' : c.textSecondary,
                fontSize: 12,
                fontWeight: '600',
              }}>
              {item ?? 'All'}
            </Text>
          </Pressable>
        )}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 24 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => testDial(item)}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.row}>
              <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>{item.name}</Text>
              <Text style={{ color: c.tint, fontWeight: '800' }}>KES {item.price}</Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12 }}>{item.category}</Text>
            <Text style={{ color: c.muted, fontSize: 11, fontFamily: 'monospace' }}>
              {item.ussdTemplate}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
  search: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  catChip: {
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
