import { fetchPending, reportComplete, reportFail } from './api';
import { matchOffer, buildUssdCode } from './offerMatcher';
import UssdExecutor from '../modules/ussd-executor/src/UssdExecutorModule';
import { useSimStore } from '../store/useSimStore';
import { useActivityStore } from '../store/useActivityStore';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

export function startPolling(intervalMs: number = 8000) {
  if (pollTimer) return;
  pollTimer = setInterval(runPollCycle, intervalMs);
  runPollCycle();
  useActivityStore.getState().addLog('info', 'Backend poller started');
}

export function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  useActivityStore.getState().addLog('info', 'Backend poller stopped');
}

export function isPolling(): boolean {
  return pollTimer != null;
}

async function runPollCycle() {
  if (processing) return;
  processing = true;

  try {
    const pending = await fetchPending();
    const tillSubId = useSimStore.getState().tillSubscriptionId;
    const log = useActivityStore.getState().addLog;

    if (tillSubId == null) {
      processing = false;
      return;
    }

    if (pending.length === 0) {
      processing = false;
      return;
    }

    log('info', `Processing ${pending.length} pending transaction(s)`);

    for (const txn of pending) {
      const offer = matchOffer(txn.amount);

      if (!offer) {
        const reason = `No matching offer for amount KES ${txn.amount}`;
        await reportFail(txn.id, reason).catch(() => {});
        log('warn', reason);
        continue;
      }

      if (!UssdExecutor.isAccessibilityEnabled()) {
        log('error', 'Accessibility service not enabled — cannot dial USSD');
        await reportFail(txn.id, 'Accessibility service disabled').catch(() => {});
        continue;
      }

      const ussdCode = buildUssdCode(offer, txn.phone);
      log('info', `Dialing ${offer.label} → ${ussdCode} for ${txn.phone}`);

      const outcome = await dialWithTimeout(ussdCode, tillSubId, offer.menuInputs, 30000);

      if (outcome.success) {
        await reportComplete(txn.id).catch((e) =>
          log('error', `reportComplete failed: ${String(e)}`)
        );
        log('success', `Completed txn #${txn.id} (${offer.label})`);
      } else {
        await reportFail(txn.id, outcome.result).catch(() => {});
        log('error', `Failed txn #${txn.id}: ${outcome.result}`);
      }

      // Pause between dials to avoid dialer contention
      await sleep(3000);
    }
  } catch (e: any) {
    useActivityStore.getState().addLog('error', `Poll cycle error: ${String(e?.message ?? e)}`);
  }

  processing = false;
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
