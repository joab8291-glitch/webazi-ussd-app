import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSimStore } from '@/store/useSimStore';
import { useWhatsAppStore } from '@/store/useWhatsAppStore';
import { refreshSimSlots } from '@/services/smsAutomation';
import { manualDial } from '@/services/smsAutomation';
import UssdExecutor from '@/modules/ussd-executor/src/UssdExecutorModule';
import { WHATSAPP_WEBHOOK_NOTES } from '@/services/whatsapp';
import { useActivityStore } from '@/store/useActivityStore';

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();

  const { availableSims, tillSubscriptionId, setTillSim } = useSimStore();
  const wa = useWhatsAppStore();
  const log = useActivityStore((s) => s.addLog);

  const [testCode, setTestCode] = useState('*334#');
  const [a11y, setA11y] = useState<boolean | null>(null);

  useEffect(() => {
    refreshSimSlots();
    try {
      setA11y(UssdExecutor.isAccessibilityEnabled());
    } catch {
      setA11y(false);
    }
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
        gap: 14,
      }}>
      <Text style={[styles.title, { color: c.text }]}>Settings</Text>

      {/* SIM selection */}
      <Section title="Till / fulfillment SIM" colors={c}>
        <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>
          Choose which SIM dials USSD for customers.
        </Text>
        <Pressable
          onPress={() => refreshSimSlots()}
          style={[styles.outlineBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.tint, fontWeight: '600' }}>Refresh SIM list</Text>
        </Pressable>
        {availableSims.length === 0 && (
          <Text style={{ color: c.muted, fontSize: 12 }}>No SIMs detected yet</Text>
        )}
        {availableSims.map((sim) => {
          const selected = tillSubscriptionId === sim.subscriptionId;
          return (
            <Pressable
              key={sim.subscriptionId}
              onPress={() => setTillSim(sim.subscriptionId)}
              style={[
                styles.simRow,
                {
                  borderColor: selected ? c.tint : c.border,
                  backgroundColor: selected ? c.surfaceAlt : c.surface,
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
      </Section>

      {/* Accessibility */}
      <Section title="Accessibility service" colors={c}>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>
          Status: {a11y == null ? '…' : a11y ? 'Enabled ✓' : 'Disabled — required for multi-step USSD'}
        </Text>
        <Pressable
          onPress={() => {
            try {
              UssdExecutor.openAccessibilitySettings();
            } catch (e: any) {
              Alert.alert('Error', String(e?.message ?? e));
            }
          }}
          style={[styles.outlineBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.tint, fontWeight: '600' }}>Open accessibility settings</Text>
        </Pressable>
      </Section>

      {/* Manual USSD test */}
      <Section title="Manual USSD test" colors={c}>
        <TextInput
          value={testCode}
          onChangeText={setTestCode}
          placeholder="*180*5*2*2547…#"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          style={[
            styles.input,
            { backgroundColor: c.background, borderColor: c.border, color: c.text },
          ]}
        />
        <Pressable
          onPress={async () => {
            try {
              const result = await manualDial(testCode);
              log(
                result.success ? 'success' : 'error',
                `Manual dial: ${result.result || (result.success ? 'OK' : 'failed')}`
              );
              Alert.alert(result.success ? 'Success' : 'Failed', result.result || 'No response');
            } catch (e: any) {
              Alert.alert('Error', String(e?.message ?? e));
            }
          }}
          style={[styles.primaryBtn, { backgroundColor: c.tint }]}>
          <Text style={styles.primaryBtnText}>Dial now</Text>
        </Pressable>
      </Section>

      {/* WhatsApp */}
      <Section title="WhatsApp notifications" colors={c}>
        <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>
          Customer notifications are sent via your backend proxy so tokens stay server-side.
          Endpoint: POST https://webazi-digital-solutions.onrender.com/whatsapp/notify
        </Text>

        <ToggleRow
          label="Enable WhatsApp notifications"
          value={wa.enabled}
          onChange={wa.setEnabled}
          colors={c}
        />
        <ToggleRow
          label="Notify on successful delivery"
          value={wa.notifyOnComplete}
          onChange={wa.setNotifyOnComplete}
          colors={c}
        />
        <ToggleRow
          label="Notify on failure"
          value={wa.notifyOnFail}
          onChange={wa.setNotifyOnFail}
          colors={c}
        />

        <Text style={[styles.label, { color: c.textSecondary }]}>Phone Number ID</Text>
        <TextInput
          value={wa.phoneNumberId}
          onChangeText={wa.setPhoneNumberId}
          placeholder="Meta WhatsApp phone number ID"
          placeholderTextColor={c.muted}
          style={[
            styles.input,
            { backgroundColor: c.background, borderColor: c.border, color: c.text },
          ]}
        />

        <Text style={[styles.label, { color: c.textSecondary }]}>Business Account ID</Text>
        <TextInput
          value={wa.businessAccountId}
          onChangeText={wa.setBusinessAccountId}
          placeholder="WABA ID"
          placeholderTextColor={c.muted}
          style={[
            styles.input,
            { backgroundColor: c.background, borderColor: c.border, color: c.text },
          ]}
        />

        <Text style={{ color: c.muted, fontSize: 11, marginTop: 8, lineHeight: 16 }}>
          {WHATSAPP_WEBHOOK_NOTES.trim()}
        </Text>
      </Section>

      <Text style={{ color: c.muted, fontSize: 11, textAlign: 'center' }}>
        Backend · https://webazi-digital-solutions.onrender.com
      </Text>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colors: (typeof Colors)['light'];
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={{ color: colors.text, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.tint, false: colors.border }} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '800' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  simRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: { fontSize: 12, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
