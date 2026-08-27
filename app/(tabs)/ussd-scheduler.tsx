import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScheduleStore } from '@/store/useScheduleStore';
import type { ScheduledDial, ScheduleRecurrence } from '@/store/useScheduleStore';

type Network = 'safaricom' | 'airtel';

const RECURRENCES: { key: ScheduleRecurrence; label: string }[] = [
  { key: 'once', label: 'Once' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
];

export default function UssdSchedulerScreen() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];
  const insets = useSafeAreaInsets();
  const [showForm, setShowForm] = useState(false);

  const items = useScheduleStore((s) => s.items);
  const removeSchedule = useScheduleStore((s) => s.removeSchedule);
  const setActive = useScheduleStore((s) => s.setActive);

  const handleDelete = (item: ScheduledDial) => {
    Alert.alert('Delete schedule?', item.label || `${item.phone} · KES ${item.amount}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeSchedule(item.id) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top + 8 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ color: c.tint, fontSize: 16 }}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: c.text }]}>USSD Scheduler</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 100 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 4 }}>
            <Text style={{ color: c.textSecondary, fontSize: 13 }}>
              Runs only while the app is open — a schedule due while the app was closed fires as soon
              as you reopen it.
            </Text>
            <Pressable
              onPress={() => setShowForm((v) => !v)}
              style={[styles.outlineBtn, { borderColor: c.border }]}>
              <Text style={{ color: c.tint, fontWeight: '600' }}>
                {showForm ? 'Hide form' : '+ New schedule'}
              </Text>
            </Pressable>
            {showForm && <ScheduleForm colors={c} onDone={() => setShowForm(false)} />}
          </View>
        }
        ListEmptyComponent={
          <Text style={{ color: c.muted, textAlign: 'center', marginTop: 20 }}>
            No scheduled USSDs yet
          </Text>
        }
        renderItem={({ item }) => (
          <ScheduleCard
            item={item}
            colors={c}
            onDelete={() => handleDelete(item)}
            onToggleActive={(v) => setActive(item.id, v)}
          />
        )}
      />
    </View>
  );
}

function ScheduleForm({
  colors,
  onDone,
}: {
  colors: (typeof Colors)['light'];
  onDone: () => void;
}) {
  const addSchedule = useScheduleStore((s) => s.addSchedule);

  const now = new Date();
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState<Network>('safaricom');
  const [date, setDate] = useState(now.toISOString().slice(0, 10)); // YYYY-MM-DD
  const [time, setTime] = useState(
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  );
  const [recurrence, setRecurrence] = useState<ScheduleRecurrence>('once');
  const [limit, setLimit] = useState('');

  const submit = () => {
    const amt = Number(amount);
    if (!phone.trim() || !Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Check the form', 'Enter a valid phone number and amount.');
      return;
    }

    const runAt = new Date(`${date}T${time}:00`);
    if (isNaN(runAt.getTime())) {
      Alert.alert('Check the date/time', 'Use format YYYY-MM-DD and HH:MM.');
      return;
    }

    const limitNum = limit.trim() ? Number(limit) : null;

    addSchedule({
      label: label.trim() || `${network} KES ${amt} to ${phone.trim()}`,
      phone: phone.trim(),
      amount: amt,
      network,
      runAt: runAt.toISOString(),
      recurrence,
      limit: limitNum && limitNum > 0 ? limitNum : null,
    });

    setLabel('');
    setPhone('');
    setAmount('');
    setLimit('');
    onDone();
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Label (optional)</Text>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Short label to identify this schedule"
        placeholderTextColor={colors.muted}
        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['safaricom', 'airtel'] as Network[]).map((n) => (
          <Pressable
            key={n}
            onPress={() => setNetwork(n)}
            style={[
              styles.netChip,
              {
                borderColor: colors.border,
                backgroundColor: network === n ? colors.tint : colors.background,
              },
            ]}>
            <Text
              style={{
                color: network === n ? '#fff' : colors.textSecondary,
                fontWeight: '600',
                fontSize: 12,
                textTransform: 'capitalize',
              }}>
              {n}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Phone (07XXXXXXXX)"
        placeholderTextColor={colors.muted}
        keyboardType="phone-pad"
        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
      />
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Amount (KES)"
        placeholderTextColor={colors.muted}
        keyboardType="numeric"
        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Date</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Time</Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          />
        </View>
      </View>

      <Text style={[styles.label, { color: colors.textSecondary }]}>Recurrence</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {RECURRENCES.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRecurrence(r.key)}
            style={[
              styles.netChip,
              {
                borderColor: colors.border,
                backgroundColor: recurrence === r.key ? colors.tint : colors.background,
              },
            ]}>
            <Text
              style={{
                color: recurrence === r.key ? '#fff' : colors.textSecondary,
                fontWeight: '600',
                fontSize: 12,
              }}>
              {r.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {recurrence !== 'once' && (
        <>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Limit (optional, total runs)</Text>
          <TextInput
            value={limit}
            onChangeText={setLimit}
            placeholder="Leave blank for unlimited"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          />
        </>
      )}

      <Pressable onPress={submit} style={[styles.primaryBtn, { backgroundColor: colors.tint }]}>
        <Text style={styles.primaryBtnText}>Schedule</Text>
      </Pressable>
    </View>
  );
}

function ScheduleCard({
  item,
  colors,
  onDelete,
  onToggleActive,
}: {
  item: ScheduledDial;
  colors: (typeof Colors)['light'];
  onDelete: () => void;
  onToggleActive: (v: boolean) => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {item.label}
        </Text>
        <Switch
          value={item.active}
          onValueChange={onToggleActive}
          trackColor={{ true: colors.tint, false: colors.border }}
        />
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
        {item.network} · KES {item.amount} · {item.phone}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Next run: {new Date(item.runAt).toLocaleString()} · {item.recurrence}
        {item.limit != null ? ` · limit ${item.limit}` : ''}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Runs so far: {item.runsCompleted}
        {item.lastRunAt ? ` · last: ${new Date(item.lastRunAt).toLocaleString()}` : ''}
      </Text>
      {item.lastRunResult && (
        <Text style={{ color: colors.muted, fontSize: 12 }}>Result: {item.lastRunResult}</Text>
      )}
      <Pressable
        onPress={onDelete}
        style={[styles.outlineBtn, { borderColor: colors.border, alignSelf: 'flex-start', marginTop: 4 }]}>
        <Text style={{ color: colors.error, fontSize: 12, fontWeight: '600' }}>Delete</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '800' },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outlineBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  primaryBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  label: { fontSize: 12, fontWeight: '600' },
  netChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
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
