import { fetchPending, reportComplete, reportFail } from './api';
import { matchOffer, buildUssdCode } from './offerMatcher';
import UssdExecutor from '../modules/ussd-executor/src/UssdExecutorModule';
import { useSimStore } from '../store/useSimStore';

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

export function startPolling(intervalMs: number = 8000) {
  if (pollTimer) return;
  pollTimer = setInterval(runPollCycle, intervalMs);
  runPollCycle();
}

export function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function runPollCycle() {
  if (processing) return; // avoid overlapping cycles
  processing = true;

  try {
    const pending = await fetchPending();
    const tillSubId = useSimStore.getState().tillSubscriptionId;

    if (tillSubId == null) {
      processing = false;
      return; // no till SIM configured yet — nothing we can do
    }

    for (const txn of pending) {
      const offer = matchOffer(txn.amount);

      if (!offer) {
        await reportFail(txn.id, `No matching offer for amount ${txn.amount}`);
        continue;
      }

      const ussdCode = buildUssdCode(offer, txn.phone);

      const resultPromise = new Promise<{ success: boolean; result: string }>((resolve) => {
        const subscription = UssdExecutor.addListener('onUssdResult', (event: any) => {
          subscription.remove();
          resolve(event);
        });

        // Safety timeout in case the accessibility flow never resolves
        setTimeout(() => {
          subscription.remove();
          resolve({ success: false, result: 'Timed out waiting for USSD response' });
        }, 30000);
      });

      UssdExecutor.dialUssd(ussdCode, tillSubId, offer.menuInputs);
      const outcome = await resultPromise;

      if (outcome.success) {
        await reportComplete(txn.id);
      } else {
        await reportFail(txn.id, outcome.result);
      }

      // Small delay between transactions so we don't hammer the dialer
      await new Promise((r) => setTimeout(r, 3000));
    }
  } catch (e) {
    // Network error reaching the server — just try again next cycle
  }

  processing = false;
}
