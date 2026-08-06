import { NativeModule, requireNativeModule } from 'expo';
import { UssdExecutorModuleEvents } from './UssdExecutor.types';

declare class UssdExecutorModule extends NativeModule<UssdExecutorModuleEvents> {
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;
  dialUssd(ussdCode: string, subscriptionId: number, menuInputs: string[]): void;
}

export default requireNativeModule<UssdExecutorModule>('UssdExecutor');
