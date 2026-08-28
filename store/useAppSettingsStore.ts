import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Local app-wide tuning knobs, mirroring Bingwa's "USSD Settings" screen:
 * verified senders, dialog/screen behavior around dialing, timeouts,
 * auto-retry, auto-delete, and a privacy toggle for the Home stats.
 */

const DEFAULT_TRUSTED_SENDERS = ['MPESA'];

type State = {
  // Verified Senders — SMS on the Till SIM is only parsed if the sender
  // name matches one of these (case-insensitive, substring match).
  trustedSenders: string[];
  addTrustedSender: (sender: string) => void;
  removeTrustedSender: (sender: string) => void;

  // Auto-close ongoing USSD dialogs before starting a new one.
  autoCloseUssdDialogs: boolean;
  setAutoCloseUssdDialogs: (v: boolean) => void;

  // Keep the screen on for the duration of a (possibly multi-chunk) dial.
  keepScreenAwakeDuringDial: boolean;
  setKeepScreenAwakeDuringDial: (v: boolean) => void;

  // How long to wait for a USSD response before treating it as failed.
  ussdTimeoutMs: number;
  setUssdTimeoutMs: (ms: number) => void;

  // Auto-retry failed deliveries.
  autoRetryEnabled: boolean;
  setAutoRetryEnabled: (v: boolean) => void;
  autoRetryDelayMs: number;
  setAutoRetryDelayMs: (ms: number) => void;

  // Purge completed/failed orders older than N days. null/0 = never.
  // Pending orders are never auto-deleted.
  autoDeleteDays: number | null;
  setAutoDeleteDays: (days: number | null) => void;
  autoDeleteLastRunAt: string | null;
  setAutoDeleteLastRunAt: (iso: string) => void;

  // Privacy toggle for the Home screen's queue stats.
  statsHidden: boolean;
  setStatsHidden: (v: boolean) => void;

  // Pause between consecutive USSD dials when a single order is chunked
  // into multiple *140*10000*...# dials (orders over KES 10,000). Without
  // this, back-to-back dials with zero gap can trip telco rate-limiting.
  interDialDelayMs: number;
  setInterDialDelayMs: (ms: number) => void;

  // Missed Messages — on app launch, scan the device's actual SMS inbox
  // for Till-SIM messages that arrived while the app/process was killed,
  // so a payment isn't silently lost.
  missedMessagesScanEnabled: boolean;
  setMissedMessagesScanEnabled: (v: boolean) => void;
  lastInboxScanAt: string | null;
  setLastInboxScanAt: (iso: string) => void;
};

export const useAppSettingsStore = create<State>()(
  persist(
    (set) => ({
      trustedSenders: DEFAULT_TRUSTED_SENDERS,
      addTrustedSender: (sender) => {
        const trimmed = sender.trim();
        if (!trimmed) return;
        set((s) =>
          s.trustedSenders.some((x) => x.toLowerCase() === trimmed.toLowerCase())
            ? s
            : { trustedSenders: [...s.trustedSenders, trimmed] }
        );
      },
      removeTrustedSender: (sender) => {
        set((s) => ({
          trustedSenders: s.trustedSenders.filter(
            (x) => x.toLowerCase() !== sender.toLowerCase()
          ),
        }));
      },

      autoCloseUssdDialogs: true,
      setAutoCloseUssdDialogs: (v) => set({ autoCloseUssdDialogs: v }),

      keepScreenAwakeDuringDial: false,
      setKeepScreenAwakeDuringDial: (v) => set({ keepScreenAwakeDuringDial: v }),

      ussdTimeoutMs: 30000,
      setUssdTimeoutMs: (ms) => set({ ussdTimeoutMs: Math.max(5000, ms) }),

      autoRetryEnabled: false,
      setAutoRetryEnabled: (v) => set({ autoRetryEnabled: v }),
      autoRetryDelayMs: 60000,
      setAutoRetryDelayMs: (ms) => set({ autoRetryDelayMs: Math.max(10000, ms) }),

      autoDeleteDays: null,
      setAutoDeleteDays: (days) => set({ autoDeleteDays: days && days > 0 ? days : null }),
      autoDeleteLastRunAt: null,
      setAutoDeleteLastRunAt: (iso) => set({ autoDeleteLastRunAt: iso }),

      statsHidden: false,
      setStatsHidden: (v) => set({ statsHidden: v }),

      interDialDelayMs: 100,
      setInterDialDelayMs: (ms) =>
        set({ interDialDelayMs: Math.max(0, Math.min(10000, Math.round(ms))) }),

      missedMessagesScanEnabled: true,
      setMissedMessagesScanEnabled: (v) => set({ missedMessagesScanEnabled: v }),
      lastInboxScanAt: null,
      setLastInboxScanAt: (iso) => set({ lastInboxScanAt: iso }),
    }),
    {
      name: 'webazi-app-settings-store',

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
    }
  )
);
