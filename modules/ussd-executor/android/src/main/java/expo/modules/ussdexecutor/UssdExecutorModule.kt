package expo.modules.ussdexecutor

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UssdExecutorModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("UssdExecutor")

    Events("onUssdResult")

    AsyncFunction("startUssd") { code: String, inputs: List<String>, subscriptionId: Int, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }

      UssdAccessibilityService.pendingInputs = inputs.toMutableList()

      UssdAccessibilityService.onResult = { resultText ->
        sendEvent("onUssdResult", mapOf("result" to resultText))
        promise.resolve(resultText)
        UssdAccessibilityService.onResult = null
      }

      try {
        dialUssd(context, code, subscriptionId)
      } catch (e: SecurityException) {
        promise.reject("PERMISSION_DENIED", "CALL_PHONE permission not granted", e)
      } catch (e: Exception) {
        promise.reject("DIAL_FAILED", e.message ?: "Failed to dial USSD code", e)
      }
    }

    Function("isAccessibilityServiceEnabled") {
      val context = appContext.reactContext
      if (context == null) return@Function false
      isAccessibilityEnabled(context)
    }
  }

  private fun dialUssd(context: Context, code: String, subscriptionId: Int) {
    val encoded = code.replace("#", Uri.encode("#"))
    val uri = Uri.parse("tel:$encoded")

    val intent = Intent(Intent.ACTION_CALL, uri).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
    }

    if (subscriptionId != -1) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        intent.putExtra("android.telecom.extra.PHONE_ACCOUNT_HANDLE", getPhoneAccountHandle(context, subscriptionId))
      } else {
        intent.putExtra("com.android.phone.extra.slot", subscriptionId)
        intent.putExtra("simSlot", subscriptionId)
      }
    }

    context.startActivity(intent)
  }

  private fun getPhoneAccountHandle(context: Context, subscriptionId: Int): android.telecom.PhoneAccountHandle? {
    return try {
      val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      val accountHandles = telecomManager.callCapablePhoneAccounts
      accountHandles.firstOrNull { handle ->
        val account = telecomManager.getPhoneAccount(handle)
        account?.let {
          val subManager = context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
          val info = subManager.activeSubscriptionInfoList?.find { it.subscriptionId == subscriptionId }
          info != null && it.label?.toString()?.contains(info.carrierName ?: "") == true
        } ?: false
      }
    } catch (e: SecurityException) {
      null
    }
  }

  private fun isAccessibilityEnabled(context: Context): Boolean {
    val expectedServiceName = "${context.packageName}/${UssdAccessibilityService::class.java.canonicalName}"
    val enabledServices = android.provider.Settings.Secure.getString(
      context.contentResolver,
      android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    return enabledServices.contains(expectedServiceName)
  }
}
