import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useSimStore = create<State>()(
  persist(
    (set) => ({
      tillSubscriptionId: null,
      availableSims: [],
      smsListening: false,

      setTillSim: (id) => set({
        tillSubscriptionId: id,
      }),

      setAvailableSims: (sims) => set({
        availableSims: sims,
      }),

      setSmsListening: (v) => set({
        smsListening: v,
      }),
    }),
    {
      name: 'webazi-sim-store',
      storage: {
        getItem: async (name) => {
          const value = await AsyncStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: async (name, value) => {
          await AsyncStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: async (name) => {
          await AsyncStorage.removeItem(name);
        },
      },
      partialize: (state) => ({
        tillSubscriptionId: state.tillSubscriptionId,
      }),
    }
  )
);