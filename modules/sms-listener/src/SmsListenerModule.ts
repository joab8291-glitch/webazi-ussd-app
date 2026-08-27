import { NativeModule, requireNativeModule } from 'expo';

import { SmsListenerModuleEvents, SimSlotInfo, InboxMessage } from './SmsListener.types';

declare class SmsListenerModule extends NativeModule<SmsListenerModuleEvents> {
  startListening(): void;
  stopListening(): void;
  getSimSlots(): SimSlotInfo[];
  // Foreground service + missed-messages inbox scan. Require a native
  // rebuild — guard calls with `typeof X === 'function'` until the app has
  // been rebuilt with this module version.
  startForegroundService(): void;
  stopForegroundService(): void;
  queryInboxSince(sinceMillis: number, subscriptionId: number): InboxMessage[];
}

// This call loads the native module object from the JSI.
export default requireNativeModule<SmsListenerModule>('SmsListener');
