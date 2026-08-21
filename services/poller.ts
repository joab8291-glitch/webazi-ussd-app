/**
 * Backend transaction poller.
 *
 * Flow:
 *   1. GET pending payments from https://webazi-digital-solutions.onrender.com
 *   2. For each: plan Sambaza dials (split if amount > 10,000)
 *   3. Dial each chunk from the till SIM via UssdExecutor
 *   4. Only mark complete when ALL chunks succeed; otherwise report fail
 */

import { fetchPending, reportComplete, reportFail } from './api';
import { planFulfillment } from './offerMatcher';
import UssdExecutor from '../modules/ussd-executor/src/UssdExecutorModule';
import { useSimStore } from '../store/useSimStore';
import { useActivityStore } from '../store/useActivityStore';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

/** Pause between successive Sambaza dials (ms) — avoid dialer contention */
const DELAY_BETWEEN_DIALS_MS = 4000;
/** Max wait for one USSD result */
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
      const job = planFulfillment(txn.phone, txn.amount);

      if (!job) {
        const reason = `Invalid phone or amount (phone=${txn.phone}, amount=${txn.amount})`;
        await reportFail(txn.id, reason).catch(() => {});
        log('error', reason);
        continue;
      }

      log('info', `Txn #${txn.id}: ${job.summary}`);

      if (!UssdExecutor.isAccessibilityEnabled()) {
        const reason = 'Accessibility service not enabled — cannot dial USSD';
        await reportFail(txn.id, reason).catch(() => {});
        log('error', reason);
        continue;
      }

      // Run every Sambaza chunk in order
      let allOk = true;
      let failReason = '';
      let delivered = 0;

      for (const dial of job.dials) {
        log('info', `Dialing ${dial.label} → ${dial.ussdCode}`);

        const outcome = await dialWithTimeout(
          dial.ussdCode,
          tillSubId,
          [], // Sambaza *140*phone*amount# is usually single-shot (no menu)
          USSD_TIMEOUT_MS
        );

        if (outcome.success) {
          delivered += dial.amount;
          log('success', `${dial.label} OK (${outcome.result || 'sent'})`);
        } else {
          allOk = false;
          failReason = `${dial.label} failed: ${outcome.result}`;
          log('error', failReason);
          break; // stop remaining chunks for this txn
        }

        // Pause before next chunk of the same payment
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
          `Txn #${txn.id} complete — Sambaza KES ${delivered} to ${job.plan.phone}`
        );
      } else {
        const reason =
          delivered > 0
            ? `Partial: delivered KES ${delivered}/${job.plan.totalAmount}. ${failReason}`
            : failReason;
        await reportFail(txn.id, reason).catch(() => {});
        log('error', `Txn #${txn.id} failed: ${reason}`);
      }

      // Pause between different customers
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
