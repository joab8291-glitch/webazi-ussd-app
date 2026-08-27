import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_TRUSTED_SENDERS = ['MPESA'];

type State = {
  trustedSenders: string[]; addTrustedSender: (sender: string) => void; removeTrustedSender: (sender: string) => void;
  autoCloseUssdDialogs: boolean; setAutoCloseUssdDialogs: (v: boolean) => void;
  keepScreenAwakeDuringDial: boolean; setKeepScreenAwakeDuringDial: (v: boolean) => void;
  ussdTimeoutMs: number; setUssdTimeoutMs: (ms: number) => void;
  autoRetryEnabled: boolean; setAutoRetryEnabled: (v: boolean) => void;
  autoRetryDelayMs: number; setAutoRetryDelayMs: (ms: number) => void;
  autoDeleteDays: number | null; setAutoDeleteDays: (days: number | null) => void;
  autoDeleteLastRunAt: string | null; setAutoDeleteLastRunAt: (iso: string) => void;
  statsHidden: boolean; setStatsHidden: (v: boolean) => void;
};

export const useAppSettingsStore = create<State>()(persist((set) => ({
  trustedSenders: DEFAULT_TRUSTED_SENDERS,
  addTrustedSender: (sender) => { const trimmed = sender.trim(); if (!trimmed) return; set((s) => s.trustedSenders.some((x) => x.toLowerCase() === trimmed.toLowerCase()) ? s : { trustedSenders: [...s.trustedSenders, trimmed] }); },
  removeTrustedSender: (sender) => set((s) => ({ trustedSenders: s.trustedSenders.filter((x) => x.toLowerCase() !== sender.toLowerCase()) })),
  autoCloseUssdDialogs: true, setAutoCloseUssdDialogs: (v) => set({ autoCloseUssdDialogs: v }),
  keepScreenAwakeDuringDial: false, setKeepScreenAwakeDuringDial: (v) => set({ keepScreenAwakeDuringDial: v }),
  ussdTimeoutMs: 30000, setUssdTimeoutMs: (ms) => set({ ussdTimeoutMs: Math.max(5000, ms) }),
  autoRetryEnabled: false, setAutoRetryEnabled: (v) => set({ autoRetryEnabled: v }),
  autoRetryDelayMs: 60000, setAutoRetryDelayMs: (ms) => set({ autoRetryDelayMs: Math.max(10000, ms) }),
  autoDeleteDays: null, setAutoDeleteDays: (days) => set({ autoDeleteDays: days && days > 0 ? days : null }),
  autoDeleteLastRunAt: null, setAutoDeleteLastRunAt: (iso) => set({ autoDeleteLastRunAt: iso }),
  statsHidden: false, setStatsHidden: (v) => set({ statsHidden: v }),
}), { name: 'webazi-app-settings-store', storage: {
  getItem: async (name) => { const value = await AsyncStorage.getItem(name); return value ? JSON.parse(value) : null; },
  setItem: async (name, value) => { await AsyncStorage.setItem(name, JSON.stringify(value)); },
  removeItem: async (name) => { await AsyncStorage.removeItem(name); },
} }));
