import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
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
import { useAppSettingsStore } from '@/store/useAppSettingsStore';
import { refreshSimSlots } from '@/services/smsAutomation';
import { manualDial } from '@/services/smsAutomation';
import { scanMissedMessages } from '@/services/missedMessages';
import { Link } from 'expo-router';
import UssdExecutor from '@/modules/ussd-executor/src/UssdExecutorModule';
import SmsListener from '@/modules/sms-listener/src/SmsListenerModule';
import { WHATSAPP_WEBHOOK_NOTES } from '@/services/whatsapp';
import { useActivityStore } from '@/store/useActivityStore';

export default function SettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();

  const { availableSims, tillSubscriptionId, setTillSim } = useSimStore();
  const wa = useWhatsAppStore();
  const log = useActivityStore((s) => s.addLog);
  const appSettings = useAppSettingsStore();

  const [testCode, setTestCode] = useState('*334#');
  const [a11y, setA11y] = useState<boolean | null>(null);
  const [batteryExempt, setBatteryExempt] = useState<boolean | null>(null);
  const [newSender, setNewSender] = useState('');
  const [scanning, setScanning] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshSimSlots();
      try {
        setA11y(UssdExecutor.isAccessibilityEnabled());
      } catch {
        setA11y(false);
      }
      try {
        setBatteryExempt(
          typeof SmsListener.isIgnoringBatteryOptimizations === 'function'
            ? SmsListener.isIgnoringBatteryOptimizations()
            : null
        );
      } catch {
        setBatteryExempt(null);
      }
    }, [])
  );

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

      {/* Background reliability */}
      <Section title="Background reliability" colors={c}>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>
          Status:{' '}
          {batteryExempt == null
            ? 'Unknown — needs a native rebuild'
            : batteryExempt
              ? 'Battery optimization disabled ✓'
              : 'Battery optimization is ON — Android may kill the listener in the background'}
        </Text>
        <Pressable
          onPress={() => {
            try {
              if (typeof SmsListener.requestIgnoreBatteryOptimizations === 'function') {
                SmsListener.requestIgnoreBatteryOptimizations();
              } else {
                Alert.alert('Rebuild required', 'This needs a native rebuild before it can be used.');
              }
            } catch (e: any) {
              Alert.alert('Error', String(e?.message ?? e));
            }
          }}
          style={[styles.outlineBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.tint, fontWeight: '600' }}>Disable battery optimization</Text>
        </Pressable>
        <Text style={{ color: c.muted, fontSize: 11, lineHeight: 16 }}>
          The SMS listener also restarts itself if the app is swiped away from Recents. Some phone
          makers (Xiaomi/MIUI, Oppo, Vivo, Huawei) still throttle background apps even with this
          granted — you may also need to enable "Autostart" for Webazi in their own battery settings.
          No app can fully guarantee this from code.
        </Text>
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

      {/* Advanced USSD settings */}
      <Section title="USSD settings" colors={c}>
        <Text style={[styles.label, { color: c.textSecondary }]}>Verified senders</Text>
        <Text style={{ color: c.muted, fontSize: 11, marginBottom: 6 }}>
          SMS on the Till SIM is only parsed if the sender matches one of these.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {appSettings.trustedSenders.map((sender) => (
            <Pressable
              key={sender}
              onPress={() => appSettings.removeTrustedSender(sender)}
              style={[styles.senderChip, { borderColor: c.border, backgroundColor: c.background }]}>
              <Text style={{ color: c.text, fontSize: 12 }}>{sender} ✕</Text>
            </Pressable>
          ))}
          {appSettings.trustedSenders.length === 0 && (
            <Text style={{ color: c.warning, fontSize: 12 }}>
              None set — all SMS on the Till SIM will be ignored.
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={newSender}
            onChangeText={setNewSender}
            placeholder="e.g. MPESA"
            placeholderTextColor={c.muted}
            autoCapitalize="characters"
            style={[
              styles.input,
              { flex: 1, backgroundColor: c.background, borderColor: c.border, color: c.text },
            ]}
          />
          <Pressable
            onPress={() => {
              if (newSender.trim()) {
                appSettings.addTrustedSender(newSender.trim());
                setNewSender('');
              }
            }}
            style={[styles.outlineBtn, { borderColor: c.border, paddingHorizontal: 16 }]}>
            <Text style={{ color: c.tint, fontWeight: '600' }}>Add</Text>
          </Pressable>
        </View>

        <View style={[styles.divider, { backgroundColor: c.border }]} />

        <ToggleRow
          label="Auto-close other USSD dialogs"
          value={appSettings.autoCloseUssdDialogs}
          onChange={appSettings.setAutoCloseUssdDialogs}
          colors={c}
        />
        <Text style={{ color: c.muted, fontSize: 11, marginTop: -6 }}>
          Closes a lingering USSD session before dialing. Requires a native rebuild.
        </Text>

        <ToggleRow
          label="Keep screen awake during dial"
          value={appSettings.keepScreenAwakeDuringDial}
          onChange={appSettings.setKeepScreenAwakeDuringDial}
          colors={c}
        />
        <Text style={{ color: c.muted, fontSize: 11, marginTop: -6 }}>
          Some devices need the screen on for multi-step USSD. Requires a native rebuild.
        </Text>

        <View style={[styles.divider, { backgroundColor: c.border }]} />

        <Text style={[styles.label, { color: c.textSecondary }]}>USSD response timeout (seconds)</Text>
        <TextInput
          value={String(Math.round(appSettings.ussdTimeoutMs / 1000))}
          onChangeText={(v) => {
            const n = Number(v);
            if (Number.isFinite(n)) appSettings.setUssdTimeoutMs(n * 1000);
          }}
          keyboardType="numeric"
          style={[
            styles.input,
            { backgroundColor: c.background, borderColor: c.border, color: c.text },
          ]}
        />

        <ToggleRow
          label="Auto-retry failed deliveries"
          value={appSettings.autoRetryEnabled}
          onChange={appSettings.setAutoRetryEnabled}
          colors={c}
        />
        {appSettings.autoRetryEnabled && (
          <>
            <Text style={[styles.label, { color: c.textSecondary }]}>Retry delay (seconds)</Text>
            <TextInput
              value={String(Math.round(appSettings.autoRetryDelayMs / 1000))}
              onChangeText={(v) => {
                const n = Number(v);
                if (Number.isFinite(n)) appSettings.setAutoRetryDelayMs(n * 1000);
              }}
              keyboardType="numeric"
              style={[
                styles.input,
                { backgroundColor: c.background, borderColor: c.border, color: c.text },
              ]}
            />
            <Text style={{ color: c.muted, fontSize: 11 }}>Up to 3 automatic attempts per order.</Text>
          </>
        )}

        <View style={[styles.divider, { backgroundColor: c.border }]} />

        <Text style={[styles.label, { color: c.textSecondary }]}>
          Transaction Processing Delay — pause between chunked dials (ms)
        </Text>
        <Text style={{ color: c.muted, fontSize: 11, marginTop: -6 }}>
          Orders over KES 10,000 dial multiple *140*10000*…# chunks back-to-back. A short pause
          avoids tripping telco rate-limiting. 0–10,000ms.
        </Text>
        <TextInput
          value={String(appSettings.interDialDelayMs)}
          onChangeText={(v) => {
            const n = Number(v);
            if (Number.isFinite(n)) appSettings.setInterDialDelayMs(n);
          }}
          keyboardType="numeric"
          style={[
            styles.input,
            { backgroundColor: c.background, borderColor: c.border, color: c.text },
          ]}
        />

        <View style={[styles.divider, { backgroundColor: c.border }]} />

        <Text style={[styles.label, { color: c.textSecondary }]}>
          Auto-delete completed/failed orders after (days, 0 = never)
        </Text>
        <TextInput
          value={appSettings.autoDeleteDays == null ? '0' : String(appSettings.autoDeleteDays)}
          onChangeText={(v) => {
            const n = Number(v);
            if (Number.isFinite(n)) appSettings.setAutoDeleteDays(n);
          }}
          keyboardType="numeric"
          style={[
            styles.input,
            { backgroundColor: c.background, borderColor: c.border, color: c.text },
          ]}
        />
        <Text style={{ color: c.muted, fontSize: 11 }}>
          Pending orders are never auto-deleted. Last run:{' '}
          {appSettings.autoDeleteLastRunAt
            ? new Date(appSettings.autoDeleteLastRunAt).toLocaleString()
            : 'Never'}
        </Text>
      </Section>

      {/* Missed Messages */}
      <Section title="Missed Messages" colors={c}>
        <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 4 }}>
          Configure inbox scan on app launch — catches a Till-SIM payment SMS that arrived while
          the app/process was killed, so it isn't silently missed.
        </Text>

        <ToggleRow
          label="Scan inbox on launch"
          value={appSettings.missedMessagesScanEnabled}
          onChange={appSettings.setMissedMessagesScanEnabled}
          colors={c}
        />

        <Text style={{ color: c.muted, fontSize: 11 }}>
          Last scan:{' '}
          {appSettings.lastInboxScanAt
            ? new Date(appSettings.lastInboxScanAt).toLocaleString()
            : 'Never'}
        </Text>

        <Pressable
          onPress={async () => {
            setScanning(true);
            try {
              const { scanned } = await scanMissedMessages();
              log('info', `Manual inbox scan complete — ${scanned} message(s) found`);
              Alert.alert('Scan complete', `${scanned} message(s) found and reprocessed.`);
            } catch (e: any) {
              Alert.alert('Error', String(e?.message ?? e));
            } finally {
              setScanning(false);
            }
          }}
          disabled={scanning}
          style={[styles.outlineBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.tint, fontWeight: '600' }}>
            {scanning ? 'Scanning…' : 'Scan now'}
          </Text>
        </Pressable>

        <Link href="/mpesa-messages" asChild>
          <Pressable style={[styles.outlineBtn, { borderColor: c.border }]}>
            <Text style={{ color: c.tint, fontWeight: '600' }}>Open MPESA Messages log</Text>
          </Pressable>
        </Link>
      </Section>

      {/* USSD Scheduler */}
      <Section title="USSD Scheduler" colors={c}>
        <Text style={{ color: c.textSecondary, fontSize: 13, marginBottom: 8 }}>
          Schedule one-off or recurring manual deliveries. Only runs while the app is open.
        </Text>
        <Link href="/ussd-scheduler" asChild>
          <Pressable style={[styles.outlineBtn, { borderColor: c.border }]}>
            <Text style={{ color: c.tint, fontWeight: '600' }}>Open scheduler</Text>
          </Pressable>
        </Link>
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
  senderChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  divider: { height: 1, backgroundColor: 'transparent', marginVertical: 4 },
});
