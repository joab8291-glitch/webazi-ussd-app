import { DataPlan, MatchResult, ParsedPayment } from './types';
import { DATA_PLANS } from './plans';

// e.g. "Confirmed. You have received Ksh200.00 from JOHN DOE 254712345678 on 3/8/26..."
const AMOUNT_PATTERN = /(?:ksh|kes)\.?\s*([\d,]+(?:\.\d{1,2})?)/i;
const SENDER_PATTERN = /from\s+([A-Za-z ]+?)(?=\s+\d{9,12}|\s+on\s|\.|\s*$)/i;
// Kenyan mobile numbers in SMS bodies: 2547XXXXXXXX / 2541XXXXXXXX / 07XXXXXXXX / 01XXXXXXXX
const PHONE_PATTERN = /\b(2547\d{8}|2541\d{8}|07\d{8}|01\d{8})\b/;

const RECEIVED_KEYWORDS = /received|you have received|confirmed.*received/i;

export function parsePayment(smsBody: string): ParsedPayment | null {
  if (!RECEIVED_KEYWORDS.test(smsBody)) return null;

  const amountMatch = smsBody.match(AMOUNT_PATTERN);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (isNaN(amount) || amount <= 0) return null;

  const senderMatch = smsBody.match(SENDER_PATTERN);
  const sender = senderMatch ? senderMatch[1].trim() : 'Unknown';

  const phoneMatch = smsBody.match(PHONE_PATTERN);
  const phone = phoneMatch ? normalizePhone(phoneMatch[1]) : null;

  return { amount, sender, phone, raw: smsBody };
}

// Normalizes to 2547XXXXXXXX / 2541XXXXXXXX format (what USSD "pn" fields expect)
function normalizePhone(raw: string): string {
  if (raw.startsWith('0')) return '254' + raw.slice(1);
  return raw;
}

export function matchPlan(
  payment: ParsedPayment,
  plans: DataPlan[] = DATA_PLANS
): DataPlan | null {
  return plans.find((p) => p.price === payment.amount) ?? null;
}

export function resolveUssdCode(plan: DataPlan, phone: string): string {
  return plan.ussdTemplate.replace('pn', phone);
}

export function processIncomingSms(smsBody: string): MatchResult {
  const payment = parsePayment(smsBody);
  if (!payment) return { status: 'not_a_payment' };

  const plan = matchPlan(payment);
  if (!plan) return { status: 'no_match', payment };

  if (!payment.phone) return { status: 'missing_phone', plan, payment };

  const resolvedUssd = resolveUssdCode(plan, payment.phone);
  return { status: 'matched', plan, payment, resolvedUssd };
}
