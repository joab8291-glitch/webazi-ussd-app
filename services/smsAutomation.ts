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
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }));
      },

      purgeOlderThan: (days) => {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        set((s) => ({ transactions: s.transactions.filter((t) => t.status === 'pending' || new Date(t.createdAt).getTime() >= cutoff) }));
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
