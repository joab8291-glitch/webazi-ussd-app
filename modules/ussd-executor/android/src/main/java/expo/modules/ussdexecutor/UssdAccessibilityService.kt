package expo.modules.ussdexecutor

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.os.PowerManager
import android.util.Log
import android.content.Context
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityEvent

class UssdAccessibilityService : AccessibilityService() {

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onServiceConnected() { super.onServiceConnected(); instance = this }
  override fun onDestroy() { releaseDialWakeLock(); if (instance === this) instance = null; super.onDestroy() }

  companion object {
    private const val TAG = "UssdAccessibility"
    @Volatile private var instance: UssdAccessibilityService? = null

    @Volatile
    var pendingInputs: MutableList<String> = mutableListOf()

    @Volatile
    var onResult: ((String) -> Unit)? = null

    @Volatile
    private var waitingForFinalResult = false

    @Volatile
    private var requestActive = false

    fun beginRequest(inputs: List<String>) {
      pendingInputs = inputs.toMutableList()
      requestActive = true
      waitingForFinalResult = inputs.isEmpty()

      Log.d(
        TAG,
        "USSD request started. pendingInputs=${pendingInputs.size}"
      )
    }

    fun cancelRequest() {
      pendingInputs.clear()
      requestActive = false
      waitingForFinalResult = false
      onResult = null

      Log.d(TAG, "USSD request cancelled")
    }

    fun dismissLingeringDialog() {
      val service = instance ?: return
      try { service.rootInActiveWindow?.let { root -> service.findDismissButton(root)?.performAction(AccessibilityNodeInfo.ACTION_CLICK) } } catch (e: Exception) { Log.w(TAG, "Could not dismiss lingering USSD dialog: ${e.message}") }
    }
    fun acquireDialWakeLock() {
      val service = instance ?: return
      try { val pm = service.getSystemService(Context.POWER_SERVICE) as PowerManager; if (service.wakeLock?.isHeld == true) return; service.wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Webazi:USSDDial"); service.wakeLock?.setReferenceCounted(false); service.wakeLock?.acquire(5 * 60 * 1000L) } catch (e: Exception) { Log.w(TAG, "Could not acquire wake lock: ${e.message}") }
    }
    fun releaseDialWakeLock() { try { instance?.wakeLock?.let { if (it.isHeld) it.release() }; instance?.wakeLock = null } catch (e: Exception) { Log.w(TAG, "Could not release wake lock: ${e.message}") } }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return

    if (!requestActive) {
      return
    }

    Log.d(
      TAG,
      "Event: type=${event.eventType} " +
        "package=${event.packageName} " +
        "class=${event.className}"
    )

    val rootNode = rootInActiveWindow ?: return

    logNodeTree(rootNode, 0)

    val dialogText = extractText(rootNode)

    if (dialogText.isNullOrBlank()) {
      return
    }

    Log.d(TAG, "Extracted USSD text: $dialogText")

    /*
     * IMPORTANT:
     *
     * A USSD session normally starts with a dialog/menu.
     *
     * We must NOT immediately report that dialog as the final result.
     *
     * If there are queued menu inputs, look for an editable field and
     * submit the next input.
     */
    if (pendingInputs.isNotEmpty()) {
      val editField = findEditableNode(rootNode)

      if (editField != null) {
        val nextInput = pendingInputs.removeAt(0)

        Log.d(
          TAG,
          "USSD input field found. Sending queued input: $nextInput"
        )

        typeAndSend(rootNode, editField, nextInput)

        if (pendingInputs.isEmpty()) {
          waitingForFinalResult = true
        }

        return
      }

      /*
       * The dialog has text but no editable field.
       *
       * It may be an intermediate confirmation screen. Do not mark it
       * successful. Wait for the next accessibility event.
       */
      Log.d(
        TAG,
        "Dialog contains text but no editable field yet. Waiting."
      )

      return
    }

    /*
     * No more menu inputs.
     *
     * Now we are waiting for the carrier's final response.
     *
     * Only invoke onResult after we have a meaningful final dialog.
     */
    if (waitingForFinalResult) {
      Log.d(
        TAG,
        "Final USSD response detected: $dialogText"
      )

      waitingForFinalResult = false
      requestActive = false

      val callback = onResult
      onResult = null

      callback?.invoke(dialogText)
    }
  }

  override fun onInterrupt() {
    Log.d(TAG, "Accessibility service interrupted")
  }

  private fun logNodeTree(
    node: AccessibilityNodeInfo,
    depth: Int
  ) {
    /*
     * Prevent an unexpectedly huge accessibility tree from flooding
     * logcat.
     */
    if (depth > 15) return

    val indent = "  ".repeat(depth)

    Log.d(
      TAG,
      "$indent[${node.className}] " +
        "text='${node.text}' " +
        "editable=${node.isEditable} " +
        "clickable=${node.isClickable} " +
        "id=${node.viewIdResourceName}"
    )

    for (i in 0 until node.childCount) {
      try {
        node.getChild(i)?.let {
          logNodeTree(it, depth + 1)
        }
      } catch (_: Exception) {
      }
    }
  }

  private fun extractText(
    node: AccessibilityNodeInfo
  ): String? {
    val builder = StringBuilder()

    collectText(node, builder)

    return builder
      .toString()
      .replace(Regex("\\s+"), " ")
      .trim()
      .ifBlank { null }
  }

  private fun collectText(
    node: AccessibilityNodeInfo,
    builder: StringBuilder
  ) {
    node.text?.let {
      builder.append(it).append(" ")
    }

    for (i in 0 until node.childCount) {
      try {
        node.getChild(i)?.let {
          collectText(it, builder)
        }
      } catch (_: Exception) {
      }
    }
  }

  /**
   * Send a menu/input value into the current USSD dialog.
   *
   * IMPORTANT:
   *
   * ACTION_SET_TEXT replaces the complete contents of the field.
   * Therefore we set the complete input ONCE.
   *
   * The old implementation attempted to send one character at a time
   * using ACTION_SET_TEXT. That does not behave like keyboard typing and
   * can leave only the final character in the field.
   */
  private fun typeAndSend(
    root: AccessibilityNodeInfo,
    editField: AccessibilityNodeInfo,
    input: String
  ) {
    try {
      Log.d(TAG, "=== SETTING USSD INPUT ===")
      Log.d(TAG, "Input='$input'")

      val args = Bundle()

      args.putCharSequence(
        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
        input
      )

      val setResult = editField.performAction(
        AccessibilityNodeInfo.ACTION_SET_TEXT,
        args
      )

      Log.d(
        TAG,
        "ACTION_SET_TEXT result=$setResult"
      )

      Thread.sleep(250)

      val currentText =
        editField.text?.toString() ?: ""

      Log.d(
        TAG,
        "Field after input='$currentText'"
      )

      if (currentText != input) {
        Log.w(
          TAG,
          "USSD input verification mismatch. " +
            "Expected='$input' actual='$currentText'"
        )
      }

      Thread.sleep(250)

      clickSendButton(root)

    } catch (e: Exception) {
      Log.e(
        TAG,
        "Error entering USSD input: ${e.message}",
        e
      )

      /*
       * If an input cannot be entered, do not report success.
       */
    }
  }

  private fun clickSendButton(
    root: AccessibilityNodeInfo
  ) {
    try {
      Log.d(TAG, "Finding USSD send/OK button")

      val sendButton =
        findClickableButton(root)

      if (sendButton == null) {
        Log.w(
          TAG,
          "No clickable USSD send/OK button found"
        )
        return
      }

      Thread.sleep(150)

      val clicked =
        sendButton.performAction(
          AccessibilityNodeInfo.ACTION_CLICK
        )

      Log.d(
        TAG,
        "USSD send button clicked=$clicked"
      )

    } catch (e: Exception) {
      Log.e(
        TAG,
        "Error clicking USSD send button: ${e.message}",
        e
      )
    }
  }

  private fun findEditableNode(
    node: AccessibilityNodeInfo
  ): AccessibilityNodeInfo? {
    if (node.isEditable) {
      return node
    }

    for (i in 0 until node.childCount) {
      try {
        node.getChild(i)?.let { child ->
          findEditableNode(child)?.let {
            return it
          }
        }
      } catch (_: Exception) {
      }
    }

    return null
  }

  private fun findDismissButton(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    val text = node.text?.toString()?.trim()?.lowercase() ?: ""
    val className = node.className?.toString()?.lowercase() ?: ""
    val dismissText = setOf("close", "cancel", "dismiss", "ok", "done", "end", "hang up")
    if (node.isClickable && (text in dismissText || (className.contains("button") && text.isNotBlank()))) return node
    for (i in 0 until node.childCount) { try { node.getChild(i)?.let { findDismissButton(it)?.let { found -> return found } } } catch (_: Exception) {} }
    return null
  }

  private fun findClickableButton(
    node: AccessibilityNodeInfo
  ): AccessibilityNodeInfo? {

    val className =
      node.className?.toString()?.lowercase() ?: ""

    val text =
      node.text?.toString()?.lowercase() ?: ""

    /*
     * Prefer obvious Send/OK/Continue buttons.
     */
    if (
      node.isClickable &&
      (
        text == "send" ||
        text == "ok" ||
        text == "yes" ||
        text == "continue" ||
        text == "submit" ||
        className.contains("button")
      )
    ) {
      return node
    }

    for (i in 0 until node.childCount) {
      try {
        node.getChild(i)?.let { child ->
          findClickableButton(child)?.let {
            return it
          }
        }
      } catch (_: Exception) {
      }
    }

    return null
  }
}