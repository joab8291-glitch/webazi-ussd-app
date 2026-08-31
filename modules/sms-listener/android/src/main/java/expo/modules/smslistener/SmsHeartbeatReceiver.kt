package expo.modules.smslistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Fired by AlarmManager every ~5 minutes while the SMS listener is active
 * (see SmsPrefs.scheduleHeartbeat / SmsListenerModule.startForegroundService).
 * Its only job is to re-issue startForegroundService() — safe and idempotent
 * even if the service is already running, since Service.onStartCommand()
 * just redisplays the same notification.
 *
 * This exists because onTaskRemoved() in SmsForegroundService only catches
 * the "user swiped the app away" case. A silent kill by the OS (low memory,
 * or an OEM's aggressive background-app killer on Xiaomi/Oppo/Vivo/Huawei)
 * can tear the service down without ever calling onTaskRemoved() — this
 * heartbeat is the self-healing loop that catches that case too, generally
 * within 5 minutes.
 */
class SmsHeartbeatReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    // Only restart if the listener was actually meant to be running —
    // otherwise a stray leftover alarm (e.g. right after the user manually
    // stopped listening) would resurrect a service they turned off.
    if (!SmsPrefs.isListeningActive(context)) return

    val appContext = context.applicationContext
    val serviceIntent = Intent(appContext, SmsForegroundService::class.java)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      appContext.startForegroundService(serviceIntent)
    } else {
      appContext.startService(serviceIntent)
    }
  }
}
