# Privacy Policy — LinkedApply Pro

**Last Updated:** April 2026

## What Data We Collect

### Data Stored Locally (Chrome Extension)
The following data is stored exclusively in your browser's local storage (`chrome.storage.local`) and never leaves your device unless you explicitly enable Cloud Sync:

- **Profile Information**: Name, email, phone number, location — used to auto-fill job application forms.
- **Question Defaults**: Pre-configured answers for common application questions (years of experience, salary expectations, etc.).
- **Search Preferences**: Job search terms, location filters, and blacklisted companies.
- **Applied Jobs History**: Job titles, companies, application dates, and status — used for the dashboard and analytics.
- **Session Statistics**: Application counts, time saved estimates.
- **Bot Settings**: Speed preferences, behavior toggles.

### Data Sent to Our Servers (Optional)
The following data is only transmitted when you have an active paid subscription and enable the corresponding features:

- **Cloud Sync**: If enabled, your applied jobs list is encrypted in transit (TLS) and stored in our Supabase database linked to your account. This enables cross-device access.
- **Usage Analytics**: Daily application counts (no job details) are recorded to enforce plan limits and generate your analytics dashboard.
- **AI Proxy Requests**: If you use our AI proxy (instead of your own API key), your prompts are forwarded to the configured AI provider (OpenAI/Gemini/DeepSeek) and never stored on our servers.

### Data We Do NOT Collect
- ❌ LinkedIn login credentials or passwords
- ❌ LinkedIn messages or connections
- ❌ Browsing history outside of LinkedIn
- ❌ Personal files, photos, or documents
- ❌ Keystroke or screen recording data
- ❌ Data from any website other than linkedin.com

## How We Use Your Data
1. **Auto-filling applications**: Your profile data is used solely to fill LinkedIn Easy Apply forms.
2. **Dashboard & Analytics**: Your local job history powers the dashboard charts and Kanban board.
3. **Plan enforcement**: Application counts are used to enforce daily limits for free trial users.
4. **Service improvement**: Anonymized, aggregate usage statistics may be used to improve the product.

## Data Security
- All data in transit uses HTTPS/TLS encryption.
- Your AI API keys are stored locally and never sent to our servers (unless using the AI proxy feature).
- Cloud-synced data is stored in Supabase with Row Level Security — only you can access your data.
- We use Stripe for payment processing. We never see or store your credit card details.

## Data Retention
- **Local data**: Persists until you uninstall the extension or clear it manually.
- **Cloud data**: Retained while your account is active. Deleted within 30 days of account closure.
- **Usage logs**: Retained for 90 days, then automatically purged.

## Third-Party Services
- **Supabase** (database & auth): [supabase.com/privacy](https://supabase.com/privacy)
- **Stripe** (payments): [stripe.com/privacy](https://stripe.com/privacy)
- **OpenAI / Google Gemini / DeepSeek** (AI, if enabled): Governed by their respective privacy policies.
- **Mailgun** (email): [mailgun.com/privacy-policy](https://www.mailgun.com/privacy-policy)

## Your Rights
- **Access**: View all your data via Settings → Account.
- **Export**: Download your data in CSV/JSON/HTML format at any time.
- **Delete**: Request complete data deletion by contacting support@linkedapplypro.com.
- **Opt-out**: Disable Cloud Sync at any time; all data remains local.

## Contact
For privacy inquiries: **support@linkedapplypro.com**

## Changes to This Policy
We may update this policy periodically. Significant changes will be communicated via email and/or an in-extension notification.
