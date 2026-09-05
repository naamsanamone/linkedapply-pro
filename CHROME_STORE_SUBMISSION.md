# Chrome Web Store Submission Guide — LinkedApply Pro

## Quick Start

```powershell
cd linkedapply-pro/extension
npm run package
# Creates: linkedapply-pro.zip (ready to upload)
```

---

## Store Listing Content

**Name**: LinkedApply Pro — AI Job Auto-Applier

**Summary** (132 chars max):
```
AI-powered LinkedIn job application assistant. Smart question answering, resume tailoring, and job tracking. Free & private (BYOK).
```

**Description** (copy-paste to CWS):
```
LinkedApply Pro is your AI-powered job application assistant for LinkedIn. It automates Easy Apply applications with intelligent form filling, while keeping you in full control.

🚀 KEY FEATURES:
• Auto-apply to LinkedIn Easy Apply jobs with smart automation
• AI-powered form filling — handles 30+ question types automatically
• Resume tailoring — AI rewrites your resume to match each job description
• Job match scoring (0-100) with keyword analysis
• Pre-apply review — inspect each job before applying
• Kanban job tracker with drag-and-drop status management
• Real-time analytics dashboard with charts and stats
• AI cover letter generation
• Follow-up reminders with Chrome notifications
• Custom Q&A — define your own question-answer pairs
• Data export (JSON backup & restore)

🤖 AI PROVIDERS (Bring Your Own Key):
• Google Gemini (recommended — free tier available)
• OpenAI (GPT-4o, GPT-4o-mini)
• DeepSeek

💰 100% FREE — NO SUBSCRIPTIONS:
• Bring Your Own API Key (BYOK) model
• Use your own Gemini, OpenAI, or DeepSeek API key
• No monthly fees, no limits, no hidden charges
• Gemini offers a generous free tier

🔒 PRIVACY-FIRST:
• ALL data stored locally on your device — nothing leaves your browser
• API keys stored locally, sent directly to AI providers only
• No accounts, no sign-ups, no tracking, no analytics
• No LinkedIn credentials or passwords collected
• Full data export and reset anytime

⚡ HOW IT WORKS:
1. Install the extension
2. Add your AI API key in Settings → AI Settings
3. Fill in your profile and upload your resume
4. Set job search keywords and filters
5. Click Start — the bot applies intelligently!
6. Track everything in the dashboard sidepanel

🎯 PERFECT FOR:
• Job seekers tired of repetitive form filling
• Career changers applying across multiple roles
• Bootcamp graduates mass-applying to entry-level positions
• Anyone who values their time and privacy

Built with Manifest V3. Open source. No server required.
```

**Category**: Productivity

**Language**: English

---

## Required Assets

| Asset | Size | Status |
|---|---|---|
| Icon 128×128 | 128x128 PNG | ✅ `public/icons/icon-128.png` |
| Screenshot 1 | 1280x800 | ✅ Popup + LinkedIn (generated) |
| Screenshot 2 | 1280x800 | ✅ Dashboard sidepanel (generated) |
| Screenshot 3 | 1280x800 | ✅ AI Settings page (generated) |
| Promo Tile | 440x280 | Optional — create later |

---

## Permissions Justification

Copy these into the CWS "Justify Permissions" fields:

| Permission | Justification |
|---|---|
| `activeTab` | Required to interact with LinkedIn job application forms on the current tab |
| `sidePanel` | Powers the real-time dashboard panel alongside LinkedIn |
| `storage` | Stores user profile, job history, and settings locally on the device |
| `unlimitedStorage` | Job history with descriptions and AI analysis can exceed the default 10MB quota for power users |
| `alarms` | Schedules follow-up reminder notifications and daily cleanup tasks |
| `notifications` | Sends follow-up reminders and bot status alerts to the user |
| `tabs` | Opens and manages LinkedIn job search tabs, detects active LinkedIn pages |
| Host: `linkedin.com` | Core functionality — reads job listings and fills Easy Apply forms |
| Host: `api.openai.com` | User-provided API key for optional AI question answering |
| Host: `googleapis.com` | User-provided API key for optional Google Gemini AI integration |
| Host: `api.deepseek.com` | User-provided API key for optional DeepSeek AI integration |

---

## Privacy Policy URL

Set to: `https://github.com/naamsanamone/linkedapply-pro/blob/main/PRIVACY_POLICY.md`

---

## Step-by-Step CWS Submission

1. **Build**: `npm run package` → creates `linkedapply-pro.zip`
2. Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Click **"New Item"** → upload `linkedapply-pro.zip`
4. Fill in:
   - **Store listing**: Name, summary, description (from above)
   - **Screenshots**: Upload the 3 generated screenshots
   - **Category**: Productivity
   - **Language**: English
   - **Privacy Policy URL**: GitHub link above
   - **Permissions justification**: Use table above
5. Click **"Submit for Review"**
6. Review takes **1-3 business days**

---

## If Rejected

Common rejection reasons and fixes:
- **"Overly broad permissions"** → Explain each permission in justification
- **"Missing privacy policy"** → Set the GitHub URL
- **"Extension must have a clear purpose"** → Description above covers this
- **"Deceptive behavior"** → Extension is unminified, code is readable
