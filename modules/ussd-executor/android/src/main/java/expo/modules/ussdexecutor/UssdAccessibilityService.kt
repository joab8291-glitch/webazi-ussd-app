package expo.modules.ussdexecutor

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

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
      // Step 1: Clear the field first
      Log.d(TAG, "Step 1: Clearing text field")
      val clearArguments = android.os.Bundle()
      clearArguments.putCharSequence(
        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
        ""
      )
      editField.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, clearArguments)

      // Step 2: Wait for field to clear (race condition fix)
      Log.d(TAG, "Step 2: Waiting 50ms for field to clear")
      Thread.sleep(50)

      // Step 3: Set the new text
      Log.d(TAG, "Step 3: Setting text field to: '$input' (length=${input.length})")
      val typeArguments = android.os.Bundle()
      typeArguments.putCharSequence(
        AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
        input
      )
      editField.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, typeArguments)

      // Step 4: Wait longer for text to be processed (increased from 100ms to 150ms)
      Log.d(TAG, "Step 4: Waiting 150ms for text to be processed")
      Thread.sleep(150)

      // Step 5: Verify text was actually set
      val currentText = editField.text
      Log.d(TAG, "Step 5: Verification - text field now contains: '$currentText'")
      if (currentText.toString() != input) {
        Log.w(TAG, "WARNING: Text mismatch! Expected: '$input', but got: '$currentText'")
      }

      // Step 6: Find and click send button
      Log.d(TAG, "Step 6: Looking for send button")
      val sendButton = findClickableButton(root)
      if (sendButton == null) {
        Log.w(TAG, "ERROR: No send/OK button found")
      } else {
        Log.d(TAG, "Step 7: Clicking send button")
        sendButton.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      }
    } catch (e: Exception) {
      Log.e(TAG, "ERROR in typeAndSend: ${e.message}", e)
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
