package expo.modules.smslistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * A minimal foreground service whose only job is to hold the process alive
 * with a low-priority notification while SmsListenerModule's BroadcastReceiver
 * is registered. Without this, Android can (and eventually will) kill the
 * app in the background and silently drop incoming payment SMS.
 *
 * Started from SmsListenerModule.startForegroundService() alongside
 * startListening(), and stopped from stopForegroundService() alongside
 * stopListening().
 */
class SmsForegroundService : Service() {

  companion object {
    private const val CHANNEL_ID = "webazi_sms_listener"
    private const val NOTIFICATION_ID = 4271
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
          "SMS Listener",
          NotificationManager.IMPORTANCE_MIN
        ).apply {
          description = "Keeps the M-Pesa SMS listener active in the background"
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
      .setContentText("Keeping the SMS listener active in the background")
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
}
