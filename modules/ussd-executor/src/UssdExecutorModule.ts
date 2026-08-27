import { NativeModule, requireNativeModule } from 'expo';
import { UssdExecutorModuleEvents } from './UssdExecutor.types';

declare class UssdExecutorModule extends NativeModule<UssdExecutorModuleEvents> {
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;
  dialUssd(ussdCode: string, subscriptionId: number, menuInputs: string[]): void;
  // Added for auto-close-dialogs / keep-screen-awake settings. Requires a
  // native rebuild — guard calls with `typeof X === 'function'` until the
  // app has been rebuilt with this module version.
  closeLingeringUssdDialog(): void;
  acquireDialWakeLock(): void;
  releaseDialWakeLock(): void;
}

export default requireNativeModule<UssdExecutorModule>('UssdExecutor');
