import { DataPlan } from './types';

// Replace ussdCode/followUpInputs with your real carrier data bundle codes.
// simSlot: get real subscriptionId values from SmsListener.getSimSlots() first.
export const DATA_PLANS: DataPlan[] = [
  {
    id: 'daily-1gb',
    name: '1GB Daily',
    price: 20,
    ussdCode: '*544*1*1#',
    followUpInputs: [],
    simSlot: -1,
  },
  {
    id: 'weekly-1_5gb',
    name: '1.5GB Weekly',
    price: 50,
    ussdCode: '*544*1*2#',
    followUpInputs: [],
    simSlot: -1,
  },
  {
    id: 'monthly-3gb',
    name: '3GB Monthly',
    price: 150,
    ussdCode: '*544*1*3#',
    followUpInputs: [],
    simSlot: -1,
  },
];
