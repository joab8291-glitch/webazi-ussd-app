export type DataPlan = {
  id: string;
  name: string;
  price: number;             // exact KES amount that triggers this plan
  ussdTemplate: string;      // contains "pn" token, replaced with payer's phone number
  followUpInputs: string[];  // extra menu responses after dialing, if any
  simslot: number;           // subscriptionId to dial from (-1 = default SIM)
  category: string;
};

export type ParsedPayment = {
  amount: number;
  sender: string;
  phone: string | null;      // payer's phone number, extracted from SMS if present
  raw: string;
};

export type MatchResult =
  | { status: 'matched'; plan: DataPlan; payment: ParsedPayment; resolvedUssd: string }
  | { status: 'no_match'; payment: ParsedPayment }
  | { status: 'missing_phone'; plan: DataPlan; payment: ParsedPayment }
  | { status: 'not_a_payment' };
