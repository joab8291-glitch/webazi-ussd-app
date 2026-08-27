package expo.modules.smslistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.Cursor
import android.os.Build
import android.provider.Telephony
import android.telephony.SmsMessage
import android.telephony.SubscriptionManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsListenerModule : Module() {

  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("SmsListener")

    Events("onSmsReceived")

    // Starts listening for incoming SMS on the till line
    Function("startListening") {
      val context = appContext.reactContext

      if (receiver == null && context != null) {
        receiver = object : BroadcastReceiver() {
          override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

            val bundle = intent.extras ?: return
            val pdus = bundle.get("pdus") as? Array<*> ?: return
            val format = bundle.getString("format")
            val subId = bundle.getInt("subscription", -1)

            val fullBody = StringBuilder()
            var sender = ""

            for (pdu in pdus) {
              val sms = if (format != null) {
                SmsMessage.createFromPdu(pdu as ByteArray, format)
              } else {
                @Suppress("DEPRECATION")
                SmsMessage.createFromPdu(pdu as ByteArray)
              }
              sender = sms.originatingAddress ?: ""
              fullBody.append(sms.messageBody)
            }

            sendEvent(
              "onSmsReceived",
              mapOf(
                "sender" to sender,
                "body" to fullBody.toString(),
                "subscriptionId" to subId,
                "timestamp" to System.currentTimeMillis()
              )
            )
          }
        }

        val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
        context.registerReceiver(receiver, filter)
      }
    }

    // Stops listening
    Function("stopListening") {
      val context = appContext.reactContext
      if (receiver != null && context != null) {
        context.unregisterReceiver(receiver)
        receiver = null
      }
    }

    // Starts the foreground service that keeps this module's BroadcastReceiver
    // alive in the background. Safe to call even if already running.
    Function("startForegroundService") {
      val context = appContext.reactContext ?: return@Function

      val intent = Intent(context, SmsForegroundService::class.java)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    // Stops the foreground service.
    Function("stopForegroundService") {
      val context = appContext.reactContext ?: return@Function
      context.stopService(Intent(context, SmsForegroundService::class.java))
    }

    // Scans the device's actual SMS inbox for messages received on the given
    // subscription since `sinceMillis`, for the "missed messages while the
    // app/process was killed" recovery path. Requires READ_SMS (already
    // requested for live listening).
    Function("queryInboxSince") { sinceMillis: Double, subscriptionId: Int ->
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any?>>()
      val result = mutableListOf<Map<String, Any?>>()

      val projection = arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE,
        Telephony.Sms.SUBSCRIPTION_ID
      )

      var cursor: Cursor? = null

      try {
        cursor = context.contentResolver.query(
          Telephony.Sms.Inbox.CONTENT_URI,
          projection,
          "${Telephony.Sms.DATE} >= ?",
          arrayOf(sinceMillis.toLong().toString()),
          "${Telephony.Sms.DATE} ASC"
        )

        cursor?.let { c ->
          val idCol = c.getColumnIndex(Telephony.Sms._ID)
          val addressCol = c.getColumnIndex(Telephony.Sms.ADDRESS)
          val bodyCol = c.getColumnIndex(Telephony.Sms.BODY)
          val dateCol = c.getColumnIndex(Telephony.Sms.DATE)
          val subCol = c.getColumnIndex(Telephony.Sms.SUBSCRIPTION_ID)

          while (c.moveToNext()) {
            // SUBSCRIPTION_ID isn't reliably populated on every OEM/Android
            // version for the inbox table. When it's missing (-1) we can't
            // safely attribute the message to a SIM, so we include it and
            // let the caller's own Till-SIM re-check decide — better to
            // surface a possible match than silently drop it.
            val rowSubId = if (subCol >= 0) c.getInt(subCol) else -1

            if (rowSubId != -1 && rowSubId != subscriptionId) {
              continue
            }

            result.add(
              mapOf(
                "id" to (if (idCol >= 0) c.getLong(idCol).toString() else ""),
                "sender" to (if (addressCol >= 0) c.getString(addressCol) else ""),
                "body" to (if (bodyCol >= 0) c.getString(bodyCol) else ""),
                "timestamp" to (if (dateCol >= 0) c.getLong(dateCol) else 0L),
                "subscriptionId" to (if (rowSubId != -1) rowSubId else subscriptionId)
              )
            )
          }
        }
      } catch (e: SecurityException) {
        // READ_SMS not granted yet — return whatever was collected (empty).
      } finally {
        cursor?.close()
      }

      result
    }

    // Returns info about available SIM slots, so the admin can pick which one is the Till line
    Function("getSimSlots") {
      val context = appContext.reactContext
      val result = mutableListOf<Map<String, Any?>>()

      if (context != null) {
        val subManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager

        try {
          val subscriptions = subManager.activeSubscriptionInfoList
          subscriptions?.forEach { info ->
            result.add(
              mapOf(
                "subscriptionId" to info.subscriptionId,
                "slotIndex" to info.simSlotIndex,
                "carrierName" to info.carrierName?.toString(),
                "displayName" to info.displayName?.toString(),
                "number" to info.number
              )
            )
          }
        } catch (e: SecurityException) {
          // Permission not granted yet — return empty, JS side should prompt for permission
        }
      }

      result
    }
  }
}
