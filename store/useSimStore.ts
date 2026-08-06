import { create } from 'zustand';

type SimSlot = {
  subscriptionId: number;
  slotIndex: number;
  carrierName: string | null;
  number: string | null;
};

type State = {
  tillSubscriptionId: number | null;
  availableSims: SimSlot[];
  setTillSim: (id: number) => void;
  setAvailableSims: (sims: SimSlot[]) => void;
};

export const useSimStore = create<State>((set) => ({
  tillSubscriptionId: null,
  availableSims: [],
  setTillSim: (id) => set({ tillSubscriptionId: id }),
  setAvailableSims: (sims) => set({ availableSims: sims }),
}));
