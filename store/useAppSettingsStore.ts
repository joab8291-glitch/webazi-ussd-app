import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import SmsListener from '../modules/sms-listener/src/SmsListenerModule';

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

  // Auto-retry failed deliveries, with escalating backoff: attempt 2
  // fires after backoffMs[0], attempt 3 after backoffMs[1], etc. Once
  // attempts exceed the array length, the order is left failed with a
  // notification instead of retrying forever.
  autoRetryEnabled: boolean;
  setAutoRetryEnabled: (v: boolean) => void;
  autoRetryBackoffMs: number[];
  setAutoRetryBackoffMs: (ms: number[]) => void;

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

  // Daily/weekly summary — shown automatically the next time the app is
  // opened after a day/week has passed since it was last shown (no
  // background task runner, so it can't be pushed while closed).
  dailySummaryEnabled: boolean;
  setDailySummaryEnabled: (v: boolean) => void;
  weeklySummaryEnabled: boolean;
  setWeeklySummaryEnabled: (v: boolean) => void;
  lastDailySummaryAt: string | null;
  setLastDailySummaryAt: (iso: string) => void;
  lastWeeklySummaryAt: string | null;
  setLastWeeklySummaryAt: (iso: string) => void;

  // Auto-relaunch the app 5s after a device reboot, if the SMS listener was
  // active beforehand. Mirrored to a native flag (SmsBootReceiver reads it,
  // not this store) every time it changes, since the boot receiver runs
  // outside any JS instance and can't reach AsyncStorage/zustand.
  relaunchAppOnBoot: boolean;
  setRelaunchAppOnBoot: (v: boolean) => void;
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
      // 2min, 5min, 15min — 3 retries then leave it failed.
      autoRetryBackoffMs: [2 * 60000, 5 * 60000, 15 * 60000],
      setAutoRetryBackoffMs: (ms) =>
        set({ autoRetryBackoffMs: ms.filter((n) => Number.isFinite(n) && n > 0) }),

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

      dailySummaryEnabled: true,
      setDailySummaryEnabled: (v) => set({ dailySummaryEnabled: v }),
      weeklySummaryEnabled: true,
      setWeeklySummaryEnabled: (v) => set({ weeklySummaryEnabled: v }),
      lastDailySummaryAt: null,
      setLastDailySummaryAt: (iso) => set({ lastDailySummaryAt: iso }),
      lastWeeklySummaryAt: null,
      setLastWeeklySummaryAt: (iso) => set({ lastWeeklySummaryAt: iso }),

      relaunchAppOnBoot: false,
      setRelaunchAppOnBoot: (v) => {
        set({ relaunchAppOnBoot: v });
        // Requires a native rebuild — guarded so this still works against
        // an older build of the sms-listener module.
        if (typeof SmsListener.setRelaunchAppOnBootEnabled === 'function') {
          try {
            SmsListener.setRelaunchAppOnBootEnabled(v);
          } catch {
            // Ignore — worst case the native flag falls out of sync until
            // the next toggle, no crash risk either way.
          }
        }
      },
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
