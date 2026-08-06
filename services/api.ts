const BASE_URL = 'https://webazi-digital-solutions.onrender.com';

export type Transaction = {
  id: number;
  receipt: string;
  phone: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'retry';
  attempts: number;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchPending(): Promise<Transaction[]> {
  const res = await fetch(`${BASE_URL}/transactions/pending`);
  return res.json();
}

export async function fetchAll(status?: string): Promise<Transaction[]> {
  const url = status ? `${BASE_URL}/transactions?status=${status}` : `${BASE_URL}/transactions`;
  const res = await fetch(url);
  return res.json();
}

export async function reportComplete(id: number): Promise<void> {
  await fetch(`${BASE_URL}/transactions/${id}/complete`, { method: 'POST' });
}

export async function reportFail(id: number, reason: string): Promise<void> {
  await fetch(`${BASE_URL}/transactions/${id}/fail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

export async function requeue(id: number): Promise<void> {
  await fetch(`${BASE_URL}/transactions/${id}/requeue`, { method: 'POST' });
}
