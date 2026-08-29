// Custom entry point, needed because AppRegistry.registerHeadlessTask()
// must run at JS-bundle-load time — including when Android boots a
// headless (no-Activity) instance to run "SchedulerCheckTask". Expo
// Router's default entry ("expo-router/entry") doesn't give us a hook to
// run this first, so this file replaces it as "main" in package.json and
// hands off to expo-router/entry immediately after registering the task.
import { AppRegistry } from 'react-native';
import { schedulerHeadlessTask } from './services/schedulerHeadlessTask';

AppRegistry.registerHeadlessTask('SchedulerCheckTask', () => schedulerHeadlessTask);

require('expo-router/entry');
