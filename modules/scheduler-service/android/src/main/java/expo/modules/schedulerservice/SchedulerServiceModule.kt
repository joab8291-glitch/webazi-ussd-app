package expo.modules.schedulerservice

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val ALARM_REQUEST_CODE = 4821

private fun alarmPendingIntent(context: Context): PendingIntent {
  val intent = Intent(context, SchedulerAlarmReceiver::class.java)
  val flags = PendingIntent.FLAG_UPDATE_CURRENT or
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
  return PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags)
}

class SchedulerServiceModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("SchedulerService")

    // Starts the foreground service that keeps the process (and the
    // JS scheduler's setInterval loop) alive in the background.
    Function("startForegroundService") {
      val context = appContext.reactContext ?: return@Function null
      val intent = Intent(context, SchedulerForegroundService::class.java)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    Function("stopForegroundService") {
      val context = appContext.reactContext ?: return@Function null
      context.stopService(Intent(context, SchedulerForegroundService::class.java))
    }

    // Reuse the same battery-optimization check already built for the
    // SMS listener — same underlying OS API, just exposed here too so
    // the scheduler's own settings section can prompt independently.
    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      val powerManager =
        context.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
      powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: false
    }

    Function("requestIgnoreBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function null
      val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = android.net.Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    // --- NEW: AlarmManager-backed exact wake, survives JS/Activity teardown ---
    //
    // startForegroundService (above) only keeps the process alive; it does
    // not stop Android from tearing down the Activity — and with it the JS
    // instance running scheduler.ts's setInterval — independently. These
    // methods arm a native alarm that boots a fresh headless JS instance
    // (see SchedulerAlarmReceiver/SchedulerTaskService) at exactly the next
    // due time, regardless of whether any previous JS instance is alive.

    Function("scheduleNextAlarm") { triggerAtMillis: Double ->
      val context = appContext.reactContext ?: return@Function "no_context"
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pendingIntent = alarmPendingIntent(context)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
        // "Alarms & reminders" not granted (API 33+ defaults this off).
        // Fall back to an inexact wake rather than throwing — still far
        // more reliable than a JS timer alone, since it survives the JS
        // instance being torn down.
        alarmManager.setAndAllowWhileIdle(
          AlarmManager.RTC_WAKEUP,
          triggerAtMillis.toLong(),
          pendingIntent
        )
        return@Function "scheduled_inexact"
      }

      alarmManager.setExactAndAllowWhileIdle(
        AlarmManager.RTC_WAKEUP,
        triggerAtMillis.toLong(),
        pendingIntent
      )
      "scheduled_exact"
    }

    Function("cancelAlarm") {
      val context = appContext.reactContext ?: return@Function null
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      alarmManager.cancel(alarmPendingIntent(context))
    }

    Function("isExactAlarmPermissionGranted") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.canScheduleExactAlarms()
      } else {
        true
      }
    }

    // Same pattern as requestIgnoreBatteryOptimizations above — opens the
    // OS settings screen for granting "Alarms & reminders" on API 33+.
    Function("requestExactAlarmPermission") {
      val context = appContext.reactContext ?: return@Function null
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val intent = Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
          data = android.net.Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      }
    }
  }
}
