import * as React from 'react';

import { UssdExecutorViewProps } from './UssdExecutor.types';

export default function UssdExecutorView(props: UssdExecutorViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
