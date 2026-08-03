export type DataPlan = {
  id: string;
  name: string;              // e.g. "1GB Daily"
  price: number;             // exact KES amount that triggers this plan
  ussdCode: string;          // e.g. "*544*1*1#"
  followUpInputs: string[];  // responses for multi-step USSD menus, in order
  simSlot: number;           // subscriptionId to dial from (-1 = default SIM)
};

export type ParsedPayment = {
  amount: number;
  sender: string;
  raw: string;
};

export type MatchResult =
  | { status: 'matched'; plan: DataPlan; payment: ParsedPayment }
  | { status: 'no_match'; payment: ParsedPayment }
  | { status: 'not_a_payment' };
