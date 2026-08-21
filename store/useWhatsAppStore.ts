import { create } from 'zustand';

type State = {
  enabled: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  notifyOnComplete: boolean;
  notifyOnFail: boolean;
  setEnabled: (v: boolean) => void;
  setPhoneNumberId: (v: string) => void;
  setBusinessAccountId: (v: string) => void;
  setNotifyOnComplete: (v: boolean) => void;
  setNotifyOnFail: (v: boolean) => void;
};

export const useWhatsAppStore = create<State>((set) => ({
  enabled: false,
  phoneNumberId: '',
  businessAccountId: '',
  notifyOnComplete: true,
  notifyOnFail: true,
  setEnabled: (v) => set({ enabled: v }),
  setPhoneNumberId: (v) => set({ phoneNumberId: v }),
  setBusinessAccountId: (v) => set({ businessAccountId: v }),
  setNotifyOnComplete: (v) => set({ notifyOnComplete: v }),
  setNotifyOnFail: (v) => set({ notifyOnFail: v }),
}));
