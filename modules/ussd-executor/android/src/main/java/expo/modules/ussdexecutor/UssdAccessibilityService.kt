package expo.modules.ussdexecutor

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.os.Build

class UssdAccessibilityService : AccessibilityService() {

  companion object {
    private const val TAG = "UssdAccessibility"
    var pendingInputs: MutableList<String> = mutableListOf()
    var onResult: ((String) -> Unit)? = null
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return

    Log.d(TAG, "Event: type=${event.eventType} package=${event.packageName} class=${event.className}")

    val rootNode = rootInActiveWindow ?: return

    // Dump the full node tree to logcat so we can see exactly what Samsung renders
    logNodeTree(rootNode, 0)

    val dialogText = extractText(rootNode)
    if (dialogText.isNullOrBlank()) return

    Log.d(TAG, "Extracted dialog text: $dialogText")

    if (pendingInputs.isNotEmpty()) {
      val nextInput = pendingInputs.removeAt(0)
      Log.d(TAG, "Sending queued input: $nextInput")
      typeAndSend(rootNode, nextInput)
    } else {
      Log.d(TAG, "No pending inputs — treating as final response")
      onResult?.invoke(dialogText)
    }
  }

  override fun onInterrupt() {}

  // Dumps every node's class name, text, and interactive flags — this is what we'll
  // read from logcat to understand Samsung's actual USSD dialog structure
  private fun logNodeTree(node: AccessibilityNodeInfo, depth: Int) {
    val indent = "  ".repeat(depth)
    Log.d(
      TAG,
      "$indent[${node.className}] text='${node.text}' editable=${node.isEditable} clickable=${node.isClickable} id=${node.viewIdResourceName}"
    )
    for (i in 0 until node.childCount) {
      node.getChild(i)?.let { logNodeTree(it, depth + 1) }
    }
  }

  private fun extractText(node: AccessibilityNodeInfo): String? {
    val builder = StringBuilder()
    collectText(node, builder)
    return builder.toString().trim().ifBlank { null }
  }

  private fun collectText(node: AccessibilityNodeInfo, builder: StringBuilder) {
    node.text?.let { builder.append(it).append(" ") }
    for (i in 0 until node.childCount) {
      node.getChild(i)?.let { collectText(it, builder) }
    }
  }

  private fun typeAndSend(root: AccessibilityNodeInfo, input: String) {
    val editField = findEditableNode(root) ?: run {
      Log.w(TAG, "No editable field found — cannot send input")
      return
    }

    try {
      // Strategy 2: Character-by-character typing (most reliable for special chars like #)
      Log.d(TAG, "=== STRATEGY 2: Character-by-character typing ===")
      
      Log.d(TAG, "Step 1: Clearing field")
      val clearArgs = android.os.Bundle()
      clearArgs.putCharSequence(
        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
        ""
      )
      editField.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, clearArgs)
      Thread.sleep(50)

      Log.d(TAG, "Step 2: Typing each character individually: '$input' (length=${input.length})")
      for ((index, char) in input.withIndex()) {
        Log.d(TAG, "  [${index + 1}/${input.length}] Typing character: '$char'")
        
        val typeArgs = android.os.Bundle()
        typeArgs.putCharSequence(
          AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
          char.toString()
        )
        editField.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, typeArgs)
        
        // Wait between each character for UI to process (especially important for # and *)
        Thread.sleep(30)
      }

      Log.d(TAG, "Step 3: All characters typed, waiting for UI to settle")
      Thread.sleep(100)

      val currentText = editField.text.toString()
      Log.d(TAG, "Step 4: Verification - field contains: '$currentText'")

      if (currentText == input) {
        Log.d(TAG, "✓ SUCCESS: Text matches perfectly! '$currentText' == '$input'")
        clickSendButton(root)
      } else {
        Log.w(TAG, "✗ WARNING: Text mismatch! Expected '$input' but got '$currentText'")
        Log.w(TAG, "Clicking send anyway - carrier will reject if code is invalid")
        clickSendButton(root)
      }
    } catch (e: Exception) {
      Log.e(TAG, "✗ ERROR in typeAndSend: ${e.message}", e)
    }
  }

  /**
   * Helper: Click the send button
   */
  private fun clickSendButton(root: AccessibilityNodeInfo) {
    try {
      Log.d(TAG, "Step 5: Finding send button")
      val sendButton = findClickableButton(root)
      if (sendButton == null) {
        Log.w(TAG, "ERROR: No send/OK button found")
      } else {
        Log.d(TAG, "Step 6: Clicking send button")
        Thread.sleep(100)
        sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        Log.d(TAG, "✓ Send button clicked - USSD should execute now")
      }
    } catch (e: Exception) {
      Log.e(TAG, "ERROR clicking send button: ${e.message}", e)
    }
  }

  private fun findEditableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    if (node.isEditable) return node
    for (i in 0 until node.childCount) {
      node.getChild(i)?.let { child ->
        findEditableNode(child)?.let { return it }
      }
    }
    return null
  }

  private fun findClickableButton(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
    if (node.isClickable && node.className?.contains("Button") == true) return node
    for (i in 0 until node.childCount) {
      node.getChild(i)?.let { child ->
        findClickableButton(child)?.let { return it }
      }
    }
    return null
  }
}
