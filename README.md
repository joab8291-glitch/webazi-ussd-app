# Webazi USSD App

Android (Expo) companion app that **auto-fulfills data / airtime orders** by:

1. Listening for M-Pesa payment SMS  
2. Matching amount → Bingwa / Tunukiwa / SMS plan  
3. Dialing the correct USSD code via Accessibility  
4. Optionally pulling pending STK transactions from the backend poller  
5. Notifying customers on WhatsApp (via backend proxy)

**Backend (STK Push + transactions):** https://webazi-digital-solutions.onrender.com

---

## Architecture

```
┌─────────────────┐     SMS      ┌──────────────────┐
│  Customer pays  │ ──────────► │  smsAutomation   │
│  (M-Pesa / STK) │             │  offer-matcher   │
└────────┬────────┘             └────────┬─────────┘
         │                               │
         │ pending txn                   │ dialUssd()
         ▼                               ▼
┌─────────────────┐             ┌──────────────────┐
│  Backend API    │◄──poller───│  UssdExecutor     │
│  (Render)       │             │  (native module) │
└────────┬────────┘             └──────────────────┘
         │
         │ /whatsapp/notify
         ▼
┌─────────────────┐
│  WhatsApp Cloud │
│  API (Meta)     │
└─────────────────┘
```

### App tabs
| Tab | Purpose |
|-----|---------|
| **Home** | Automation toggles (SMS + backend poller), status chips, live activity log |
| **Orders** | Transaction list with filter, requeue / mark done / WhatsApp chat |
| **Plans** | All DATA_PLANS with search + test dial |
| **Settings** | Till SIM selection, Accessibility, manual USSD, WhatsApp config |

---

## Requirements

- Android device or emulator with a **development build** (native modules need custom native code)
- Permissions: `READ_SMS`, `RECEIVE_SMS`, `READ_PHONE_STATE`, `CALL_PHONE`, Accessibility service
- Expo SDK 54

## Setup

```bash
npm install
npx expo prebuild   # if you need native projects
npx expo run:android
```

Or with EAS:

```bash
eas build --profile development --platform android
```

## Backend endpoints used

| Method | Path | Use |
|--------|------|-----|
| GET | `/health` | Connectivity check |
| GET | `/transactions/pending` | Poller |
| GET | `/transactions` | Orders screen |
| POST | `/transactions/:id/complete` | Mark fulfilled |
| POST | `/transactions/:id/fail` | Mark failed |
| POST | `/transactions/:id/requeue` | Retry |
| POST | `/whatsapp/notify` | *(to implement)* Customer WhatsApp messages |
| POST | `/whatsapp/webhook` | *(to implement)* Meta Cloud API inbound |

## WhatsApp (backend work remaining)

The mobile app already calls `POST /whatsapp/notify` when deliveries succeed/fail.
Implement that route on the Render backend using the Meta WhatsApp Cloud API, and optionally wire `/whatsapp/webhook` so customers can order via WhatsApp chat (create a pending transaction → existing poller fulfills).

See `services/whatsapp.ts` for payload shapes and notes.

## Native modules

- `modules/sms-listener` — SIM slots + SMS events
- `modules/ussd-executor` — `dialUssd(code, subscriptionId, menuInputs)` + Accessibility
- `modules/offer-matcher` — payment SMS parse + plan match

---

Built with Expo Router + Zustand.
