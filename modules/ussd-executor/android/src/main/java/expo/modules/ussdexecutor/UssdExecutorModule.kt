package expo.modules.ussdexecutor

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UssdExecutorModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("UssdExecutor")

    Events("onUssdResult")

    // Checks whether the Accessibility Service is enabled — call this before dialing
    Function("isAccessibilityEnabled") {
      val context = appContext.reactContext
      var enabled = false

      if (context != null) {
        val enabledServices = Settings.Secure.getString(
          context.contentResolver,
          Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )
        enabled = enabledServices?.contains(context.packageName) == true
      }

      enabled
    }

    // Opens system Accessibility settings so the user can manually enable the service
    Function("openAccessibilitySettings") {
      val context = appContext.reactContext
      if (context != null) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        context.startActivity(intent)
      }
    }

    // Dials a USSD code on the given SIM slot, queues follow-up menu inputs, and reports the result
    Function("dialUssd") { ussdCode: String, subscriptionId: Int, menuInputs: List<String> ->
      val context = appContext.reactContext

      if (context != null) {
        UssdAccessibilityService.pendingInputs = menuInputs.toMutableList()
        UssdAccessibilityService.onResult = { resultText ->
          sendEvent("onUssdResult", mapOf("result" to resultText, "success" to true))
        }

        try {
          val telecomManager = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
          val uri = Uri.fromParts("tel", Uri.encode(ussdCode), null)
          val intent = Intent(Intent.ACTION_CALL, uri)
          intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK

          // Target the specific SIM slot if the phone/telecom account supports it
          val accountHandles = telecomManager.callCapablePhoneAccounts
          val targetHandle = accountHandles?.find { handle ->
            val account = telecomManager.getPhoneAccount(handle)
            account?.extras?.getInt("subscription_id", -1) == subscriptionId
          }
          if (targetHandle != null) {
            intent.putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, targetHandle)
          }

          context.startActivity(intent)
        } catch (e: SecurityException) {
          sendEvent("onUssdResult", mapOf("result" to "Missing CALL_PHONE permission", "success" to false))
        } catch (e: Exception) {
          sendEvent("onUssdResult", mapOf("result" to (e.message ?: "Unknown error"), "success" to false))
        }
      }
    }
  }
}