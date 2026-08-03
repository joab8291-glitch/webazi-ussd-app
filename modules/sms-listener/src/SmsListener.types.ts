export type SmsReceivedPayload = {
  sender: string;
  body: string;
  subscriptionId: number;
  timestamp: number;
};

export type SmsListenerModuleEvents = {
  onSmsReceived: (params: SmsReceivedPayload) => void;
};

export type SimSlotInfo = {
  subscriptionId: number;
  slotIndex: number;
  carrierName: string | null;
  displayName: string | null;
  number: string | null;
};
