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
import { useAppSettingsStore } from '@/store/useAppSettingsStore';
import { refreshSimSlots } from '@/services/smsAutomation';
import { manualDial } from '@/services/smsAutomation';
import { scanMissedMessages } from '@/services/missedMessages';
import { Link } from 'expo-router';
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
  const appSettings = useAppSettingsStore();

  const [testCode, setTestCode] = useState('*334#');
  const [a11y, setA11y] = useState<boolean | null>(null);
  const [newSender, setNewSender] = useState('');
  const [scanning, setScanning] = useState(false);

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
