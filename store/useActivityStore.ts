import { create } from 'zustand';

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export type ActivityEntry = {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
};

type State = {
  logs: ActivityEntry[];
  addLog: (level: LogLevel, message: string) => void;
  clear: () => void;
};

const MAX_LOGS = 200;

export const useActivityStore = create<State>((set) => ({
  logs: [],
  addLog: (level, message) =>
    set((s) => ({
      logs: [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          level,
          message,
          timestamp: Date.now(),
        },
        ...s.logs,
      ].slice(0, MAX_LOGS),
    })),
  clear: () => set({ logs: [] }),
}));
