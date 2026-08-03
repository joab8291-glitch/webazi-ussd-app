import { requireNativeView } from 'expo';
import * as React from 'react';

import { UssdExecutorViewProps } from './UssdExecutor.types';

const NativeView: React.ComponentType<UssdExecutorViewProps> =
  requireNativeView('UssdExecutor');

export default function UssdExecutorView(props: UssdExecutorViewProps) {
  return <NativeView {...props} />;
}
