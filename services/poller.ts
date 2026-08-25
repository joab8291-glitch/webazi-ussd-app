/**
 * Backend transaction poller.
 *
 * Flow:
 *   1. GET pending payments from the backend.
 *   2. Calculate only the REMAINING amount.
 *   3. Dial each Sambaza chunk from the selected till SIM.
 *   4. A chunk counts as delivered ONLY when the native USSD executor
 *      explicitly reports a confirmed successful Safaricom response.
 *   5. Persist progress after EVERY successful chunk.
 *   6. Progress must be confirmed by the backend before continuing.
 *   7. Only mark the transaction completed when the full amount is confirmed.
 */

import {
  fetchPending,
  reportComplete,
  reportFail,
  reportProgress,
} from './api';

import { planFulfillment } from './offerMatcher';

import UssdExecutor from '../modules/ussd-executor/src/UssdExecutorModule';

import { useSimStore } from '../store/useSimStore';
import { useActivityStore } from '../store/useActivityStore';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

const DELAY_BETWEEN_DIALS_MS = 4000;
const USSD_TIMEOUT_MS = 45_000;

/**
 * Number of times we retry saving successful progress to the backend.
 *
 * This protects against a short network/Render interruption immediately
 * after airtime was actually sent.
 */
const PROGRESS_RETRIES = 3;
const PROGRESS_RETRY_DELAY_MS = 2000;

export function startPolling(intervalMs: number = 8000) {
  if (pollTimer) return;

  pollTimer = setInterval(runPollCycle, intervalMs);

  // Run immediately instead of waiting for the first interval.
  void runPollCycle();

  useActivityStore
    .getState()
    .addLog('info', 'Backend poller started');
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
  }

  pollTimer = null;

  useActivityStore
    .getState()
    .addLog('info', 'Backend poller stopped');
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

    const tillSubId =
      useSimStore.getState().tillSubscriptionId;

    if (tillSubId == null) {
      log(
        'error',
        'Poller cannot process transactions: no till SIM selected'
      );
      return;
    }

    if (!pending?.length) {
      return;
    }

    log(
      'info',
      `Processing ${pending.length} pending payment(s)`
    );

    for (const txn of pending) {
      const alreadyDelivered = Math.max(
        0,
        Number(txn.delivered_amount ?? 0)
      );

      const transactionAmount = Math.max(
        0,
        Number(txn.amount)
      );

      const remaining =
        transactionAmount - alreadyDelivered;

      /*
       * Safety check.
       *
       * If the backend already says the entire amount was delivered,
       * DO NOT dial again.
       */
      if (remaining <= 0) {
        if (alreadyDelivered >= transactionAmount) {
          try {
            await reportComplete(txn.id);

            log(
              'success',
              `Txn #${txn.id} already has full delivery recorded — marked complete`
            );
          } catch (e) {
            log(
              'error',
              `Txn #${txn.id}: could not confirm completion: ${String(e)}`
            );
          }
        }

        continue;
      }

      const job = planFulfillment(
        txn.phone,
        remaining
      );

      if (!job) {
        const reason =
          `Invalid phone or amount ` +
          `(phone=${txn.phone}, remaining=${remaining})`;

        try {
          await reportFail(txn.id, reason);
        } catch (e) {
          log(
            'error',
            `Txn #${txn.id}: failed to report invalid transaction: ${String(e)}`
          );
        }

        log('error', reason);
        continue;
      }

      log(
        'info',
        `Txn #${txn.id}: ${job.summary} ` +
        `(already delivered KES ${alreadyDelivered} ` +
        `of ${transactionAmount})`
      );

      if (!UssdExecutor.isAccessibilityEnabled()) {
        const reason =
          'Accessibility service not enabled — cannot dial USSD';

        try {
          await reportFail(txn.id, reason);
        } catch (e) {
          log(
            'error',
            `Txn #${txn.id}: failed to report accessibility failure: ${String(e)}`
          );
        }

        log('error', reason);
        continue;
      }

      let allOk = true;
      let failReason = '';
      let cumulativeDelivered = alreadyDelivered;

      for (const dial of job.dials) {
        log(
          'info',
          `Dialing ${dial.label} → ${dial.ussdCode}`
        );

        const outcome = await dialWithTimeout(
          dial.ussdCode,
          tillSubId,
          [],
          USSD_TIMEOUT_MS
        );

        /*
         * The native module now returns success=true ONLY for a confirmed
         * Safaricom Sambaza success response.
         */
        if (!outcome.success) {
          allOk = false;

          failReason =
            `${dial.label} failed: ${outcome.result}`;

          log('error', failReason);

          break;
        }

        /*
         * USSD explicitly confirmed successful delivery.
         */
        cumulativeDelivered += dial.amount;

        log(
          'success',
          `${dial.label} confirmed by USSD ` +
          `(${outcome.result || 'sent'})`
        );

        /*
         * CRITICAL:
         *
         * Do not silently ignore a failed progress update.
         *
         * If the airtime was sent but the backend does not record the
         * progress, continuing to another chunk could make recovery
         * unsafe.
         */
        const progressSaved =
          await reportProgressWithRetry(
            txn.id,
            cumulativeDelivered,
            log
          );

        if (!progressSaved) {
          allOk = false;

          failReason =
            `USSD confirmed KES ${dial.amount} delivered, ` +
            `but the backend could not confirm progress ` +
            `(${cumulativeDelivered}/${transactionAmount}). ` +
            `Processing stopped to prevent another automatic dial.`;

          log('error', failReason);

          /*
           * IMPORTANT:
           *
           * We deliberately DO NOT call reportFail() here.
           *
           * The airtime may already have been delivered.
           * Automatically changing this to retry could cause the same
           * airtime to be sent again.
           *
           * Stop the poller so another cycle cannot immediately redial it.
           */
          stopPolling();

          break;
        }

        /*
         * Only continue to another Sambaza chunk after the backend has
         * confirmed the previous chunk's progress.
         */
        if (
          dial !==
          job.dials[job.dials.length - 1]
        ) {
          await sleep(
            DELAY_BETWEEN_DIALS_MS
          );
        }
      }

      /*
       * All dials succeeded and every progress update was confirmed.
       */
      if (allOk) {
        /*
         * Final safety check.
         *
         * Never call /complete merely because the loop finished.
         * The recorded delivered amount MUST equal the original amount.
         */
        if (
          cumulativeDelivered <
          transactionAmount
        ) {
          const reason =
            `Fulfillment ended without full delivery: ` +
            `${cumulativeDelivered}/${transactionAmount}`;

          log('error', reason);

          try {
            await reportFail(txn.id, reason);
          } catch (e) {
            log(
              'error',
              `Txn #${txn.id}: failed to report incomplete fulfillment: ${String(e)}`
            );
          }

          continue;
        }

        try {
          await reportComplete(txn.id);

          log(
            'success',
            `Txn #${txn.id} COMPLETE — ` +
            `Sambaza KES ${cumulativeDelivered} total ` +
            `to ${job.plan.phone}`
          );
        } catch (e) {
          /*
           * Do NOT pretend completion succeeded.
           *
           * Progress has already been saved, so the next poll cycle can
           * hit the remaining<=0 safety branch and attempt completion
           * again without redialing the airtime.
           */
          log(
            'error',
            `Txn #${txn.id}: reportComplete failed: ${String(e)}`
          );
        }
      } else if (failReason) {
        /*
         * Normal USSD failure.
         *
         * This is different from a progress-server failure.
         *
         * If the carrier explicitly rejected the dial, it is safe to
         * report the transaction as failed/retryable according to the
         * backend's rules.
         */
        if (
          !failReason.includes(
            'backend could not confirm progress'
          )
        ) {
          try {
            const reason =
              `Delivered KES ${cumulativeDelivered}/` +
              `${transactionAmount} so far. ` +
              `${failReason}`;

            await reportFail(txn.id, reason);

            log(
              'error',
              `Txn #${txn.id} failed: ${reason}`
            );
          } catch (e) {
            log(
              'error',
              `Txn #${txn.id}: failed to report failure: ${String(e)}`
            );
          }
        }
      }

      /*
       * Give the carrier/dialer time to settle before the next transaction.
       */
      if (isPolling()) {
        await sleep(
          DELAY_BETWEEN_DIALS_MS
        );
      }
    }
  } catch (e: any) {
    log(
      'error',
      `Poll cycle error: ${String(e?.message ?? e)}`
    );
  } finally {
    processing = false;
  }
}

/**
 * Save delivered progress with retries.
 */
async function reportProgressWithRetry(
  transactionId: number,
  deliveredAmount: number,
  log: (level: any, message: string) => void
): Promise<boolean> {
  for (
    let attempt = 1;
    attempt <= PROGRESS_RETRIES;
    attempt++
  ) {
    try {
      await reportProgress(
        transactionId,
        deliveredAmount
      );

      log(
        'info',
        `Txn #${transactionId}: backend confirmed ` +
        `delivered_amount=${deliveredAmount}`
      );

      return true;
    } catch (e) {
      log(
        'error',
        `Txn #${transactionId}: progress update ` +
        `attempt ${attempt}/${PROGRESS_RETRIES} failed: ${String(e)}`
      );

      if (attempt < PROGRESS_RETRIES) {
        await sleep(
          PROGRESS_RETRY_DELAY_MS
        );
      }
    }
  }

  return false;
}

function dialWithTimeout(
  ussdCode: string,
  subscriptionId: number,
  menuInputs: string[],
  timeoutMs: number
): Promise<{
  success: boolean;
  result: string;
}> {
  return new Promise((resolve) => {
    let settled = false;

    let subscription:
      ReturnType<typeof UssdExecutor.addListener> | null =
      null;

    const finish = (
      success: boolean,
      result: string
    ) => {
      if (settled) return;

      settled = true;

      try {
        subscription?.remove();
      } catch (_) {}

      clearTimeout(timer);

      resolve({
        success,
        result,
      });
    };

    subscription =
      UssdExecutor.addListener(
        'onUssdResult',
        (event: any) => {
          finish(
            Boolean(event?.success),
            String(event?.result ?? '')
          );
        }
      );

    const timer = setTimeout(() => {
      finish(
        false,
        'Timed out waiting for USSD response'
      );
    }, timeoutMs);

    try {
      UssdExecutor.dialUssd(
        ussdCode,
        subscriptionId,
        menuInputs
      );
    } catch (e: any) {
      finish(
        false,
        String(e?.message ?? e)
      );
    }
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) =>
    setTimeout(resolve, ms)
  );
}