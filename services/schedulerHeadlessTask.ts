/**
 * Headless entry point for "SchedulerCheckTask", registered in the app's
 * root index.js. Runs with no Activity and no UI — Android boots this JS
 * instance purely to execute this function, then tears it down again
 * once it resolves (or after the 60s timeout set in
 * SchedulerTaskService.kt).
 *
 * This is now the PRIMARY mechanism for firing due schedules while the
 * app is backgrounded. The setInterval loop in scheduler.ts still runs
 * while the app is open, as a redundant, more responsive check — but it
 * is no longer load-bearing for background reliability.
 */
import { runDueSchedules } from './scheduler';

export async function schedulerHeadlessTask(): Promise<void> {
  await runDueSchedules();
}
