import { create } from 'zustand';

export type SimSlot = {
  subscriptionId: number;
  slotIndex: number;
  carrierName: string | null;
  displayName?: string | null;
  number: string | null;
};

type State = {
  tillSubscriptionId: number | null;
  availableSims: SimSlot[];
  smsListening: boolean;
  setTillSim: (id: number | null) => void;
  setAvailableSims: (sims: SimSlot[]) => void;
  setSmsListening: (v: boolean) => void;
};

export const useSimStore = create<State>((set) => ({
  tillSubscriptionId: null,
  availableSims: [],
  smsListening: false,
  setTillSim: (id) => set({ tillSubscriptionId: id }),
  setAvailableSims: (sims) => set({ availableSims: sims }),
  setSmsListening: (v) => set({ smsListening: v }),
}));
