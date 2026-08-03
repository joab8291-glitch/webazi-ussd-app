import { DataPlan } from './types';

export const DATA_PLANS: DataPlan[] = [
  // Weekly Data
  { id: 'bingwa-350mb-7d', name: 'Bingwa 350MB / 7 Days', price: 48, ussdTemplate: '*180*5*2*pn*2*1#', followUpInputs: [], simSlot: 2, category: 'Weekly Data' },
  { id: 'bingwa-2.5gb-7d', name: 'Bingwa 2.5GB / 7 Days', price: 300, ussdTemplate: '*180*5*2*pn*3*1#', followUpInputs: [], simSlot: 2, category: 'Weekly Data' },
  { id: 'bingwa-6gb-7d', name: 'Bingwa 6GB / 7 Days', price: 700, ussdTemplate: '*180*5*2*pn*4*1#', followUpInputs: [], simSlot: 2, category: 'Weekly Data' },

  // Hourly Data
  { id: 'bingwa-1.5gb-3h', name: 'Bingwa 1.5GB / 3hrs', price: 49, ussdTemplate: '*180*5*2*pn*1*1#', followUpInputs: [], simSlot: 2, category: 'Hourly Data' },
  { id: 'bingwa-1gb-1h', name: 'Bingwa 1GB / 1hr', price: 19, ussdTemplate: '*180*5*2*pn*5*1#', followUpInputs: [], simSlot: 2, category: 'Hourly Data' },

  // Data (24hr)
  { id: 'bingwa-250mb-24h', name: 'Bingwa 250MB / 24hrs', price: 20, ussdTemplate: '*180*5*2*pn*6*1#', followUpInputs: [], simSlot: 2, category: 'Data' },
  { id: 'bingwa-1gb-24h', name: 'Bingwa 1GB / 24hrs', price: 99, ussdTemplate: '*180*5*2*pn*7*1#', followUpInputs: [], simSlot: 2, category: 'Data' },

  // Midnight Data
  { id: 'bingwa-1.25gb-midnight', name: 'Bingwa 1.25GB Till Midnight', price: 55, ussdTemplate: '*180*5*2*pn*8*1#', followUpInputs: [], simSlot: 2, category: 'Midnight Data' },

  // Tunukiwa Data
  { id: 'tunukiwa-1.5gb-3h', name: 'Tunukiwa 1.5GB / 3hrs', price: 54, ussdTemplate: '*456*1*12*3*3*pn*1*1#', followUpInputs: [], simSlot: 2, category: 'Tunukiwa Data' },
  { id: 'tunukiwa-1gb-1h', name: 'Tunukiwa 1GB / 1hr', price: 23, ussdTemplate: '*456*1*12*3*2*pn*1*1#', followUpInputs: [], simSlot: 2, category: 'Tunukiwa Data' },
  { id: 'tunukiwa-2gb-24h', name: 'Tunukiwa 2GB / 24hrs', price: 120, ussdTemplate: '*456*1*12*3*1*pn*1*1#', followUpInputs: [], simSlot: 2, category: 'Tunukiwa Data' },

  // Minutes
  { id: 'minutes-43-3h', name: '43Mins / 3hrs', price: 24, ussdTemplate: '*444*#*3*1*pn*2*1*1#', followUpInputs: [], simSlot: 2, category: 'Minutes' },
  { id: 'minutes-50-midnight', name: '50Mins Till Midnight', price: 51, ussdTemplate: '*456*1*13**6*7*3*pn*2*1#', followUpInputs: [], simSlot: 2, category: 'Minutes' },

  // SMS Bundle
  { id: 'sms-20-1d', name: '20Sms / 1 Day', price: 5, ussdTemplate: '*188*10*1*1*pn*1*2#', followUpInputs: [], simSlot: 2, category: 'SMS Bundle' },
  { id: 'sms-200-1d', name: '200Sms / 1 Day', price: 10, ussdTemplate: '*188*10*1*2*pn*1*2#', followUpInputs: [], simSlot: 2, category: 'SMS Bundle' },
  { id: 'sms-100-7d', name: '100Sms / 7 Day', price: 21, ussdTemplate: '*188*10*2*1*pn*1*2#', followUpInputs: [], simSlot: 2, category: 'SMS Bundle' },
  { id: 'sms-1000-7d', name: '1000Sms / 7 Days', price: 35, ussdTemplate: '*188*10*2*2*pn*1*2#', followUpInputs: [], simSlot: 2, category: 'SMS Bundle' },
  { id: 'sms-1500-30d', name: '1500Sms / 30 Day', price: 110, ussdTemplate: '*188*10*3*1*pn*1*2#', followUpInputs: [], simSlot: 2, category: 'SMS Bundle' },
  { id: 'sms-3500-30d', name: '3500Sms / 30 Days', price: 210, ussdTemplate: '*188*10*3*2*pn*1*2#', followUpInputs: [], simSlot: 2, category: 'SMS Bundle' },
];
