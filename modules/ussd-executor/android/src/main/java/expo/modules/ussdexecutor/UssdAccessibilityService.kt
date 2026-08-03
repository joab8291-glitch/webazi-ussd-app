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

    val arguments = android.os.Bundle()
    arguments.putCharSequence(
      AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
      input
    )
    editField.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)

    val sendButton = findClickableButton(root)
    if (sendButton == null) {
      Log.w(TAG, "No send/OK button found")
    }
    sendButton?.performAction(AccessibilityNodeInfo.ACTION_CLICK)
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
