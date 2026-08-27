import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
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
import { useAppSettingsStore } from '@/store/useAppSettingsStore';

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettingsStore();
  const [senderInput, setSenderInput] = useState('');
  const [timeoutInput, setTimeoutInput] = useState(String(settings.ussdTimeoutMs / 1000));
  const [retryInput, setRetryInput] = useState(String(settings.autoRetryDelayMs / 1000));
  const [deleteInput, setDeleteInput] = useState(settings.autoDeleteDays == null ? '' : String(settings.autoDeleteDays));

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
            if (tillSubscriptionId == null) {
              Alert.alert('No SIM selected', 'Pick a Till / fulfillment SIM above first.');
              return;
            }
            try {
              const result = await manualDial(testCode, tillSubscriptionId);
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

      <Section title="USSD settings" colors={c}>
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>Trusted sender names are checked before automatic SMS fulfillment. Default: MPESA.</Text>
        <View style={styles.senderRow}><TextInput value={senderInput} onChangeText={setSenderInput} placeholder="MPESA" placeholderTextColor={c.muted} style={[styles.input, { flex: 1, backgroundColor: c.background, borderColor: c.border, color: c.text }]} /><Pressable onPress={() => { settings.addTrustedSender(senderInput); setSenderInput(''); }} style={[styles.smallBtn, { backgroundColor: c.tint }]}><Text style={styles.primaryBtnText}>Add</Text></Pressable></View>
        {settings.trustedSenders.map((sender) => <View key={sender} style={[styles.senderChip, { borderColor: c.border }]}><Text style={{ color: c.text, flex: 1 }}>{sender}</Text><Pressable onPress={() => settings.removeTrustedSender(sender)}><Text style={{ color: c.error, fontWeight: '700' }}>Remove</Text></Pressable></View>)}
        <ToggleRow label="Auto-close lingering USSD dialogs" value={settings.autoCloseUssdDialogs} onChange={settings.setAutoCloseUssdDialogs} colors={c} />
        <ToggleRow label="Keep screen awake during USSD" value={settings.keepScreenAwakeDuringDial} onChange={settings.setKeepScreenAwakeDuringDial} colors={c} />
        <ToggleRow label="Auto-retry failed deliveries (max 3 attempts)" value={settings.autoRetryEnabled} onChange={settings.setAutoRetryEnabled} colors={c} />
        <Text style={[styles.label, { color: c.textSecondary }]}>USSD timeout (seconds)</Text><TextInput value={timeoutInput} onChangeText={setTimeoutInput} onBlur={() => { const n=Number(timeoutInput); if(Number.isFinite(n)) settings.setUssdTimeoutMs(n*1000); }} keyboardType="numeric" style={[styles.input,{backgroundColor:c.background,borderColor:c.border,color:c.text}]} />
        <Text style={[styles.label, { color: c.textSecondary }]}>Retry delay (seconds)</Text><TextInput value={retryInput} onChangeText={setRetryInput} onBlur={() => { const n=Number(retryInput); if(Number.isFinite(n)) settings.setAutoRetryDelayMs(n*1000); }} keyboardType="numeric" style={[styles.input,{backgroundColor:c.background,borderColor:c.border,color:c.text}]} />
        <Text style={[styles.label, { color: c.textSecondary }]}>Auto-delete resolved orders after days (blank = never)</Text><TextInput value={deleteInput} onChangeText={setDeleteInput} onBlur={() => { const n=Number(deleteInput); settings.setAutoDeleteDays(deleteInput.trim() && Number.isFinite(n) && n>0 ? n : null); }} keyboardType="numeric" style={[styles.input,{backgroundColor:c.background,borderColor:c.border,color:c.text}]} />
        {settings.autoDeleteLastRunAt && <Text style={{color:c.muted,fontSize:11}}>Last run: {new Date(settings.autoDeleteLastRunAt).toLocaleString()}</Text>}
        <Pressable onPress={() => router.push('/ussd-scheduler')} style={[styles.outlineBtn,{borderColor:c.border}]}><Text style={{color:c.tint,fontWeight:'700'}}>Open USSD Scheduler</Text></Pressable>
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
  senderRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, senderChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 }, smallBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
});