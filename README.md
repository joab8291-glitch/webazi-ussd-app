[Uploading README.md…]()
# Webazi USSD App

Android (Expo) companion app that **auto-fulfills data / airtime orders** by:

1. Listening for M-Pesa payment SMS  
2. Matching amount → Bingwa / Tunukiwa / SMS plan  
3. Dialing the correct USSD code via Accessibility  
4. Optionally pulling pending STK transactions from the backend poller  
5. Notifying customers on WhatsApp (via backend proxy)

**Backend (STK Push + transactions):** https://webazi-digital-solutions.onrender.com

---

## Brand assets

Located in [`assets/brand/`](./assets/brand/):

| File | Use |
|------|-----|
| `icon.svg` | App icon mark (signal arcs on green) |
| `logo.svg` / `logo-white.svg` | Wordmark for light / dark backgrounds |
| `og-image.svg` | Open Graph / social preview (1200×630) |

**Colors:** brand `#00A86B` · dark `#0B1F17` · accent `#2DD4A0`

Generate PNG exports (app icon, splash, favicon, adaptive icons, OG):

```bash
pip install Pillow
python scripts/generate-brand-pngs.py
```

### OG / social meta (web)

```html
<meta property="og:image" content="https://raw.githubusercontent.com/joab8291-glitch/webazi-ussd-app/master/assets/brand/og-image.svg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
```

(After running the PNG generator, prefer `assets/images/og-image.png` for wider platform support.)

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
python scripts/generate-brand-pngs.py   # optional: refresh PNG icons/OG
npx expo prebuild
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
