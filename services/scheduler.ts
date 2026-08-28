/**
 * USSD Scheduler runtime.
 *
 * IMPORTANT: this app has no background task runner (no expo-task-manager /
 * background-fetch installed). A schedule only fires while the app is open
 * — this loop polls every 30s for due items. A schedule whose runAt time
 * passed while the app was closed fires as soon as the app is reopened.
 */

import { useScheduleStore } from '../store/useScheduleStore';
import type { ScheduledDial } from '../store/useScheduleStore';
import { useActivityStore } from '../store/useActivityStore';
import { manualDeliver } from './smsAutomation';

const CHECK_INTERVAL_MS = 30000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startSchedulerLoop() {
  if (intervalHandle) return;

  intervalHandle = setInterval(() => {
    void runDueSchedules();
  }, CHECK_INTERVAL_MS);

  void runDueSchedules();
}

export function stopSchedulerLoop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

async function runDueSchedules() {
  if (running) return;
  running = true;

  try {
    const log = useActivityStore.getState().addLog;
    const now = Date.now();
    const due = useScheduleStore
      .getState()
      .items.filter(
        (item) =>
          item.active &&
          (item.limit == null || item.runsCompleted < item.limit) &&
          new Date(item.runAt).getTime() <= now
      );

    for (const item of due) {
      log('info', `Running scheduled dial "${item.label}"`);

      const result = await manualDeliver({
        phone: item.phone,
        amount: item.amount,
        network: item.network,
      });

      const nextRunAt = computeNextRun(item);

      useScheduleStore
        .getState()
        .recordRun(item.id, result.ok ? 'Queued' : result.reason ?? 'Failed to queue', nextRunAt);
    }
  } finally {
    running = false;
  }
}

function computeNextRun(item: ScheduledDial): string | null {
  if (item.recurrence === 'once') {
    return null;
  }

  const dayMs = 24 * 60 * 60 * 1000;

  // Base the next run off whichever is later: the originally scheduled
  // time, or right now. If the app was closed and this run fired late
  // (runAt is in the past), basing off the stale runAt would put the
  // "next" run in the past too — the 30s poll would then fire it again
  // almost immediately, repeating every 30s until it caught up to the
  // present. Real airtime would go out multiple times for what should
  // have been a single missed run. Basing off now() when late collapses
  // any missed occurrences into a single catch-up run and schedules the
  // next one properly in the future.
  const base = Math.max(new Date(item.runAt).getTime(), Date.now());
  const next = item.recurrence === 'daily' ? base + dayMs : base + 7 * dayMs;

  return new Date(next).toISOString();
}