import { DataPlan, MatchResult, ParsedPayment } from './types';
import { DATA_PLANS } from './plans';

// Handles common Kenyan mobile money confirmation formats, e.g.:
// "Confirmed. You have received Ksh200.00 from JOHN DOE 254712345678..."
// "You have received Ksh 50 from Jane Doe..."
// "*KES 150.00* received from..."
const AMOUNT_PATTERN = /(?:ksh|kes)\.?\s*([\d,]+(?:\.\d{1,2})?)/i;
const SENDER_PATTERN = /from\s+([A-Za-z ]+?)(?:\s+\d{9,12}|\s+on\s|\.|\s*$)/i;

// Words that indicate this is actually a received-payment SMS,
// not a balance check, airtime purchase, or other notification.
const RECEIVED_KEYWORDS = /received|you have received|confirmed.*received/i;

export function parsePayment(smsBody: string): ParsedPayment | null {
  if (!RECEIVED_KEYWORDS.test(smsBody)) return null;

  const amountMatch = smsBody.match(AMOUNT_PATTERN);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  const senderMatch = smsBody.match(SENDER_PATTERN);
  const sender = senderMatch ? senderMatch[1].trim() : 'Unknown';

  return { amount, sender, raw: smsBody };
}

export function matchPlan(
  payment: ParsedPayment,
  plans: DataPlan[] = DATA_PLANS
): DataPlan | null {
  return plans.find((p) => p.price === payment.amount) ?? null;
}

export function processIncomingSms(smsBody: string): MatchResult {
  const payment = parsePayment(smsBody);
  if (!payment) return { status: 'not_a_payment' };

  const plan = matchPlan(payment);
  if (!plan) return { status: 'no_match', payment };

  return { status: 'matched', plan, payment };
}
