package expo.modules.schedulerservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Keeps the app process alive so the existing JS scheduler loop
 * (services/scheduler.ts, setInterval every 30s) keeps running even
 * when the app is backgrounded or the Activity is destroyed.
 *
 * This does NOT reimplement scheduling logic natively — it exists
 * purely to stop Android from killing the process the JS scheduler
 * runs inside. Modeled directly on SmsForegroundService.kt.
 */
class SchedulerForegroundService : Service() {

  companion object {
    private const val CHANNEL_ID = "webazi_scheduler"
    private const val NOTIFICATION_ID = 4272 // distinct from SMS service's 4271
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIFICATION_ID, buildNotification())
    return START_STICKY
  }

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      val existing = manager?.getNotificationChannel(CHANNEL_ID)

      if (existing == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Scheduled Transactions",
          NotificationManager.IMPORTANCE_MIN
        ).apply {
          description = "Keeps scheduled USSD transactions running in the background"
          setShowBadge(false)
        }
        manager?.createNotificationChannel(channel)
      }
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle("Webazi")
      .setContentText("Watching for scheduled transactions")
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setOngoing(true)
      .setPriority(Notification.PRIORITY_MIN)
      .build()
  }

  override fun onDestroy() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    super.onDestroy()
  }

  /**
   * Restart if the user swipes the app away from Recents — same
   * reasoning as SmsForegroundService: a scheduled transaction due a
   * few minutes later shouldn't silently die just because the task
   * was removed from Recents.
   */
  override fun onTaskRemoved(rootIntent: Intent?) {
    val restartIntent = Intent(applicationContext, SchedulerForegroundService::class.java)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      applicationContext.startForegroundService(restartIntent)
    } else {
      applicationContext.startService(restartIntent)
    }

    super.onTaskRemoved(rootIntent)
  }
}
