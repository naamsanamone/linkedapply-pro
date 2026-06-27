# ⚡ LinkedApply Pro

**AI-Powered LinkedIn Auto-Applier with Premium Job Insights**

> Apply smarter, not harder — Match scores, tailored resumes, cover letters & stand out tips for every job.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-00C853?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![BYOK](https://img.shields.io/badge/BYOK-Free-22c55e?style=flat-square)](https://aistudio.google.com/apikey)

---

## 🎯 What It Does

LinkedApply Pro is a Chrome extension that automates your LinkedIn job search with **LinkedIn Premium-grade AI insights** — completely free with your own API key (BYOK).

| Without LinkedApply | With LinkedApply Pro |
|---|---|
| Manually apply to jobs one-by-one | **Auto-apply** to 100+ jobs/hour |
| Guess if you're qualified | **AI Match Score** with ✓/? qualification breakdown |
| Generic resume for every job | **AI-Tailored Resume** optimized for ATS |
| No cover letter | **AI Cover Letter** with PDF/DOCX download |
| Hope for the best | **Stand Out Tips** to beat other applicants |

---

## ✨ Features

### 🤖 Smart Automation Engine

- **One-Click Auto Apply** — Fills forms, answers questions, submits automatically
- **30+ Question Patterns** — Text, select, radio, checkbox, textarea with AI fallback
- **Job Search & Filter** — Multi-term search, location, date, experience, Easy Apply
- **Company Blacklist** — Skip by bad words, blocked companies, security clearance
- **Speed Control** — Normal (2-5s), Turbo (0.5-1.5s), or custom delays
- **Pause / Resume** — Mid-session pause without losing progress

### 🧠 AI-Powered Job Insights (LinkedIn Premium Alternative)

All AI features are **free with BYOK** (Bring Your Own Key). No subscription required.

| Feature | What It Does |
|---|---|
| 📊 **JD Match Scoring** | Scores each job 0-100 with detailed qualification breakdown |
| ✓/? **Qualification Analysis** | Shows which required/preferred qualifications you match |
| 📝 **Resume Tailoring** | Rewrites your resume per job — optimized summary, skills, bullets |
| 🎯 **ATS Score** | Rates your tailored resume's ATS compatibility (0-100) |
| ✉️ **Cover Letter Generator** | Personalized cover letter per job — copy or download PDF/DOCX |
| ⭐ **Stand Out Suggestions** | Skills to highlight, achievements to emphasize, profile tips |
| 🔍 **ATS Keyword Analysis** | Identifies missing keywords between resume and job description |
| 💬 **AI Question Answerer** | Handles unknown questions using your profile + resume context |

### 📊 Premium Dashboard

- **Overview Tab** — Live stats, bot controls, 7-day sparkline, recent jobs
- **Jobs Tab** — 5-column Kanban board, search & filter, job detail modal with 4 AI tabs
- **Analytics Tab** — 30-day activity chart, top companies, work style donut, pipeline funnel
- All charts are **pure CSS** — zero charting library dependencies

### 📋 Job Detail Modal — 4 AI Tabs

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

---

## 💰 Pricing — BYOK Model

Inspired by [Pluely](https://github.com/iamsrikanthnani/pluely) and [Natively](https://github.com/Natively-AI-assistant/natively-cluely-ai-assistant) — the software is **free**, you bring your own AI keys.

| Tier | Cost | How It Works |
|---|---|---|
| 🔑 **Free (BYOK)** | $0 + API usage (~$0.001/job) | Bring your own Gemini/OpenAI/DeepSeek key. All features unlocked. |
| ⭐ **Pro** | ~$5-10/month | For users who don't want to manage API keys. License key activates hosted API. |

> **Why BYOK?** You pay the AI provider directly for what you use. No markup, full transparency. A typical job application costs ~$0.001 in API tokens.

---

## 🤖 Supported AI Providers

LinkedApply Pro supports multiple AI providers via native `fetch()` — zero SDK dependencies.

| Provider | Recommended Model | Free Tier | Approx Cost |
|---|---|---|---|
| **Google Gemini** | gemini-2.5-flash | ✅ 20 req/day | ~$0.0001/req |
| **OpenAI** | gpt-4o-mini | ❌ | ~$0.0003/req |
| **DeepSeek** | deepseek-chat | ❌ | ~$0.0001/req |

**Built-in reliability:**

- 429 / 503 auto-backoff with retry delay parsing
- Exponential backoff (15s → 30s → 60s → 120s max)
- AI client caching (reuses for 5 minutes)
- Truncated JSON auto-repair
- Graceful degradation — bot continues even when AI quota is exhausted

---

## 🏗️ Architecture

```
linkedapply-pro/
├── extension/                        # Chrome Extension (Manifest V3)
│   ├── src/
│   │   ├── background/               # Service worker
│   │   │   └── service-worker.ts     #   AI proxy, rate limiter, job tracker
│   │   ├── content/                   # LinkedIn content scripts
│   │   │   └── engine/               #   Automation engine
│   │   │       ├── bot-orchestrator.ts    # Main job processing pipeline
│   │   │       ├── question-answerer.ts   # 30+ patterns + AI fallback
│   │   │       ├── easy-apply.ts          # Easy Apply form handler
│   │   │       ├── job-search.ts          # Search & pagination
│   │   │       └── dom-utils.ts           # LinkedIn DOM helpers
│   │   ├── popup/                     # Browser action popup
│   │   ├── sidepanel/                 # Dashboard (Kanban, Analytics, AI tabs)
│   │   ├── options/                   # Settings (5 config pages)
│   │   ├── services/
│   │   │   ├── ai/                    # AI services
│   │   │   │   ├── ai-provider.ts         # Multi-provider client
│   │   │   │   ├── job-matcher.ts         # JD match + qualification breakdown
│   │   │   │   ├── resume-tailor.ts       # ATS-optimized resume rewriting
│   │   │   │   ├── cover-letter-gen.ts    # Cover letter generation
│   │   │   │   ├── standout-tips.ts       # Stand out suggestions
│   │   │   │   ├── ats-analyzer.ts        # ATS keyword analysis
│   │   │   │   └── prompts.ts             # All AI prompt templates
│   │   │   ├── pdf-generator.ts       # PDF/DOCX cover letter export
│   │   │   ├── usage-tracker.ts       # BYOK usage tracking
│   │   │   └── subscription-service.ts
│   │   └── shared/                    # Types, constants, utilities
│   ├── manifest.json
│   └── vite.config.ts
│
└── web/                              # Next.js Backend (Pro tier only)
    ├── app/api/extension/            # Extension API routes
    └── supabase/schema.sql           # Database schema
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
           ├── Score ≥ threshold → continue
           └── Score < threshold → skip job
  Step 6b → 📝 Resume Tailoring (ATS-optimized rewrite)
  Step 6c → ✉️ Cover Letter (if match ≥ 60%)
  Step 6d → ⭐ Stand Out Tips (if match ≥ 60%)
  Step 7 → Apply (Easy Apply or External)
  Step 8 → Save to Kanban + update dashboard
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Chrome 116+
- An AI API key ([Get Gemini key free](https://aistudio.google.com/apikey))

### Install & Build

```bash
git clone https://github.com/naamsanamone/linkedapply-pro.git
cd linkedapply-pro/extension
npm install
npm run build        # Production build → dist/
```

### Load in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** → select `extension/dist/`
4. Pin the extension → click to open

### Configure AI

1. Click extension icon → **Settings**
2. Go to **AI Settings** tab
3. Select provider (Gemini recommended for free tier)
4. Enter your API key
5. Click **Test Connection** → ✅
6. Go to **Bot Settings** → Enable **JD Match Scoring**

### Development

```bash
npm run dev          # Watch mode (auto-rebuild on save)
npm run build        # Production build
npm test             # Run unit tests
```

---

## 🔒 Privacy & Security

- **Local-first** — All data stored in Chrome storage by default
- **API keys stay local** — Direct calls to AI providers, keys never sent to our servers
- **Cloud sync optional** — Encrypted with TLS + Row Level Security
- **No LinkedIn credentials** — Never collected or stored
- **Full data export** — CSV, JSON, Markdown, HTML anytime
- **Open audit** — BYOK model lets you verify all API calls in DevTools

---

## 📁 Tech Stack

| Layer | Technology |
|---|---|
| Extension | TypeScript 5.5, Vite 5, Chrome Manifest V3 |
| UI | Vanilla CSS (glassmorphism design system, zero frameworks) |
| Charts | Pure CSS (zero charting dependencies) |
| AI | OpenAI / Gemini / DeepSeek via native fetch (zero SDKs) |
| PDF/DOCX | jsPDF + docx library |
| Backend | Next.js 14, Supabase (PostgreSQL + Auth) |
| Payments | Razorpay (Pro tier) |
| Testing | Jest + ts-jest |

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

## 📄 License

Proprietary software. All rights reserved.

---

**Built with ❤️ for job seekers who want to work smarter**
