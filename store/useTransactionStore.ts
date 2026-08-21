import { create } from 'zustand';
import { Transaction, fetchAll } from '../services/api';

type State = {
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  refresh: (status?: string) => Promise<void>;
};

export const useTransactionStore = create<State>((set) => ({
  transactions: [],
  loading: false,
  error: null,
  refresh: async (status?: string) => {
    set({ loading: true, error: null });
    try {
      const data = await fetchAll(status);
      set({ transactions: Array.isArray(data) ? data : [], loading: false });
    } catch (e: any) {
      set({ loading: false, error: String(e?.message ?? e) });
    }
  },
}));
