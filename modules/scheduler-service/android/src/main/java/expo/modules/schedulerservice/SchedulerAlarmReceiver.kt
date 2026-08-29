package expo.modules.schedulerservice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService

/**
 * Fired by AlarmManager at the next due-schedule time — independent of
 * whether the app's Activity or JS instance is currently alive. This is
 * the piece that actually solves the background-scheduling problem:
 * SchedulerForegroundService only kept the *process* alive, but the
 * Activity (and the JS instance running inside it, including
 * scheduler.ts's setInterval loop) could still be torn down by Android
 * independently of that. This receiver runs regardless.
 *
 * acquireWakeLockNow() ties a wake lock to the service we're about to
 * start; HeadlessJsTaskService releases it automatically once the JS
 * task ("SchedulerCheckTask", see services/schedulerHeadlessTask.ts)
 * finishes or times out — no manual release needed here.
 */
class SchedulerAlarmReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val appContext = context.applicationContext
    val serviceIntent = Intent(appContext, SchedulerTaskService::class.java)

    HeadlessJsTaskService.acquireWakeLockNow(appContext)
    appContext.startService(serviceIntent)
  }
}
