import { NativeModule, requireNativeModule } from 'expo';

import { SmsListenerModuleEvents, SimSlotInfo } from './SmsListener.types';

declare class SmsListenerModule extends NativeModule<SmsListenerModuleEvents> {
  startListening(): void;
  stopListening(): void;
  getSimSlots(): SimSlotInfo[];
}

// This call loads the native module object from the JSI.
export default requireNativeModule<SmsListenerModule>('SmsListener');
