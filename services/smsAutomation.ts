/**
 * SMS → match plan → auto-dial USSD automation.
 * Uses native SmsListener + UssdExecutor modules.
 */

import { Platform, PermissionsAndroid } from 'react-native';
import type { EventSubscription } from 'expo-modules-core';
import SmsListener from '../modules/sms-listener/src/SmsListenerModule';
import type { SmsReceivedPayload } from '../modules/sms-listener/src/SmsListener.types';
import UssdExecutor from '../modules/ussd-executor/src/UssdExecutorModule';
import { processIncomingSms } from '../modules/offer-matcher/matcher';
import type { DataPlan } from '../modules/offer-matcher/types';
import { useSimStore } from '../store/useSimStore';
import { useActivityStore } from '../store/useActivityStore';
import { notifyWhatsApp } from './whatsapp';

let smsSubscription: EventSubscription | null = null;
let dialing = false;

export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.READ_SMS,
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
    PermissionsAndroid.PERMISSIONS.READ_PHONE_NUMBERS,
  ]);
  return Object.values(granted).every((s) => s === PermissionsAndroid.RESULTS.GRANTED);
}

export async function requestCallPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE, {
    title: 'Phone Call Permission',
    message: 'Webazi needs permission to dial USSD codes for data delivery.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

export function refreshSimSlots() {
  try {
    const slots = SmsListener.getSimSlots();
    useSimStore.getState().setAvailableSims(slots ?? []);
    return slots;
  } catch (e: any) {
    useActivityStore.getState().addLog('error', `getSimSlots failed: ${String(e?.message ?? e)}`);
    return [];
  }
}

export async function startSmsListening(): Promise<boolean> {
  const ok = await requestSmsPermissions();
  if (!ok) {
    useActivityStore.getState().addLog('error', 'SMS permissions denied');
    return false;
  }

  if (smsSubscription) return true;

  try {
    SmsListener.startListening();
    smsSubscription = SmsListener.addListener('onSmsReceived', handleSms);
    useSimStore.getState().setSmsListening(true);
    useActivityStore.getState().addLog('success', 'SMS listener active');
    return true;
  } catch (e: any) {
    useActivityStore.getState().addLog('error', `startListening failed: ${String(e?.message ?? e)}`);
    return false;
  }
}

export function stopSmsListening() {
  try {
    if (smsSubscription) {
      smsSubscription.remove();
      smsSubscription = null;
    }
    SmsListener.stopListening();
  } catch {
    // ignore
  }
  useSimStore.getState().setSmsListening(false);
  useActivityStore.getState().addLog('info', 'SMS listener stopped');
}

function handleSms(event: SmsReceivedPayload) {
  const log = useActivityStore.getState().addLog;

  const selectedSubscriptionId =
    useSimStore.getState().tillSubscriptionId;

  log(
    'info',
    `SMS from ${event.sender} on subscription ${event.subscriptionId}: ${event.body.slice(0, 80)}…`
  );

  if (selectedSubscriptionId == null) {
    log(
      'warn',
      'SMS received but no Till SIM is selected. Open Settings and select the Till SIM.'
    );
    return;
  }

  if (event.subscriptionId !== selectedSubscriptionId) {
    log(
      'info',
      `Ignoring SMS from subscription ${event.subscriptionId}; Till SIM is subscription ${selectedSubscriptionId}`
    );
    return;
  }

  const match = processIncomingSms(event.body);

  if (match.status === 'not_a_payment') return;

  if (match.status === 'no_match') {
    log(
      'warn',
      `Payment KES ${match.payment.amount} — no matching plan`
    );
    return;
  }

  if (match.status === 'missing_phone') {
    log(
      'warn',
      `Matched "${match.plan.name}" but no phone in SMS`
    );
    return;
  }

  log(
    'success',
    `Matched ${match.plan.name} → ${match.resolvedUssd} on Till subscription ${selectedSubscriptionId}`
  );

  autoDial(
    match.plan,
    match.resolvedUssd,
    match.payment.phone ?? undefined
  );
}
async function autoDial(plan: DataPlan, resolvedUssd: string, customerPhone?: string) {
  if (dialing) {
    useActivityStore.getState().addLog('warn', 'Dial already in progress — queued skip');
    return;
  }
  dialing = true;
  const log = useActivityStore.getState().addLog;

  try {
    const callOk = await requestCallPermission();
    if (!callOk) {
      log('error', 'CALL_PHONE denied');
      return;
    }

    if (!UssdExecutor.isAccessibilityEnabled()) {
      log('error', 'Enable Accessibility service for Webazi in system settings');
      UssdExecutor.openAccessibilitySettings();
      return;
    }

const subId = useSimStore.getState().tillSubscriptionId;

if (subId == null || subId < 0) {
  log('error', 'No Till SIM selected. Please select the SIM used for USSD delivery.');
  return;
}

    const outcome = await dialWithTimeout(resolvedUssd, subId, plan.followUpInputs, 30000);

    if (outcome.success) {
      log('success', `${plan.name} delivered: ${outcome.result || 'OK'}`);
      if (customerPhone) {
        await notifyWhatsApp({
          to: customerPhone,
          template: 'delivery_success',
          planName: plan.name,
        }).catch(() => {});
      }
    } else {
      log('error', `${plan.name} failed: ${outcome.result}`);
      if (customerPhone) {
        await notifyWhatsApp({
          to: customerPhone,
          template: 'delivery_failed',
          planName: plan.name,
          reason: outcome.result,
        }).catch(() => {});
      }
    }
  } catch (e: any) {
    log('error', `autoDial error: ${String(e?.message ?? e)}`);
  } finally {
    dialing = false;
  }
}

function dialWithTimeout(
  ussdCode: string,
  subscriptionId: number,
  menuInputs: string[],
  timeoutMs: number
): Promise<{ success: boolean; result: string }> {
  return new Promise((resolve) => {
    let settled = false;

    const subscription = UssdExecutor.addListener('onUssdResult', (event: any) => {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      resolve({
        success: Boolean(event?.success),
        result: String(event?.result ?? ''),
      });
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      subscription.remove();
      resolve({ success: false, result: 'Timed out waiting for USSD response' });
    }, timeoutMs);

    try {
      UssdExecutor.dialUssd(ussdCode, subscriptionId, menuInputs);
    } catch (e: any) {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      resolve({ success: false, result: String(e?.message ?? e) });
    }
  });
}

/** Manual test dial from UI */
export async function manualDial(ussdCode: string, menuInputs: string[] = []) {
  const callOk = await requestCallPermission();
  if (!callOk) throw new Error('CALL_PHONE denied');
  if (!UssdExecutor.isAccessibilityEnabled()) {
    UssdExecutor.openAccessibilitySettings();
    throw new Error('Accessibility service not enabled');
  }
const subId = useSimStore.getState().tillSubscriptionId;

if (subId == null || subId < 0) {
  throw new Error('No SIM selected for USSD dialing');
}

return dialWithTimeout(ussdCode, subId, menuInputs, 30000);
}
