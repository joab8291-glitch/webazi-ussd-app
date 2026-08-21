/**
 * Backend-oriented offer matcher used by the transaction poller.
 * Aligns with modules/offer-matcher DATA_PLANS where amounts match.
 */

import { DATA_PLANS } from '../modules/offer-matcher/plans';
import type { DataPlan } from '../modules/offer-matcher/types';

export type Offer = {
  amount: number;
  ussdTemplate: string;
  menuInputs: string[];
  label: string;
  simSlot: number;
};

/** Convert DataPlan list into Offer list for the poller */
export const OFFERS: Offer[] = DATA_PLANS.map((p) => ({
  amount: p.price,
  ussdTemplate: p.ussdTemplate,
  menuInputs: p.followUpInputs,
  label: p.name,
  simSlot: p.simSlot,
}));

export function matchOffer(amount: number): Offer | null {
  // Exact match first
  const exact = OFFERS.find((o) => o.amount === amount);
  if (exact) return exact;

  // Tolerate floating point / cents (e.g. 48.00)
  const rounded = Math.round(amount);
  return OFFERS.find((o) => o.amount === rounded) ?? null;
}

export function buildUssdCode(offer: Offer, phone: string): string {
  const normalized = normalizePhone(phone);
  return offer.ussdTemplate
    .replace(/pn/gi, normalized)
    .replace(/\{phone\}/gi, normalized)
    .replace(/\{amount\}/gi, String(offer.amount));
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.length === 9) return '254' + digits;
  return digits;
}

export function planFromOffer(offer: Offer): DataPlan | undefined {
  return DATA_PLANS.find((p) => p.price === offer.amount && p.name === offer.label);
}
