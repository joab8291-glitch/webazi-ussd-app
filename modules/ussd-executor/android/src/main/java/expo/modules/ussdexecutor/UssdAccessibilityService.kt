package expo.modules.ussdexecutor

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class UssdAccessibilityService : AccessibilityService() {

  companion object {
    private const val TAG = "UssdAccessibility"

    var pendingInputs: MutableList<String> = mutableListOf()

    var onResult: ((String, Boolean) -> Unit)? = null

    // True only after a USSD session has actually been started.
    private var sessionActive = false

    // When entering menu inputs, ignore accessibility events until the
    // Send/OK button has actually been pressed.
    private var waitingForFinalResult = false

    // Prevent duplicate callbacks for the same USSD session.
    private var resultSent = false

    fun startSession(inputs: List<String>) {
      pendingInputs = inputs.toMutableList()
      sessionActive = true
      resultSent = false
      waitingForFinalResult = inputs.isEmpty()

      Log.d(
        TAG,
        "=== USSD SESSION STARTED === inputs=$inputs waitingForFinalResult=$waitingForFinalResult"
      )
    }

    fun cancelSession() {
      pendingInputs.clear()
      sessionActive = false
      waitingForFinalResult = false
      resultSent = false
      onResult = null

      Log.d(TAG, "=== USSD SESSION CANCELLED ===")
    }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    if (!sessionActive || resultSent) return

    Log.d(
      TAG,
      "Event: type=${event.eventType} package=${event.packageName} class=${event.className}"
    )

    val rootNode = rootInActiveWindow ?: return

    val dialogText = extractText(rootNode)

    if (dialogText.isNullOrBlank()) return

    Log.d(TAG, "Extracted dialog text: $dialogText")

    /*
     * If we still have menu inputs, this is an input screen.
     *
     * Do NOT treat its text as the final result.
     */
    if (pendingInputs.isNotEmpty()) {
      if (!waitingForFinalResult) {
        val nextInput = pendingInputs.removeAt(0)

        Log.d(TAG, "Sending queued input: $nextInput")

        typeAndSend(rootNode, nextInput)

        return
      }
    }

    /*
     * We are waiting for the actual carrier response.
     *
     * Ignore intermediate USSD screens.
     */
    if (!waitingForFinalResult) {
      Log.d(TAG, "Waiting for Send/OK before processing final result")
      return
    }

    val result = classifyUssdResult(dialogText)

    when (result) {
      UssdResult.SUCCESS -> {
        Log.d(TAG, "=== VERIFIED USSD SUCCESS ===")
        completeSession(dialogText, true)
      }

      UssdResult.FAILURE -> {
        Log.w(TAG, "=== VERIFIED USSD FAILURE ===")
        completeSession(dialogText, false)
      }

      UssdResult.UNKNOWN -> {
        /*
         * IMPORTANT:
         *
         * Unknown does NOT mean success.
         *
         * We simply wait for another accessibility event containing the
         * actual carrier response. The JS poller will eventually timeout
         * if no definitive response arrives.
         */
        Log.d(
          TAG,
          "USSD response not yet definitive — waiting for final carrier response"
        )
      }
    }
  }

  override fun onInterrupt() {
    Log.w(TAG, "Accessibility service interrupted")
  }

  private enum class UssdResult {
    SUCCESS,
    FAILURE,
    UNKNOWN
  }

  /**
   * Classify the actual carrier response.
   *
   * SUCCESS is intentionally strict.
   *
   * We do NOT accept generic words such as:
   * "successful"
   * "success"
   * "completed"
   *
   * unless they appear in the expected successful Sambaza response.
   */
  private fun classifyUssdResult(text: String): UssdResult {
    val normalized = text
      .replace("\n", " ")
      .replace("\r", " ")
      .replace("\\s+".toRegex(), " ")
      .trim()
      .lowercase()

    Log.d(TAG, "Classifying USSD response: $normalized")

    /*
     * Safaricom Sambaza success.
     *
     * Example:
     * "You have successfully sent Ksh 50.00 airtime to 0722 123 456
     *  Your new balance is Ksh 12.34
     *  Transaction cost: Ksh 1.00"
     *
     * Require BOTH:
     * - successfully sent
     * - airtime
     *
     * This prevents generic "successful" text from being accepted.
     */
    val safaricomSuccess =
      normalized.contains("successfully sent") &&
      normalized.contains("airtime")

    if (safaricomSuccess) {
      return UssdResult.SUCCESS
    }

    /*
     * Other known Safaricom success wording.
     */
    if (
      normalized.contains("you have successfully sent") &&
      normalized.contains("ksh")
    ) {
      return UssdResult.SUCCESS
    }

    /*
     * Known failure responses.
     */
    val failurePatterns = listOf(
      "insufficient account balance",
      "insufficient airtime balance",
      "insufficient balance",
      "invalid number",
      "transaction failed",
      "unable to complete request",
      "unable to complete",
      "request cannot be processed",
      "cannot be processed now",
      "please try again later",
      "try again later",
      "failed to process",
      "transaction could not be completed",
      "could not be completed",
      "not enough airtime",
      "not enough balance",
      "invalid recipient"
    )

    if (failurePatterns.any { normalized.contains(it) }) {
      return UssdResult.FAILURE
    }

    return UssdResult.UNKNOWN
  }

  private fun completeSession(
    resultText: String,
    success: Boolean
  ) {
    if (resultSent) return

    resultSent = true
    sessionActive = false
    waitingForFinalResult = false
    pendingInputs.clear()

    Log.d(
      TAG,
      "=== USSD SESSION COMPLETE === success=$success result=$resultText"
    )

    onResult?.invoke(resultText, success)
    onResult = null
  }

  /**
   * Dumps the accessibility node tree for debugging Samsung's USSD UI.
   */
  private fun logNodeTree(
    node: AccessibilityNodeInfo,
    depth: Int
  ) {
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
      node.getChild(i)?.let {
        logNodeTree(it, depth + 1)
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
      node.getChild(i)?.let {
        collectText(it, builder)
      }
    }
  }

  private fun typeAndSend(
    root: AccessibilityNodeInfo,
    input: String
  ) {
    val editField = findEditableNode(root)

    if (editField == null) {
      Log.w(TAG, "No editable field found — cannot send input")

      /*
       * Do not leave the session pretending everything is fine.
       * The JS side will eventually timeout.
       */
      waitingForFinalResult = false
      return
    }

    try {
      Log.d(TAG, "=== TYPING USSD INPUT ===")
      Log.d(TAG, "Input='$input' length=${input.length}")

      /*
       * We are currently editing an input field.
       * Ignore accessibility events until Send is clicked.
       */
      waitingForFinalResult = false

      Log.d(TAG, "Step 1: Clearing field")

      val clearArgs = Bundle()

      clearArgs.putCharSequence(
        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
        ""
      )

      editField.performAction(
        AccessibilityNodeInfo.ACTION_SET_TEXT,
        clearArgs
      )

      Thread.sleep(100)

      Log.d(TAG, "Step 2: Typing input character by character")

      for ((index, char) in input.withIndex()) {
        Log.d(
          TAG,
          "Typing [${
            index + 1
          }/${input.length}]: '$char'"
        )

        val typeArgs = Bundle()

        typeArgs.putCharSequence(
          AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
          char.toString()
        )

        editField.performAction(
          AccessibilityNodeInfo.ACTION_SET_TEXT,
          typeArgs
        )

        Thread.sleep(40)
      }

      Thread.sleep(200)

      val currentText =
        editField.text?.toString() ?: ""

      Log.d(
        TAG,
        "Verification: expected='$input' actual='$currentText'"
      )

      if (currentText != input) {
        Log.w(
          TAG,
          "Input mismatch — expected '$input', got '$currentText'"
        )
      }

      clickSendButton(root)

    } catch (e: Exception) {
      Log.e(
        TAG,
        "Error in typeAndSend: ${e.message}",
        e
      )
    }
  }

  private fun clickSendButton(
    root: AccessibilityNodeInfo
  ) {
    try {
      Log.d(TAG, "Finding Send/OK button")

      val sendButton = findClickableButton(root)

      if (sendButton == null) {
        Log.w(TAG, "No Send/OK button found")
        return
      }

      Thread.sleep(150)

      Log.d(TAG, "Clicking Send/OK button")

      val clicked =
        sendButton.performAction(
          AccessibilityNodeInfo.ACTION_CLICK
        )

      Log.d(TAG, "Send button clicked=$clicked")

      /*
       * Only NOW should accessibility events be considered final
       * carrier responses.
       */
      waitingForFinalResult = true

    } catch (e: Exception) {
      Log.e(
        TAG,
        "Error clicking Send/OK: ${e.message}",
        e
      )
    }
  }

  private fun findEditableNode(
    node: AccessibilityNodeInfo
  ): AccessibilityNodeInfo? {
    if (node.isEditable) return node

    for (i in 0 until node.childCount) {
      node.getChild(i)?.let { child ->
        findEditableNode(child)?.let {
          return it
        }
      }
    }

    return null
  }

  private fun findClickableButton(
    node: AccessibilityNodeInfo
  ): AccessibilityNodeInfo? {
    val className =
      node.className?.toString()?.lowercase() ?: ""

    if (
      node.isClickable &&
      (
        className.contains("button") ||
        className.contains("textview")
      )
    ) {
      return node
    }

    for (i in 0 until node.childCount) {
      node.getChild(i)?.let { child ->
        findClickableButton(child)?.let {
          return it
        }
      }
    }

    return null
  }
}