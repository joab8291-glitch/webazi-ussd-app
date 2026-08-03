package expo.modules.smslistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
