# Chrome Web Store Submission Guide — LinkedApply Pro

## Pre-Submission Checklist

### 1. Build the Extension
```bash
cd linkedapply-pro/extension
npm install
npm run build
```
The `dist/` folder contains the production-ready extension.

### 2. Create ZIP for Upload
```bash
cd dist
# On Windows:
Compress-Archive -Path * -DestinationPath ../linkedapply-pro-v1.0.0.zip
# On Mac/Linux:
zip -r ../linkedapply-pro-v1.0.0.zip .
```

### 3. Required Assets

| Asset | Size | Location |
|---|---|---|
| Icon 128×128 | 128x128 PNG | `public/icons/icon-128.png` |
| Promo Small | 440x280 PNG | Create in design tool |
| Promo Large | 920x680 PNG | Create in design tool (optional) |
| Screenshot 1 | 1280x800 PNG | Popup + job applying |
| Screenshot 2 | 1280x800 PNG | Dashboard overview |
| Screenshot 3 | 1280x800 PNG | Analytics charts |
| Screenshot 4 | 1280x800 PNG | Settings page |
| Screenshot 5 | 1280x800 PNG | Kanban board |

### 4. Store Listing Content

**Name**: LinkedApply Pro — AI Job Auto-Applier

**Summary** (132 chars max):
```
AI-powered LinkedIn job auto-applier. Apply to 100+ jobs/hour with smart form filling, analytics & Kanban tracking.
```

**Description**:
```
LinkedApply Pro automates your LinkedIn job applications with AI-powered intelligence.

🚀 KEY FEATURES:
• Auto-apply to LinkedIn Easy Apply jobs at scale
• AI-powered form filling (30+ question patterns)
• Smart job filtering (blacklists, bad words, experience matching)
• Kanban job tracker with drag-and-drop
• Real-time analytics dashboard (5 chart types)
• AI resume tailoring & cover letter generation
• Job match scoring (0-100)
• ATS keyword analysis
• Follow-up reminders with notifications
• Cloud sync across devices
• Data export (CSV, JSON, PDF)

🤖 AI PROVIDERS SUPPORTED:
• OpenAI (GPT-4o, GPT-4)
• Google Gemini
• DeepSeek

💰 PRICING:
• Free Trial: 3 days, 5 applications/day
• Day Pass: $2.99
• Weekly: $7.99
• Monthly: $14.99 (most popular)
• Yearly: $99.99 (save 44%)
• Lifetime: $199.99

⚡ HOW IT WORKS:
1. Install the extension
2. Fill in your profile in Settings
3. Set search terms and filters
4. Click Start — watch it apply!
5. Track everything in your dashboard

🔒 PRIVACY:
• Your data stays local by default
• No LinkedIn credentials or passwords collected
• Cloud sync is optional and encrypted
• Full data export anytime

Perfect for job seekers, bootcamp graduates, career changers, and anyone tired of manually filling out applications.
```

**Category**: Productivity

**Language**: English

### 5. Permissions Justification

| Permission | Justification |
|---|---|
| `activeTab` | Required to interact with LinkedIn job application forms |
| `sidePanel` | Powers the real-time dashboard alongside LinkedIn |
| `storage` | Stores user profile, settings, and job application history locally |
| `alarms` | Schedules follow-up reminders, subscription checks, and cloud sync |
| `notifications` | Displays follow-up reminder notifications to the user |
| `tabs` | Opens LinkedIn jobs page and manages external application tabs |
| Host: `linkedin.com` | Core functionality — reads job listings and fills application forms |
| Host: `api.openai.com` | Optional AI integration for smart question answering |
| Host: `googleapis.com` | Optional Google Gemini AI integration |
| Host: `api.deepseek.com` | Optional DeepSeek AI integration |

### 6. Review Tips
- Extension is **not minified** (`minify: false` in vite.config.ts) — makes Chrome review easier
- Source maps included for debugging
- All network requests are transparent (no obfuscated URLs)
- Privacy policy URL must be set in the developer dashboard

### 7. Post-Submission
- Review typically takes 1-3 business days
- If rejected, check the email for specific violations
- Common issues: overly broad permissions, unclear UI, missing privacy policy
