package expo.modules.smslistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * Restarts the SMS listener's foreground service (and re-arms the heartbeat
 * alarm, since AlarmManager wipes all alarms on every reboot) after a device
 * restart — but only if the listener was actually active before the reboot,
 * so a phone that was never running Webazi's listener doesn't get one
 * silently started.
 *
 * If the user has turned on "Auto-relaunch app after reboot" in Settings
 * (persisted as a native flag via SmsListenerModule.setRelaunchAppOnBootEnabled,
 * synced down from useAppSettingsStore), this also brings the full app UI to
 * the foreground 5 seconds after boot — mirroring the reference app's
 * BootReceiver, which does the same on a short delay after restarting its
 * service.
 */
class SmsBootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

    val appContext = context.applicationContext

    if (!SmsPrefs.isListeningActive(appContext)) return

    val serviceIntent = Intent(appContext, SmsForegroundService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      appContext.startForegroundService(serviceIntent)
    } else {
      appContext.startService(serviceIntent)
    }

    SmsPrefs.scheduleHeartbeat(appContext)

    if (SmsPrefs.isRelaunchAppOnBootEnabled(appContext)) {
      Handler(Looper.getMainLooper()).postDelayed({
        val launchIntent = appContext.packageManager.getLaunchIntentForPackage(appContext.packageName)
        launchIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        launchIntent?.let { appContext.startActivity(it) }
      }, 5000L)
    }
  }
}
