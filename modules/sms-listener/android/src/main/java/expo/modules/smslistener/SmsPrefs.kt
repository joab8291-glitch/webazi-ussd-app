package expo.modules.smslistener

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build

/**
 * Native-side flags the boot/heartbeat receivers need, kept outside
 * AsyncStorage/zustand since those are only reachable from a live JS
 * instance — a BroadcastReceiver fired by the OS on boot has none.
 * SmsListenerModule is the only writer; the receivers only read.
 */
object SmsPrefs {
  private const val PREFS_NAME = "webazi_sms_listener_prefs"
  private const val KEY_LISTENING_ACTIVE = "listening_active"
  private const val KEY_RELAUNCH_ON_BOOT = "relaunch_app_on_boot"

  private const val HEARTBEAT_REQUEST_CODE = 4273 // distinct from scheduler-service's 4821
  private const val HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000L // 5 minutes

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun setListeningActive(context: Context, active: Boolean) {
    prefs(context).edit().putBoolean(KEY_LISTENING_ACTIVE, active).apply()
  }

  fun isListeningActive(context: Context): Boolean =
    prefs(context).getBoolean(KEY_LISTENING_ACTIVE, false)

  fun setRelaunchAppOnBootEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_RELAUNCH_ON_BOOT, enabled).apply()
  }

  fun isRelaunchAppOnBootEnabled(context: Context): Boolean =
    prefs(context).getBoolean(KEY_RELAUNCH_ON_BOOT, false)

  private fun heartbeatPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, SmsHeartbeatReceiver::class.java)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
    return PendingIntent.getBroadcast(context, HEARTBEAT_REQUEST_CODE, intent, flags)
  }

  /**
   * Arms the 5-minute self-healing heartbeat. Uses setInexactRepeating —
   * this is a "still alive?" check, not something that needs to fire at an
   * exact moment, so it doesn't need SCHEDULE_EXACT_ALARM permission and is
   * friendlier to battery than an exact repeating alarm would be.
   */
  fun scheduleHeartbeat(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarmManager.setInexactRepeating(
      AlarmManager.ELAPSED_REALTIME_WAKEUP,
      android.os.SystemClock.elapsedRealtime() + HEARTBEAT_INTERVAL_MS,
      HEARTBEAT_INTERVAL_MS,
      heartbeatPendingIntent(context)
    )
  }

  fun cancelHeartbeat(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarmManager.cancel(heartbeatPendingIntent(context))
  }
}
