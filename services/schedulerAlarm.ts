/**
 * Bridges the JS schedule store to the native AlarmManager. Rather than
 * juggling one native alarm per schedule, armNextAlarm() recomputes the
 * single soonest runAt across every active item and (re)arms exactly one
 * alarm for it.
 *
 * Called from two places:
 *  - the end of runDueSchedules() (scheduler.ts), so both the foreground
 *    interval loop and the headless-task path keep the alarm in sync
 *    after every check;
 *  - a subscription to useScheduleStore below, so creating, editing,
 *    completing, or deleting a schedule from the UI re-arms immediately
 *    instead of waiting for the next 30s interval tick.
 */
import { useScheduleStore } from '../store/useScheduleStore';
import SchedulerService from '../modules/scheduler-service/src/SchedulerServiceModule';

export async function armNextAlarm(): Promise<void> {
  const items = useScheduleStore
    .getState()
    .items.filter(
      (item) => item.active && (item.limit == null || item.runsCompleted < item.limit)
    );

  if (items.length === 0) {
    if (typeof SchedulerService.cancelAlarm === 'function') {
      try {
        SchedulerService.cancelAlarm();
      } catch {
        // Non-fatal — nothing due means nothing to wake for anyway.
      }
    }
    return;
  }

  const soonest = items.reduce(
    (min, item) => Math.min(min, new Date(item.runAt).getTime()),
    Infinity
  );

  // Never arm in the past — if something is already overdue, fire almost
  // immediately instead of handing AlarmManager a stale timestamp.
  const triggerAt = Math.max(soonest, Date.now() + 1000);

  if (typeof SchedulerService.scheduleNextAlarm === 'function') {
    try {
      SchedulerService.scheduleNextAlarm(triggerAt);
    } catch {
      // Non-fatal — the foreground-service/JS-interval path still covers
      // us whenever the app happens to be open.
    }
  }
}

let unsubscribe: (() => void) | null = null;

/**
 * Keeps the native alarm in sync with the store any time its items array
 * changes for any reason — addSchedule, removeSchedule, setActive, or
 * recordRun. Safe to call more than once (e.g. from startSchedulerLoop on
 * every app start); a second call is a no-op while already subscribed.
 */
export function watchScheduleStoreForAlarm(): void {
  if (unsubscribe) return;

  unsubscribe = useScheduleStore.subscribe((state, prevState) => {
    if (state.items !== prevState.items) {
      void armNextAlarm();
    }
  });
}
