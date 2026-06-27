<![CDATA[<div align="center">

# ⚡ LinkedApply Pro

### AI-Powered LinkedIn Auto-Applier with Premium Job Insights

**Apply smarter, not harder — Match scores, tailored resumes, cover letters & stand out tips for every job.**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-00C853?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)](LICENSE)

[Features](#-features) · [Getting Started](#-getting-started) · [Architecture](#-architecture) · [AI Providers](#-ai-providers) · [Privacy](#-privacy--security)

</div>

---

## 🎯 What It Does

LinkedApply Pro is a Chrome extension that automates your LinkedIn job search with **LinkedIn Premium-grade AI insights** — completely free with your own API key (BYOK).

| Without LinkedApply | With LinkedApply Pro |
|---|---|
| Manually apply to jobs one-by-one | **Auto-apply** to 100+ jobs/hour |
| Guess if you're qualified | **AI Match Score** with ✓/? qualification breakdown |
| Generic resume for every job | **AI-Tailored Resume** optimized for ATS |
| No cover letter | **AI Cover Letter** + PDF/DOCX download |
| Hope for the best | **Stand Out Tips** to beat other applicants |

---

## ✨ Features

### 🤖 Smart Automation Engine

| Feature | Details |
|---|---|
| **One-Click Auto Apply** | Fills forms, answers questions, submits applications automatically |
| **30+ Question Patterns** | Text, select, radio, checkbox, textarea — with AI fallback |
| **Job Search & Filter** | Multi-term search, location, date, experience, Easy Apply filter |
| **Company Blacklist** | Skip jobs by bad words, blocked companies, security clearance |
| **Speed Control** | Normal (2-5s), Turbo (0.5-1.5s), or custom delays |
| **Pause / Resume** | Mid-session pause without losing progress |

### 🧠 AI-Powered Job Insights (LinkedIn Premium Alternative)

All AI features are **free with BYOK** (Bring Your Own Key). No subscription required.

| Feature | What It Does |
|---|---|
| 📊 **JD Match Scoring** | Scores each job 0-100 with detailed qualification breakdown |
| ✓/? **Qualification Analysis** | Shows which required/preferred qualifications you match (like LinkedIn Premium) |
| 📝 **Resume Tailoring** | Rewrites your resume per job — optimized summary, skills, experience bullets |
| 🎯 **ATS Score** | Rates your tailored resume's ATS compatibility (0-100) |
| ✉️ **Cover Letter Generator** | Personalized cover letter per job — copy, download PDF, or download DOCX |
| ⭐ **Stand Out Suggestions** | Skills to highlight, achievements to emphasize, profile improvements |
| 🔍 **ATS Keyword Analysis** | Identifies missing keywords between your resume and the job description |
| 💬 **AI Question Answerer** | Handles unknown questions using your profile + resume context |

### 📊 Premium Dashboard (Side Panel)

| Tab | What's Inside |
|---|---|
| **Overview** | Live stats, bot controls, 7-day sparkline, recent jobs |
| **Jobs** | 5-column Kanban board, search & filter, job detail modal with 4 AI tabs |
| **Analytics** | 30-day activity chart, top companies, work style donut, pipeline funnel |

**Job Detail Modal — 4 AI Tabs:**

```
┌──────────────────────────────────────────────┐
│ Senior Java Developer — ThoughtBot       [✕] │
├──────┬────────┬────────────┬─────────────────┤
│ 📊   │ 📝     │ ✉️          │ ⭐               │
│Match │Resume  │Cover Letter│Stand Out        │
├──────┴────────┴────────────┴─────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  [85%]  🟢 You'd be a top applicant  │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Matches 3 of 4 required qualifications:     │
│  ✓ 1+ years experience in Java              │
│  ✓ Proficiency in JavaScript, Python         │
│  ✓ Experience with AWS cloud services        │
│  ? Linux and system security (no mention)    │
│                                              │
│  Strengths: Java, REST APIs, Spring Boot     │
│  Gaps: Golang, Kubernetes                    │
└──────────────────────────────────────────────┘
```

### 💰 Pricing — BYOK (Free) or Pro

Inspired by [Pluely](https://github.com/iamsrikanthnani/pluely) and [Natively](https://github.com/Natively-AI-assistant/natively-cluely-ai-assistant) — the software is **free**, you bring your own AI keys.

| Tier | Cost | How It Works |
|---|---|---|
| **🔑 Free (BYOK)** | $0 + API usage (~$0.001/job) | Bring your own Gemini/OpenAI/DeepSeek key. All features unlocked. |
| **⭐ Pro** | ~$5-10/month | For users who don't want to manage API keys. License key activates hosted API. |

> **Why BYOK?** You pay the AI provider directly for what you use. No markup. Full transparency. A typical job application costs ~$0.001 in API tokens.

---

## 🏗️ Architecture

```
linkedapply-pro/
├── extension/                    # Chrome Extension (Manifest V3)
│   ├── src/
│   │   ├── background/           # Service worker (event-driven)
│   │   │   └── service-worker.ts # AI proxy, rate limiter, job tracker
│   │   ├── content/              # LinkedIn content scripts
│   │   │   └── engine/           # Automation engine
│   │   │       ├── bot-orchestrator.ts   # Main job processing pipeline
│   │   │       ├── question-answerer.ts  # 30+ patterns + AI fallback
│   │   │       ├── easy-apply.ts         # Easy Apply form handler
│   │   │       ├── job-search.ts         # Search & pagination
│   │   │       └── dom-utils.ts          # LinkedIn DOM helpers
│   │   ├── popup/                # Browser action popup
│   │   ├── sidepanel/            # Dashboard (Kanban, Analytics, AI tabs)
│   │   ├── options/              # Settings (5 pages)
│   │   ├── services/
│   │   │   ├── ai/               # AI services
│   │   │   │   ├── ai-provider.ts       # Multi-provider client (OpenAI/Gemini/DeepSeek)
│   │   │   │   ├── job-matcher.ts       # JD match scoring + qualification breakdown
│   │   │   │   ├── resume-tailor.ts     # ATS-optimized resume rewriting
│   │   │   │   ├── cover-letter-gen.ts  # Personalized cover letter generation
│   │   │   │   ├── standout-tips.ts     # Stand out suggestions
│   │   │   │   ├── ats-analyzer.ts      # ATS keyword analysis
│   │   │   │   └── prompts.ts           # All AI prompt templates
│   │   │   ├── pdf-generator.ts         # PDF/DOCX cover letter export
│   │   │   ├── usage-tracker.ts         # BYOK usage tracking
│   │   │   ├── subscription-service.ts  # Feature gating
│   │   │   ├── sync-service.ts          # Cloud sync
│   │   │   └── export-service.ts        # CSV/JSON/HTML export
│   │   ├── shared/               # Types, constants, utilities
│   │   └── styles/               # Glassmorphism design system
│   ├── manifest.json
│   └── vite.config.ts
│
└── web/                          # Next.js Backend (Optional — for Pro tier)
    ├── app/api/
    │   ├── extension/            # Extension API routes
    │   ├── razorpay/             # Payment processing
    │   └── webhook/              # Webhook handlers
    └── supabase/schema.sql       # Database schema
```

### Bot Processing Pipeline

```
For each job listing:
  Step 1 → Extract job details (title, company, location, work style)
  Step 2 → Check blacklist (bad words, blocked companies)
  Step 3 → Get HR info (name, LinkedIn profile)
  Step 4 → Get date listed
  Step 5 → Get job description + experience check
  Step 6 → 🧠 AI Match Score (0-100 + qualification breakdown)
           ├── If score ≥ threshold → continue
           └── If score < threshold → skip job
  Step 6b → 📝 AI Resume Tailoring (ATS-optimized rewrite)
  Step 6c → ✉️ AI Cover Letter (if match ≥ 60%)
  Step 6d → ⭐ Stand Out Tips (if match ≥ 60%)
  Step 7 → Apply (Easy Apply or External)
  Step 8 → Save to Kanban + update dashboard
```

---

## 🤖 AI Providers

LinkedApply Pro supports multiple AI providers via native `fetch()` — zero SDK dependencies.

| Provider | Model | Free Tier | Cost (Paid) |
|---|---|---|---|
| **Google Gemini** | gemini-2.5-flash | ✅ 20 req/day | ~$0.0001/req |
| **OpenAI** | gpt-4o-mini | ❌ | ~$0.0003/req |
| **DeepSeek** | deepseek-chat | ❌ | ~$0.0001/req |

### Rate Limit Handling

- **429 / 503 auto-backoff** — parses Gemini's `retry in Xs` header
- **Exponential backoff** — 15s → 30s → 60s → 120s max
- **AI client caching** — reuses client for 5 minutes
- **Truncated JSON repair** — auto-closes unclosed brackets from cut-off responses
- **Graceful degradation** — bot continues applying even when AI quota is exhausted

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Chrome 116+
- An AI API key (Gemini free tier works)

### Quick Start

```bash
# Clone
git clone https://github.com/naamsanamone/linkedapply-pro.git
cd linkedapply-pro

# Install & build extension
cd extension
npm install
npm run build        # Production build → dist/

# For development
npm run dev          # Watch mode (auto-rebuild on save)
```

### Load in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** → select `extension/dist/`
4. Pin the extension → click to open

### Configure AI (Required)

1. Click the extension icon → **Settings**
2. Go to **AI Settings** tab
3. Select provider (Gemini recommended for free tier)
4. Enter your API key ([Get Gemini key free](https://aistudio.google.com/apikey))
5. Click **Test Connection** → ✅
6. Go to **Bot Settings** → Enable **JD Match Scoring**

### Backend (Optional — Pro tier only)

```bash
cd web
npm install
cp .env.example .env.local   # Fill in your keys
npm run dev                   # http://localhost:3000
```

---

## 🔒 Privacy & Security

| Aspect | How We Handle It |
|---|---|
| **Data Storage** | All data stored locally in Chrome storage by default |
| **API Keys** | Never leave your browser — direct calls to AI providers |
| **Cloud Sync** | Optional, encrypted (TLS + Row Level Security) |
| **LinkedIn Creds** | Never collected or stored |
| **Data Export** | Full export anytime (CSV, JSON, Markdown, HTML) |
| **Open Audit** | BYOK model — you can verify all API calls in DevTools |

---

## 📁 Tech Stack

| Layer | Technology |
|---|---|
| **Extension** | TypeScript 5.5, Vite 5, Chrome Manifest V3 |
| **UI** | Vanilla CSS with glassmorphism design system (zero frameworks) |
| **Charts** | Pure CSS — zero charting library dependencies |
| **AI** | OpenAI / Gemini / DeepSeek via native `fetch()` (zero SDKs) |
| **PDF Export** | jsPDF (cover letters) |
| **DOCX Export** | docx library (cover letters) |
| **Backend** | Next.js 14, Supabase (PostgreSQL + Auth) |
| **Payments** | Razorpay (Pro tier) |
| **Testing** | Jest + ts-jest |

---

## 🗺️ Roadmap

- [x] Auto-apply with smart form filling (30+ patterns)
- [x] AI question answering with profile context
- [x] JD match scoring (0-100) with job filtering
- [x] Resume tailoring with ATS optimization
- [x] Kanban board with job detail modal
- [x] Rate limit handling with exponential backoff
- [x] Match score hero ring + tailored resume card in modal
- [ ] Qualification breakdown (✓/? per requirement)
- [ ] AI cover letter + PDF/DOCX download
- [ ] Stand out suggestions
- [ ] 4-tab job detail modal (Match / Resume / Cover Letter / Stand Out)
- [ ] BYOK usage dashboard
- [ ] Pro tier with hosted API

---

## 🤝 Contributing

This is a proprietary project. For feature requests or bug reports, please open an issue.

## 📄 License

UNLICENSED — Proprietary software. All rights reserved.

---

<div align="center">

**Built with ❤️ for job seekers who want to work smarter**

*LinkedApply Pro — Your AI job application copilot*

</div>
]]>
