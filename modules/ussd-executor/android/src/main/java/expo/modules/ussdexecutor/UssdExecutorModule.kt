package expo.modules.ussdexecutor

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.telecom.TelecomManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UssdExecutorModule : Module() {

  companion object {
    const val REQUEST_CALL_PHONE_CODE = 4201
  }

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

    // Checks whether CALL_PHONE is currently granted
    Function("hasCallPhonePermission") {
      val context = appContext.reactContext
      context != null && ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.CALL_PHONE
      ) == PackageManager.PERMISSION_GRANTED
    }

    // Triggers the system permission dialog for CALL_PHONE.
    // Note: this does NOT return the user's answer synchronously — Android
    // delivers the result via onRequestPermissionsResult on the Activity,
    // which Expo modules don't surface cleanly. The practical pattern is:
    // call this, let the user respond to the OS prompt, then have them
    // retry the dial action — hasCallPhonePermission() will be true on
    // the next check once granted.
    Function("requestCallPhonePermission") {
      val activity = appContext.currentActivity
      if (activity != null) {
        ActivityCompat.requestPermissions(
          activity,
          arrayOf(Manifest.permission.CALL_PHONE),
          REQUEST_CALL_PHONE_CODE
        )
      }
    }

    // Dials a USSD code on the given SIM slot, queues follow-up menu inputs, and reports the result
    Function("dialUssd") { ussdCode: String, subscriptionId: Int, menuInputs: List<String> ->
      val context = appContext.reactContext

      if (context != null) {
        // Guard: don't even attempt the call if permission isn't granted yet.
        // This avoids relying solely on catching SecurityException, and lets
        // the JS side decide to prompt for permission instead of just failing.
        val hasPermission = ContextCompat.checkSelfPermission(
          context,
          Manifest.permission.CALL_PHONE
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
          sendEvent("onUssdResult", mapOf("result" to "Missing CALL_PHONE permission", "success" to false))
          return@Function
        }

        UssdAccessibilityService.pendingInputs = menuInputs.toMutableList()
        UssdAccessibilityService.onResult = { resultText ->
          sendEvent("onUssdResult", mapOf("result" to resultText, "success" to true))
          // Clear state after delivering the result so a stray accessibility
          // event elsewhere can't retrigger this callback or consume leftover inputs
          UssdAccessibilityService.onResult = null
          UssdAccessibilityService.pendingInputs = mutableListOf()
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