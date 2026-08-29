package expo.modules.schedulerservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

/**
 * AlarmManager alarms are wiped on every reboot. Without this, a phone
 * restart would silently kill background scheduling until the user
 * happened to reopen the app. This re-enters through the same
 * headless-task path as a normal alarm fire, so JS recomputes the next
 * due time from the persisted schedule store (AsyncStorage survives
 * reboot) and re-arms — no app-open required.
 */
class SchedulerBootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
      val appContext = context.applicationContext
      val serviceIntent = Intent(appContext, SchedulerTaskService::class.java)

      HeadlessJsTaskService.acquireWakeLockNow(appContext)
      appContext.startService(serviceIntent)
    }
  }
}
