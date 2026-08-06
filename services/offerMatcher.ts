export type Offer = {
  amount: number;
  ussdTemplate: string; // {phone} and {amount} get replaced
  menuInputs: string[]; // leave empty if the USSD code is direct, no menu needed
  label: string;
};

// Verify these against actual Safaricom Sambaza USSD codes before going live —
// placeholders shown here, matching the general *140*recipient*amount# pattern.
export const OFFERS: Offer[] = [
  { amount: 20, ussdTemplate: '*140*{phone}*20#', menuInputs: [], label: 'Sambaza KES 20' },
  { amount: 50, ussdTemplate: '*140*{phone}*50#', menuInputs: [], label: 'Sambaza KES 50' },
  { amount: 100, ussdTemplate: '*140*{phone}*100#', menuInputs: [], label: 'Sambaza KES 100' },
  { amount: 250, ussdTemplate: '*140*{phone}*250#', menuInputs: [], label: 'Sambaza KES 250' },
];

export function matchOffer(amount: number): Offer | null {
  return OFFERS.find((o) => o.amount === amount) ?? null;
}

export function buildUssdCode(offer: Offer, phone: string): string {
  return offer.ussdTemplate.replace('{phone}', phone).replace('{amount}', String(offer.amount));
}
