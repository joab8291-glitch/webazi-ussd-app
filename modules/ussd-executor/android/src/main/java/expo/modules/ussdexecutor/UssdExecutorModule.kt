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

        enabledServices?.split(":")?.any {
          it.equals(
            "${context.packageName}/expo.modules.ussdexecutor.UssdAccessibilityService",
            ignoreCase = true
          ) ||
          it.contains(context.packageName, ignoreCase = true)
        } == true
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

      /*
       * IMPORTANT:
       * The Accessibility Service must NOT automatically report every dialog
       * as successful.
       *
       * The service gives us the actual text displayed by the carrier.
       * We classify that response here and only return success=true when the
       * response matches a confirmed Safaricom Sambaza success message.
       */
      UssdAccessibilityService.beginRequest(menuInputs)

      UssdAccessibilityService.onResult = { resultText ->

        val classification = classifyUssdResult(resultText)

        sendEvent(
          "onUssdResult",
          mapOf(
            "result" to resultText,
            "success" to classification.first
          )
        )

        // Prevent an old callback from being triggered by a later USSD event.
        UssdAccessibilityService.onResult = null
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
          UssdAccessibilityService.onResult = null

          sendEvent(
            "onUssdResult",
            mapOf(
              "result" to "No phone account found for subscription ID: $subscriptionId",
              "success" to false
            )
          )
          return@Function
        }

        /*
         * IMPORTANT USSD URI FIX:
         *
         * Uri.fromParts() can re-encode an already encoded '#'.
         * That can turn:
         *
         *   *140*50*254712345678#
         *
         * into a corrupted dial string.
         *
         * Uri.parse() with one Uri.encode() pass avoids the double-encoding.
         */
        val uri = Uri.parse("tel:" + Uri.encode(ussdCode))

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
        UssdAccessibilityService.onResult = null

        sendEvent(
          "onUssdResult",
          mapOf(
            "result" to "CALL_PHONE permission was denied by Android",
            "success" to false
          )
        )

      } catch (e: Exception) {
        UssdAccessibilityService.onResult = null

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

  /**
   * Classifies the actual carrier response.
   *
   * SUCCESS:
   * Safaricom Sambaza must explicitly confirm that airtime was sent.
   *
   * FAILURE:
   * Known carrier failure responses are rejected.
   *
   * UNKNOWN:
   * Unknown responses are deliberately treated as failures.
   *
   * This is important because the previous implementation did:
   *
   *   success = true
   *
   * for EVERY accessibility result, including:
   *
   *   "Sorry, you have insufficient account balance to sambaza..."
   *
   * and:
   *
   *   "Dear Customer, Your request cannot be processed now..."
   */
  private fun classifyUssdResult(resultText: String): Pair<Boolean, String> {
    val text = resultText
      .replace(Regex("\\s+"), " ")
      .trim()

    if (text.isBlank()) {
      return Pair(false, "Empty USSD response")
    }

    val lower = text.lowercase()

    /*
     * Confirmed Safaricom Sambaza success format:
     *
     * "You have successfully sent Ksh 50.00 airtime to 0722 123 456"
     *
     * We require BOTH:
     *   1. "successfully sent"
     *   2. "airtime"
     *   3. "to" followed by a Kenyan phone number
     *
     * This prevents generic words such as "successful" from being enough
     * to mark a transaction as completed.
     */
    val safaricomSuccess = Regex(
      """you\s+have\s+successfully\s+sent\s+ksh\s*[\d,]+(?:\.\d{1,2})?\s+airtime\s+to\s+(?:0[17]\d{8}|254[17]\d{8})""",
      RegexOption.IGNORE_CASE
    )

    if (safaricomSuccess.containsMatchIn(text)) {
      return Pair(true, text)
    }

    /*
     * Known Safaricom failure responses.
     *
     * These MUST never be reported as successful.
     */
    val failurePatterns = listOf(
      "insufficient account balance",
      "insufficient airtime balance",
      "insufficient airtime",
      "insufficient balance",
      "invalid number",
      "transaction failed",
      "unable to complete request",
      "request cannot be processed",
      "cannot be processed",
      "failed to",
      "failure",
      "error"
    )

    for (pattern in failurePatterns) {
      if (lower.contains(pattern)) {
        return Pair(false, text)
      }
    }

    /*
     * Unknown response = failure.
     *
     * Never allow an unknown USSD dialog to cause the backend transaction
     * to be marked completed.
     */
    return Pair(
      false,
      "Unrecognized USSD response: $text"
    )
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