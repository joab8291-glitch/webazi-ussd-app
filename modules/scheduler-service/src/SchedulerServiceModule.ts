import { NativeModule, requireNativeModule } from 'expo';

declare class SchedulerServiceModule extends NativeModule<{}> {
  // Starts the foreground service that keeps the app process (and the
  // JS scheduler's setInterval loop in services/scheduler.ts) alive
  // while the app is backgrounded. Requires a native rebuild — guard
  // calls with `typeof X === 'function'` until the app has been
  // rebuilt with this module included.
  startForegroundService(): void;
  stopForegroundService(): void;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): void;

  // AlarmManager-backed exact wake — fires "SchedulerCheckTask" (a
  // headless JS task) even when no JS instance is currently alive. See
  // services/schedulerAlarm.ts for the caller.
  scheduleNextAlarm(triggerAtMillis: number): 'scheduled_exact' | 'scheduled_inexact' | 'no_context';
  cancelAlarm(): void;
  isExactAlarmPermissionGranted(): boolean;
  requestExactAlarmPermission(): void;
}

export default requireNativeModule<SchedulerServiceModule>('SchedulerService');
