package expo.modules.ussdexecutor

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UssdExecutorModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("UssdExecutor")

    Events("onUssdResult")

    // Checks whether the Accessibility Service is enabled.
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

    // Opens Android Accessibility settings.
    Function("openAccessibilitySettings") {
      val context = appContext.reactContext

      if (context != null) {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        context.startActivity(intent)
      }
    }

    // Dial USSD using the exact Android subscription ID selected by the user.
    Function("dialUssd") {
        ussdCode: String,
        subscriptionId: Int,
        menuInputs: List<String> ->

      val context = appContext.reactContext

      if (context == null) {
        sendEvent(
          "onUssdResult",
          mapOf(
            "result" to "Android context unavailable",
            "success" to false
          )
        )
        return@Function
      }

      // Check CALL_PHONE permission before attempting ACTION_CALL.
      if (
        context.checkSelfPermission(android.Manifest.permission.CALL_PHONE) !=
        android.content.pm.PackageManager.PERMISSION_GRANTED
      ) {
        sendEvent(
          "onUssdResult",
          mapOf(
            "result" to "CALL_PHONE permission is not granted",
            "success" to false
          )
        )
        return@Function
      }

      if (subscriptionId == SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
        sendEvent(
          "onUssdResult",
          mapOf(
            "result" to "Invalid SIM subscription ID",
            "success" to false
          )
        )
        return@Function
      }

      UssdAccessibilityService.pendingInputs = menuInputs.toMutableList()

      UssdAccessibilityService.onResult = { resultText ->
        sendEvent(
          "onUssdResult",
          mapOf(
            "result" to resultText,
            "success" to true
          )
        )
      }

      try {
        val telecomManager =
          context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

        val accountHandles = telecomManager.callCapablePhoneAccounts

        var targetHandle: android.telecom.PhoneAccountHandle? = null

        for (handle in accountHandles) {
          try {
            val accountSubscriptionId = getSubscriptionIdForPhoneAccount(
              context,
              handle
            )

            if (accountSubscriptionId == subscriptionId) {
              targetHandle = handle
              break
            }
          } catch (_: SecurityException) {
            // Ignore accounts we cannot inspect.
          } catch (_: Exception) {
            // Ignore malformed/unavailable phone accounts.
          }
        }

        if (targetHandle == null) {
          sendEvent(
            "onUssdResult",
            mapOf(
              "result" to "No phone account found for subscription ID: $subscriptionId",
              "success" to false
            )
          )
          return@Function
        }

        val uri = Uri.fromParts(
          "tel",
          Uri.encode(ussdCode),
          null
        )

        val intent = Intent(
          Intent.ACTION_CALL,
          uri
        )

        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK

        intent.putExtra(
          TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE,
          targetHandle
        )

        context.startActivity(intent)

      } catch (e: SecurityException) {
        sendEvent(
          "onUssdResult",
          mapOf(
            "result" to "CALL_PHONE permission was denied by Android",
            "success" to false
          )
        )

      } catch (e: Exception) {
        sendEvent(
          "onUssdResult",
          mapOf(
            "result" to (e.message ?: "Unknown error"),
            "success" to false
          )
        )
      }
    }
  }

  private fun getSubscriptionIdForPhoneAccount(
    context: Context,
    handle: android.telecom.PhoneAccountHandle
  ): Int {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val telephonyManager =
        context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

      return telephonyManager.getSubscriptionId(handle)
    }

    // Fallback for Android versions below API 30.
    val telecomManager =
      context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

    val account = telecomManager.getPhoneAccount(handle)

    return account?.extras?.getInt(
      "subscription_id",
      SubscriptionManager.INVALID_SUBSCRIPTION_ID
    ) ?: SubscriptionManager.INVALID_SUBSCRIPTION_ID
  }
}