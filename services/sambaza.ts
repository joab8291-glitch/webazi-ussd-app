/**
 * Safaricom Sambaza airtime fulfillment.
 *
 * Rule: max KES 10,000 per single Sambaza USSD transaction.
 * Larger payments are split into multiple dials, e.g.
 *   70,000 → 7 × 10,000
 *   25,500 → 2 × 10,000 + 1 × 5,500
 *
 * Official USSD pattern:
 *   *140*{amount}*{MSISDN}#
 * Example: *140*10000*254712345678#
 * MSISDN must be 2547XXXXXXXX / 2541XXXXXXXX (no leading 0).
 */

/** Safaricom hard limit per Sambaza transfer */
export const SAMBAZA_MAX_PER_TX = 10_000;

/** Minimum amount we will attempt (avoid dust dials) */
export const SAMBAZA_MIN_AMOUNT = 1;

export type SambazaChunk = {
  amount: number;
  index: number; // 1-based
  total: number; // how many chunks in this payment
};

export type SambazaPlan = {
  phone: string; // normalized 254…
  totalAmount: number;
  chunks: SambazaChunk[];
  ussdCodes: string[]; // one code per chunk, same order
};

/**
 * Split a payment amount into Sambaza-safe chunks (≤ 10,000 each).
 * Uses as many full 10,000s as possible, then a remainder chunk.
 */
export function splitIntoChunks(amount: number): SambazaChunk[] {
  const total = Math.round(Number(amount));
  if (!Number.isFinite(total) || total < SAMBAZA_MIN_AMOUNT) {
    return [];
  }

  const chunks: SambazaChunk[] = [];
  let remaining = total;

  while (remaining > 0) {
    const piece = Math.min(remaining, SAMBAZA_MAX_PER_TX);
    chunks.push({
      amount: piece,
      index: chunks.length + 1,
      total: 0, // filled below
    });
    remaining -= piece;
  }

  const n = chunks.length;
  return chunks.map((c) => ({ ...c, total: n }));
}

/** Normalize Kenyan MSISDN to 254XXXXXXXXX */
export function normalizePhone(raw: string): string | null {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) {
    return '254' + digits;
  }
  return null;
}

/** Build a single Sambaza USSD string: *140*{amount}*{MSISDN}# */
export function buildSambazaUssd(phone254: string, amount: number): string {
  return `*140*${amount}*${phone254}#`;
}

/**
 * Build full fulfillment plan for one paid transaction.
 * Returns null if phone/amount invalid.
 */
export function buildSambazaPlan(phone: string, amount: number): SambazaPlan | null {
  const phone254 = normalizePhone(phone);
  if (!phone254) return null;

  const chunks = splitIntoChunks(amount);
  if (chunks.length === 0) return null;

  return {
    phone: phone254,
    totalAmount: Math.round(Number(amount)),
    chunks,
    ussdCodes: chunks.map((c) => buildSambazaUssd(phone254, c.amount)),
  };
}

/** Human-readable summary for logs / UI */
export function describePlan(plan: SambazaPlan): string {
  const parts = plan.chunks.map((c) => c.amount).join(' + ');
  return `KES ${plan.totalAmount} → ${plan.chunks.length} Sambaza run(s): ${parts} to ${plan.phone}`;
}
