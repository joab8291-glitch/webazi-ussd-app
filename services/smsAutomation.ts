
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
import { useUnmatchedStore } from '../store/useUnmatchedStoppSettingsStore } from '../store/useAppSettingsStore';

import { notifyWhatsApp } from './whatsapp';

let smsSubscription: EventSubscription | null = null;

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
              network,
              phone,
              amount,
              deliveredAmount: 0,
              status: 'pending',
              dialResults: [],
              failureReason: null,
              attempts: 1,
              createdAt: now,
              updatedAt: now,
            },
            ...s.transactions,
          ],
        }));

        return id;
      },

      recordDialResult: (id, dial) => {
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  dialResults: [...t.dialResults, dial],
                  deliveredAmount: dial.success
                    ? t.deliveredAmount + dial.amount
                    : t.deliveredAmount,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }));
      },

      markCompleted: (id) => {
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: 'completed',
                  failureReason: null,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }));
      },

      markFailed: (id, reason) => {
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: 'failed',
                  failureReason: reason,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }));
      },

      bumpAttempts: (id) => {
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id ? { ...t, attempts: t.attempts + 1 } : t
          ),
        }));
      },

      deleteTransaction: (id) => {
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
      },

      purgeOlderThan: (days) => {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        set((s) => ({ transactions: s.transactions.filter((t) => t.status === 'pending' || new Date(t.createdAt).getTime() >= cutoff) }));
      },
    }),
    {
      name: 'webazi-transaction-store',

      storage: {
        getItem: async (name) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },

        setItem: async (name, value) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },

        removeItem: async (name) => {
          await AsyncStorage.removeItem(name);
        },
     
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
  } catch {
    // Ignore cleanup errors.
  }

  useSimStore.getState().setSmsListening(false);

  useActivityStore
    .getState()
    .addLog('info', 'SMS listener stopped');
}

/**
 * Handle an incoming SMS.
 */
function handleSms(event: SmsReceivedPayload) {
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

  const trustedSenders = useAppSettingsStore.getState().trustedSenders;
  const sender = String(event.sender ?? '');
  if (!trustedSenders.some((name) => sender.toLowerCase().includes(name.toLowerCase()))) {
    log('warn', `Ignoring SMS from untrusted sender: ${sender}`);
    return;
  }

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

    return;
  }

  const { network, amount, phone } = decoded;

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

    return;
  }

  const job = planFulfillment(toMsisdn(phone), amount);

  if (!job) {
    log(
      'error',
      `Invalid phone or amount for ref ${ref} (phone=${phone}, amount=${amount})`
    );

    return;
  }

  log(
    'success',
    `Decoded ${ref} → ${network} KES ${amount} to ${phone}. ${job.summary}`
  );

  const receipt = extractReceipt(event.body);

  const txnId = useTransactionStore.getState().addPending({
    ref,
    receipt,
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

  try {
    /**
     * Request permission to make phone calls.
     */
    const callOk = await requestCallPermission();

    if (!callOk) {
      log('error', 'CALL_PHONE denied');
      txnStore.markFailed(job.txnId, 'CALL_PHONE permission denied');
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

    let allOk = true;
    let failReason = '';
    const settings = useAppSettingsStore.getState();
    if (settings.autoCloseUssdDialogs && typeof (UssdExecutor as any).closeLingeringUssdDialog === 'function') { try { (UssdExecutor as any).closeLingeringUssdDialog(); } catch {} }
    if (settings.keepScreenAwakeDuringDial && typeof (UssdExecutor as any).acquireDialWakeLock === 'function') { try { (UssdExecutor as any).acquireDialWakeLock(); } catch {} }
    try {
      for (const dial of job.dials) {
        log('info', `Dialing ${dial.label} on ${job.network} execution SIM → ${dial.ussdCode}`);
        if (settings.autoCloseUssdDialogs && typeof (UssdExecutor as any).closeLingeringUssdDialog === 'function') { try { (UssdExecutor as any).closeLingeringUssdDialog(); } catch {} }
        const outcome = await dialWithTimeout(dial.ussdCode, job.executionSubId, [], settings.ussdTimeoutMs);
        const dialResult: DialResult = { ussdCode: dial.ussdCode, amount: dial.amount, success: outcome.success, result: outcome.result };
        txnStore.recordDialResult(job.txnId, dialResult);
        if (!outcome.success) { allOk=false; failReason=`${dial.label} failed: ${outcome.result}`; log('error',failReason); break; }
        log('success', `${dial.label} confirmed by USSD (${outcome.result || 'sent'})`);
      }
    } finally {
      if (settings.keepScreenAwakeDuringDial && typeof (UssdExecutor as any).releaseDialWakeLock === 'function') { try { (UssdExecutor as any).releaseDialWakeLock(); } catch {} }
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
      if (settings.autoRetryEnabled) {
        const current = useTransactionStore.getState().transactions.find((t) => t.id === job.txnId);
        if (current && current.attempts < 3) {
          log('warn', `Scheduling automatic retry ${current.attempts + 1}/3 in ${Math.round(settings.autoRetryDelayMs / 1000)}s`);
          setTimeout(() => {
            const latest = useTransactionStore.getState().transactions.find((t) => t.id === job.txnId);
            if (latest && latest.attempts < 3) void retryDelivery(latest);
          }, settings.autoRetryDelayMs);
        }
      }

      await notifyWhatsApp({
        to: job.phone,
        template: 'delivery_failed',
        planName: `${job.network} airtime KES ${job.amount}`,
        reason: failReason,
      }).catch(() => {});
    }
  } catch (e: any) {
    const reason = String(e?.message ?? e);

    log('error', `autoDial error: ${reason}`);

    txnStore.markFailed(job.txnId, reason);
  }
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
