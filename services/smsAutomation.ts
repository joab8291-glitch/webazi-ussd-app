/**
 * SMS → decode account ref → dial Sambaza USSD automation.
 * Uses native SmsListener + UssdExecutor modules.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';

import SmsListener from '../modules/sms-listener/src/SmsListenerModule';
import type { SmsReceivedPayload } from '../modules/sms-listener/src/SmsListener.types';

import UssdExecutor from '../modules/ussd-executor/src/UssdExecutorModule';

import { decodeAccountRef, extractAccountRef, extractReceipt, decodePaybillSms } from './accountRef';
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

/** True while a real delivery dial is in flight or queued — used by the
 * float-balance checker to avoid dialing over an active customer order. */
export function isDialQueueBusy(): boolean {
  return processingQueue || dialQueue.length > 0;
}

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
   * Two SMS shapes are supported, tried in this order:
   *  1. The compact website-checkout ref ("for account S/A…") generated by
   *     buildAccountRef() on the Webazi sites.
   *  2. A manual Paybill payment, where the customer types their own phone
   *     number into the Account Number field prefixed with S or A
   *     ("Account Number S0729914983") and the amount is read straight off
   *     "KshX received" in the SMS body.
   * Whichever matches first wins; if neither does, the SMS goes to the
   * Unmatched bucket so a paid customer isn't silently lost.
   */
  const ref = extractAccountRef(event.body);
  let network: 'safaricom' | 'airtel';
  let amount: number;
  let phone: string; // local format, e.g. 0735830024
  let orderRef: string;

  const decoded = ref ? decodeAccountRef(ref) : null;

  if (decoded) {
    network = decoded.network;
    amount = decoded.amount;
    phone = decoded.phone;
    orderRef = ref!;
  } else {
    const paybill = decodePaybillSms(event.body);

    if (!paybill) {
      if (ref) {
        log('warn', `Found account ref "${ref}" but could not decode it — ignoring`);
      }

      useUnmatchedStore.getState().addUnmatched({
        sender: event.sender,
        subscriptionId: event.subscriptionId,
        body: event.body,
        reason: ref ? 'undecodable_ref' : 'no_ref',
        ref: ref ?? null,
      });

      logMessage({
        sender: event.sender,
        subscriptionId: event.subscriptionId,
        body: event.body,
        receivedAt,
        status: ref ? 'undecodable_ref' : 'no_ref',
        ref: ref ?? null,
        source,
      });

      return;
    }

    network = paybill.network;
    amount = paybill.amount;
    phone = paybill.phone;
    orderRef = paybill.ref;
  }

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
        ref: orderRef,
        source,
      });

      return;
    }
  }

  /**
   * Duplicate-payment guard rail — flags (doesn't block) an order whose
   * phone AND amount match another order placed within the last 10
   * minutes. This is separate from the receipt-based dedupe above: it
   * catches a different M-Pesa receipt for what's likely the same
   * customer typing their number twice, or a SIM-swap fraud attempt —
   * cases the receipt check can't see since the receipt differs. Legit
   * repeat customers exist, so this only flags for a human to glance at
   * on the Orders screen; it never stops delivery.
   */
  const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
  const possibleDuplicate = useTransactionStore
    .getState()
    .transactions.some(
      (t) =>
        t.phone === phone &&
        t.amount === amount &&
        Date.now() - new Date(t.createdAt).getTime() <= DUPLICATE_WINDOW_MS
    );

  if (possibleDuplicate) {
    log(
      'warn',
      `${phone} paid KES ${amount} again within 10 minutes — flagged as possible duplicate, still delivering`
    );
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
      ref: orderRef,
      source,
    });

    return;
  }

  const job = planFulfillment(phone, amount);

  if (!job) {
    log(
      'error',
      `Invalid phone or amount for ref ${orderRef} (phone=${phone}, amount=${amount})`
    );

    logMessage({
      sender: event.sender,
      subscriptionId: event.subscriptionId,
      body: event.body,
      receivedAt,
      status: 'invalid',
      ref: orderRef,
      source,
    });

    return;
  }

  log(
    'success',
    `Decoded ${orderRef} → ${network} KES ${amount} to ${phone}. ${job.summary}`,
    { amount, phone }
  );

  const txnId = useTransactionStore.getState().addPending({
    ref: orderRef,
    receipt,
    network,
    phone,
    amount,
    possibleDuplicate,
  });

  logMessage({
    sender: event.sender,
    subscriptionId: event.subscriptionId,
    body: event.body,
    receivedAt,
    status: 'queued',
    ref: orderRef,
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
      `${job.summary} added to USSD queue (${dialQueue.length} pending)`,
      { amount: job.amount, phone: job.phone }
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
        `Dialing ${dial.label} on ${job.network} execution SIM → ${dial.ussdCode}`,
        { amount: dial.amount, phone: job.phone }
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
        `${dial.label} confirmed by USSD (${outcome.result || 'sent'})`,
        { amount: dial.amount, phone: job.phone }
      );
    }

    if (allOk) {
      log(
        'success',
        `KES ${job.amount} delivered to ${job.phone} (${job.network})`,
        { amount: job.amount, phone: job.phone }
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
        `Delivery failed for ${job.phone} (${job.network} KES ${job.amount}): ${failReason}`,
        { amount: job.amount, phone: job.phone }
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

/**
 * If auto-retry is enabled in Settings, schedule another attempt for a
 * failed order using the configured backoff — attempt 2 fires after
 * backoffMs[0], attempt 3 after backoffMs[1], and so on. Once attempts
 * exceed the backoff array length, the order is left failed (and
 * already notified via WhatsApp/Activity log) instead of retrying
 * forever. Re-checks the transaction at fire time in case it was
 * deleted, manually requeued, or resolved in the meantime.
 */
function scheduleAutoRetry(job: DialJob) {
  const settings = useAppSettingsStore.getState();

  if (!settings.autoRetryEnabled) {
    return;
  }

  const txn = useTransactionStore.getState().transactions.find((t) => t.id === job.txnId);
  const backoff = settings.autoRetryBackoffMs;

  // attempts=1 is the original dial; attempts=2 is the first retry, so
  // backoff[attempts - 1] is the delay before the *next* attempt.
  if (!txn || txn.status !== 'failed' || txn.attempts > backoff.length) {
    return;
  }

  const delayMs = backoff[txn.attempts - 1];
  if (delayMs == null) {
    useActivityStore
      .getState()
      .addLog(
        'warn',
        `${job.phone}: auto-retry attempts exhausted (${txn.attempts}/${backoff.length}) — left failed`,
        { amount: job.amount, phone: job.phone }
      );
    return;
  }

  useActivityStore
    .getState()
    .addLog(
      'info',
      `Auto-retry scheduled for ${job.phone} in ${Math.round(delayMs / 1000)}s (attempt ${
        txn.attempts + 1
      }/${backoff.length + 1})`,
      { amount: job.amount, phone: job.phone }
    );

  setTimeout(() => {
    const latest = useTransactionStore.getState().transactions.find((t) => t.id === job.txnId);

    if (!latest || latest.status !== 'failed') {
      return;
    }

    void retryDelivery(latest);
  }, delayMs);
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

  const job = planFulfillment(txn.phone, txn.amount);

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

  const job = planFulfillment(phone, amount);

  if (!job) {
    const reason = `Invalid phone or amount (phone=${phone}, amount=${amount})`;
    log('error', reason);
    return { ok: false, reason };
  }

  log('info', `Manual delivery: ${network} KES ${amount} to ${phone}. ${job.summary}`, {
    amount,
    phone,
  });

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