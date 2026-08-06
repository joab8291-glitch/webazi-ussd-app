import { create } from 'zustand';
import { Transaction, fetchAll } from '../services/api';

type State = {
  transactions: Transaction[];
  loading: boolean;
  refresh: (status?: string) => Promise<void>;
};

export const useTransactionStore = create<State>((set) => ({
  transactions: [],
  loading: false,
  refresh: async (status?: string) => {
    set({ loading: true });
    try {
      const data = await fetchAll(status);
      set({ transactions: data, loading: false });
    } catch (e) {
      set({ loading: false });
    }
  },
}));
