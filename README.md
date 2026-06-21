# ⚡ LinkedApply Pro

> AI-Powered LinkedIn Job Auto-Applier Chrome Extension — Apply to 100+ jobs in under an hour.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-00C853)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20DB-3FCF8E?logo=supabase)](https://supabase.com/)
[![Razorpay](https://img.shields.io/badge/Razorpay-Payments-02042B?logo=razorpay)](https://razorpay.com/)

---

## 🚀 Current Project Status

**Completed Features:**
- ✅ **Fix "Update Profile" Overlay**: Robust checks to dismiss LinkedIn's profile update prompts.
- ✅ **Browser Notifications**: Background alerts for goal reached, bot stop, and error states.
- ✅ **Auto-retry Failed Jobs**: Retry failed applications directly from the side panel log.
- ✅ **Job Blacklist/Whitelist**: Filter by good/bad words, blocked companies, etc.
- ✅ **Session Management**: Live badge counters, daily goals, session resets.

**Up Next:**
- ⏳ **Smarter Question Answering**: Enhancing AI logic to stop hallucinating (e.g., phone country code fixes, CTC parsing).
- ⏳ **Application Statistics Report**: Weekly summary exports of job search data.
- ⏳ **Razorpay Integration**: Implement Razorpay for payments.

---

## 🎯 What It Does

LinkedApply Pro automates your LinkedIn job search by:
- **Auto-applying** to Easy Apply jobs with smart form filling
- **AI-powered answering** of application questions (30+ patterns)
- **Tracking** all applications in a Kanban board with analytics
- **Scoring** job fit with AI match analysis (0-100)
- **Tailoring** resumes and generating cover letters per job

## 🏗️ Architecture

```
linkedapply-pro/
├── extension/                    # Chrome Extension (Manifest V3)
│   ├── src/
│   │   ├── background/           # Service worker (event-driven)
│   │   ├── content/              # LinkedIn content scripts
│   │   │   └── engine/           # Automation engine (5 modules)
│   │   ├── popup/                # Browser action popup
│   │   ├── sidepanel/            # Dashboard (3 tabs, 5 charts)
│   │   ├── options/              # Settings page (5 sections)
│   │   ├── services/             # Business logic layer
│   │   │   ├── ai/               # AI providers & features
│   │   │   ├── api-client.ts     # Backend API client
│   │   │   ├── subscription-service.ts
│   │   │   ├── sync-service.ts
│   │   │   ├── reminder-service.ts
│   │   │   ├── profile-import.ts
│   │   │   └── export-service.ts
│   │   ├── shared/               # Types, constants, utilities
│   │   └── styles/               # Design system (tokens, components)
│   ├── tests/                    # Jest unit tests
│   ├── manifest.json
│   └── vite.config.ts
│
└── web/                          # Next.js Backend (ShipFast + Supabase)
    ├── app/api/
    │   ├── extension/            # Extension API routes
    │   │   ├── verify-subscription/
    │   │   ├── record-usage/
    │   │   ├── sync-jobs/
    │   │   ├── ai-proxy/
    │   │   ├── checkout/
    │   │   └── notifications/
    │   ├── razorpay/             # Checkout sessions
    │   └── webhook/razorpay/     # Razorpay webhook handler
    ├── libs/                     # Razorpay, Mailgun, helpers
    └── supabase/schema.sql       # Database schema
```

## ✨ Features

### 🤖 Automation Engine
| Feature | Details |
|---|---|
| Smart Form Filling | 30+ question patterns (text, select, radio, checkbox, textarea) |
| Job Search & Filter | Multi-term search, location, date, experience level, Easy Apply |
| Blacklisting | Bad words, blocked companies, security clearance filter |
| Speed Control | Normal (2-5s), Turbo (0.5-1.5s), Custom delays |
| Pause/Resume | Mid-session pause without losing progress |

### 🧠 AI Integration
| Feature | Min Plan | Description |
|---|---|---|
| AI Question Answerer | Day | Fallback for unrecognized questions |
| Job Match Scoring | Week | 0-100 fit score with strengths/gaps |
| Resume Tailoring | Week | ATS-optimized rewriting |
| Cover Letter Generation | Month | Personalized per job |
| ATS Keyword Analysis | Month | Missing keywords identification |

**Supported providers**: OpenAI, Google Gemini, DeepSeek — all via native `fetch()` (no SDK dependencies).

### 📊 Dashboard
- **Overview**: 4 stat cards, bot controls, 7-day sparkline, recent jobs
- **Jobs**: Search + filter, 5-column Kanban board, job detail modal
- **Analytics**: 30-day activity chart, top companies, work style donut, pipeline funnel, top locations
- **All charts are CSS-only** — zero charting library dependencies

### 💰 Pricing Plans
| Plan | Price | Key Features |
|---|---|---|
| Free Trial | $0 (3 days) | 5 apps/day, basic filters |
| Day Pass | $2.99 | Unlimited apps, AI answers |
| Weekly | $7.99 | + AI resume tailor, cloud sync |
| Monthly | $14.99 | + Cover letters, ATS, analytics, Kanban |
| Yearly | $99.99 | + Priority support, early access |
| Lifetime | $199.99 | Everything, forever |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Chrome 116+

### Extension Development
```bash
cd extension
npm install
npm run dev          # Watch mode (auto-rebuild)
npm run build        # Production build → dist/
npm test             # Run unit tests
```

Load in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extension/dist/`

### Backend Development
```bash
cd web
npm install
cp .env.example .env.local   # Fill in your keys
npm run dev                   # http://localhost:3000
```

### Environment Variables (Backend)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
OPENAI_API_KEY=sk-...         # For AI proxy
GEMINI_API_KEY=...            # For AI proxy
MAILGUN_API_KEY=...           # For email notifications
CRON_SECRET=your_cron_secret  # For scheduled jobs
```

### Database Setup
Run `web/supabase/schema.sql` in your Supabase SQL Editor to create all tables.

## 🧪 Testing

```bash
cd extension
npm test                    # Unit tests
npm run test -- --coverage  # With coverage report
```

**Test coverage areas:**
- Shared utilities (constants, storage, logger)
- Automation engine (question patterns, job parsing, DOM utils)
- Services (export, profile import, subscription, reminders)

## 🔒 Privacy & Security
- All data stored locally by default
- Cloud sync is optional and encrypted (TLS + RLS)
- AI API keys never leave the browser (unless using proxy)
- No LinkedIn credentials collected
- Full data export anytime (CSV, JSON, Markdown, HTML)
- [Full Privacy Policy](PRIVACY_POLICY.md)

## 📁 Tech Stack

| Layer | Technology |
|---|---|
| Extension | TypeScript, Vite, Manifest V3 |
| UI | Vanilla CSS (glassmorphism design system) |
| Backend | Next.js 14, TypeScript |
| Database | Supabase (PostgreSQL + Auth) |
| Payments | Razorpay (6 tiers) |
| AI | OpenAI / Gemini / DeepSeek (native fetch) |
| Email | Mailgun |
| Testing | Jest + ts-jest |

## 📄 License

UNLICENSED — Proprietary software. All rights reserved.
