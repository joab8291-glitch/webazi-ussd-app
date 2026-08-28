import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Fully local order tracking. Nothing here talks to the backend — an
 * order exists because handleSms() decoded a payment SMS and dialed
 * USSD, and it's marked completed only once Safaricom's own USSD
 * response confirms delivery. The device is the source of truth.
 */

export type DialResult = {
  ussdCode: string;
  amount: number;
  success: boolean;
  result: string;
};

export type LocalTransaction = {
  id: string;
  ref: string;
  receipt: string | null;
  network: 'safaricom' | 'airtel';
  phone: string;
  amount: number;
  deliveredAmount: number;
  status: 'pending' | 'completed' | 'failed';
  dialResults: DialResult[];
  failureReason: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

type State = {
  transactions: LocalTransaction[];
  addPending: (input: {
    ref: string;
    receipt: string | null;
    network: 'safaricom' | 'airtel';
    phone: string;
    amount: number;
  }) => string;
  recordDialResult: (id: string, dial: DialResult) => void;
  markCompleted: (id: string) => void;
  markFailed: (id: string, reason: string) => void;
  bumpAttempts: (id: string) => void;
  deleteTransaction: (id: string) => void;
  purgeOlderThan: (days: number) => void;
};

export const useTransactionStore = create<State>()(
  persist(
    (set) => ({
      transactions: [],

      addPending: ({ ref, receipt, network, phone, amount }) => {
        const id = `${ref}-${Date.now()}`;
        const now = new Date().toISOString();

        set((s) => ({
          transactions: [
            {
              id,
              ref,
              receipt,
              network,
              phone,
              amount,
              deliveredAmount: 0,
              status: 'pending',
              dialResults: [],
              failureReason: null,
              attempts: 1,
              createdAt: now,
              updatedAt: now,
            },
            ...s.transactions,
          ],
        }));

        return id;
      },

      recordDialResult: (id, dial) => {
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  dialResults: [...t.dialResults, dial],
                  deliveredAmount: dial.success
                    ? t.deliveredAmount + dial.amount
                    : t.deliveredAmount,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }));
      },

      markCompleted: (id) => {
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: 'completed',
                  failureReason: null,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }));
      },

      markFailed: (id, reason) => {
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: 'failed',
                  failureReason: reason,
                  updatedAt: new Date().toISOString(),
                }
              : t
          ),
        }));
      },

      bumpAttempts: (id) => {
        set((s) => ({
          transactions: s.transactions.map((t) =>
            t.id === id ? { ...t, attempts: t.attempts + 1 } : t
          ),
        }));
      },

      deleteTransaction: (id) => {
        set((s) => ({
          transactions: s.transactions.filter((t) => t.id !== id),
        }));
      },

      purgeOlderThan: (days) => {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

        set((s) => ({
          // Pending orders are never auto-deleted, regardless of age —
          // only resolved (completed/failed) ones get purged.
          transactions: s.transactions.filter(
            (t) => t.status === 'pending' || new Date(t.createdAt).getTime() >= cutoff
          ),
        }));
      },
    }),
    {
      name: 'webazi-transaction-store',

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
