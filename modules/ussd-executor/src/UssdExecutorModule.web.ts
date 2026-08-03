import { registerWebModule, NativeModule } from 'expo';

import { UssdExecutorModuleEvents } from './UssdExecutor.types';

class UssdExecutorModule extends NativeModule<UssdExecutorModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(UssdExecutorModule, 'UssdExecutorModule');
