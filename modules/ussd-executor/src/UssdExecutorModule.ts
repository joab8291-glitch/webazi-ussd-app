import { NativeModule, requireNativeModule } from 'expo';

import { UssdExecutorModuleEvents } from './UssdExecutor.types';

declare class UssdExecutorModule extends NativeModule<UssdExecutorModuleEvents> {
  startUssd(code: string, inputs: string[], subscriptionId: number): Promise<string>;
  isAccessibilityServiceEnabled(): boolean;
}

export default requireNativeModule<UssdExecutorModule>('UssdExecutor');
