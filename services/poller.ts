/**
 * Backend transaction poller.
 *
 * Flow:
 *   1. GET pending payments from https://webazi-digital-solutions.onrender.com
 *   2. For each: plan Sambaza dials for the REMAINING amount only
 *      (amount - delivered_amount), so a retry never re-sends airtime
 *      that was already successfully delivered in a prior attempt.
 *   3. Dial each chunk from the till SIM via UssdExecutor
 *   4. Report progress to the server after EVERY successful chunk —
 *      not just at the end — so partial progress survives even if the
 *      app crashes or the poll cycle is interrupted mid-transaction.
 *   5. Only mark complete when the full original amount has been delivered.
 */

import { fetchPending, reportComplete, reportFail, reportProgress } from './api';
import { planFulfillment } from './offerMatcher';
import UssdExecutor from '../modules/ussd-executor/src/UssdExecutorModule';
import { useSimStore } from '../store/useSimStore';
import { useActivityStore } from '../store/useActivityStore';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

const DELAY_BETWEEN_DIALS_MS = 4000;
const USSD_TIMEOUT_MS = 45_000;

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

  const log = useActivityStore.getState().addLog;

  try {
    const pending = await fetchPending();
    const tillSubId = useSimStore.getState().tillSubscriptionId;

    if (tillSubId == null) {
      processing = false;
      return;
    }

    if (!pending?.length) {
      processing = false;
      return;
    }

    log('info', `Processing ${pending.length} pending payment(s)`);

    for (const txn of pending) {
      const alreadyDelivered = txn.delivered_amount ?? 0;
      const remaining = txn.amount - alreadyDelivered;

      // Safety net: if a previous cycle already delivered the full amount but
      // the status update to "completed" never landed (e.g. app crash), fix it now
      // instead of dialing again.
      if (remaining <= 0) {
        await reportComplete(txn.id).catch((e) =>
          log('error', `reportComplete (already fulfilled) failed: ${String(e)}`)
        );
        log('success', `Txn #${txn.id} was already fully delivered — marked complete`);
        continue;
      }

      const job = planFulfillment(txn.phone, remaining);

      if (!job) {
        const reason = `Invalid phone or amount (phone=${txn.phone}, remaining=${remaining})`;
        await reportFail(txn.id, reason).catch(() => {});
        log('error', reason);
        continue;
      }

      log(
        'info',
        `Txn #${txn.id}: ${job.summary} (already delivered KES ${alreadyDelivered} of ${txn.amount})`
      );

      if (!UssdExecutor.isAccessibilityEnabled()) {
        const reason = 'Accessibility service not enabled — cannot dial USSD';
        await reportFail(txn.id, reason).catch(() => {});
        log('error', reason);
        continue;
      }

      let allOk = true;
      let failReason = '';
      let cumulativeDelivered = alreadyDelivered;

      for (const dial of job.dials) {
        log('info', `Dialing ${dial.label} → ${dial.ussdCode}`);

        const outcome = await dialWithTimeout(
          dial.ussdCode,
          tillSubId,
          [],
          USSD_TIMEOUT_MS
        );

        if (outcome.success) {
          cumulativeDelivered += dial.amount;

          // Persist progress immediately — this is the fix. Even if the app
          // crashes right after this line, the server knows exactly how much
          // was already sent, so a retry can never double-deliver.
          await reportProgress(txn.id, cumulativeDelivered).catch((e) =>
            log('error', `reportProgress failed: ${String(e)}`)
          );

          log('success', `${dial.label} OK (${outcome.result || 'sent'})`);
        } else {
          allOk = false;
          failReason = `${dial.label} failed: ${outcome.result}`;
          log('error', failReason);
          break;
        }

        if (dial !== job.dials[job.dials.length - 1]) {
          await sleep(DELAY_BETWEEN_DIALS_MS);
        }
      }

      if (allOk) {
        await reportComplete(txn.id).catch((e) =>
          log('error', `reportComplete failed: ${String(e)}`)
        );
        log(
          'success',
          `Txn #${txn.id} complete — Sambaza KES ${cumulativeDelivered} total to ${job.plan.phone}`
        );
      } else {
        const reason = `Delivered KES ${cumulativeDelivered}/${txn.amount} so far. ${failReason}`;
        await reportFail(txn.id, reason).catch(() => {});
        log('error', `Txn #${txn.id} failed: ${reason}`);
      }

      await sleep(DELAY_BETWEEN_DIALS_MS);
    }
  } catch (e: any) {
    useActivityStore
      .getState()
      .addLog('error', `Poll cycle error: ${String(e?.message ?? e)}`);
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