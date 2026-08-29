package expo.modules.schedulerservice

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Boots a headless (no Activity, no UI) JS instance to run the
 * "SchedulerCheckTask" registered in the app's root index.js. This is
 * the standard React Native pattern for background work that must
 * survive the app being fully backgrounded — the same category of thing
 * delivery apps use for guaranteed background execution.
 */
class SchedulerTaskService : HeadlessJsTaskService() {

  override fun getTaskConfig(intent: Intent): HeadlessJsTaskConfig {
    val extras: Bundle = intent.extras ?: Bundle()
    return HeadlessJsTaskConfig(
      "SchedulerCheckTask",
      Arguments.fromBundle(extras),
      60_000L, // timeout — must comfortably exceed a real manualDeliver() round trip
      true      // allowedInForeground — let it still run if the app happens to be open too
    )
  }
}
