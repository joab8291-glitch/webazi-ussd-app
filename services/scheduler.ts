/**
 * USSD Scheduler runtime.
 *
 * PREVIOUS FIX (kept, but no longer the primary mechanism): a native
 * foreground service (SchedulerForegroundService) keeps this process
 * alive in the background with a persistent low-priority notification.
 * That protects the *process* from being killed — but Android can still
 * tear down the Activity, and with it the JS instance running inside it
 * (including this file's setInterval loop), independently of whether the
 * native service and its notification are still alive. That's why a
 * schedule due while backgrounded only ever fired on reopen: there was
 * no JS running during that window to notice it was due.
 *
 * REAL FIX: the due-schedule check now also runs via Android's
 * AlarmManager + a headless JS task (schedulerHeadlessTask.ts /
 * SchedulerAlarmReceiver.kt), which boots a fresh, UI-less JS instance
 * at exactly the next due time regardless of whether the Activity or any
 * previous JS instance is alive. armNextAlarm() (schedulerAlarm.ts) runs
 * at the end of every check here, and watchScheduleStoreForAlarm() keeps
 * it in sync the moment a schedule is added, edited, or removed — so the
 * interval loop, the headless task, and the UI all share one native
 * alarm kept pointed at the next soonest due time.
 *
 * The setInterval loop itself is kept as-is: it's still useful while the
 * app is open, since it's more responsive than waiting for an exact
 * alarm to fire. It is simply no longer relied on for correctness while
 * backgrounded.
 */

import { useScheduleStore } from '../store/useScheduleStore';
import type { ScheduledDial } from '../store/useScheduleStore';
import { useActivityStore } from '../store/useActivityStore';
import { manualDeliver } from './smsAutomation';
import { runDueFloatChecks } from './floatCheck';
import SchedulerService from '../modules/scheduler-service/src/SchedulerServiceModule';
import { armNextAlarm, watchScheduleStoreForAlarm } from './schedulerAlarm';

const CHECK_INTERVAL_MS = 30000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startSchedulerLoop() {
  if (intervalHandle) return;

  // Keep the process alive so this interval survives backgrounding.
  // Guarded: safe to call even before a native rebuild has added this
  // module — falls back to the previous foreground-only behavior.
  //
  // DIAGNOSTIC (temporary): logs the outcome to the Activity Log instead
  // of silently swallowing it, so a failure is visible on-device without
  // needing adb/logcat access. Remove once the foreground service is
  // confirmed working reliably.
  const log = useActivityStore.getState().addLog;
  if (typeof SchedulerService.startForegroundService === 'function') {
    try {
      SchedulerService.startForegroundService();
      log('info', 'Scheduler foreground service: startForegroundService() called successfully');
    } catch (e: any) {
      log('warn', `Scheduler foreground service failed to start: ${String(e?.message ?? e)}`);
    }
  } else {
    log(
      'warn',
      'Scheduler foreground service: SchedulerService.startForegroundService is not a function ' +
        '(native module not linked in this build)'
    );
  }

  intervalHandle = setInterval(() => {
    void runDueSchedules();
  }, CHECK_INTERVAL_MS);

  // Keeps the native alarm pointed at the next soonest due item any time
  // a schedule is added/edited/removed from the UI, not just after a
  // check completes.
  watchScheduleStoreForAlarm();

  void runDueSchedules();
}

export function stopSchedulerLoop() {
  // Stop the foreground service alongside the interval — see the note
  // in Section 4 of the accompanying fix doc if this service is later
  // merged with the SMS listener's into one shared service, since that
  // would need reference counting instead of an unconditional stop here.
  if (typeof SchedulerService.stopForegroundService === 'function') {
    try {
      SchedulerService.stopForegroundService();
    } catch {
      // Non-fatal.
    }
  }

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  // Also cancel the native alarm — otherwise a headless task could still
  // fire after the user has explicitly stopped the scheduler.
  if (typeof SchedulerService.cancelAlarm === 'function') {
    try {
      SchedulerService.cancelAlarm();
    } catch {
      // Non-fatal.
    }
  }
}

/**
 * Exported (was module-private) so schedulerHeadlessTask.ts can call the
 * exact same due-schedule logic from a headless JS instance — there is
 * no duplicated implementation between the foreground and background
 * paths.
 */
export async function runDueSchedules() {
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

    // Float/balance check — cheap no-op unless checkIntervalHours has
    // elapsed for a network; shares this same check rather than running
    // its own timer.
    await runDueFloatChecks();

    // Re-arm the single native alarm for whatever is now the next
    // soonest due item (recordRun() above will have already advanced
    // any recurring items that just fired). Runs after every check —
    // from the interval loop while foregrounded, and from the headless
    // task while backgrounded — so the chain of alarms keeps itself
    // going without ever depending on the app being reopened.
    await armNextAlarm();
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
