# Privacy Policy — LinkedApply Pro

**Last Updated:** September 4, 2026

## Overview

LinkedApply Pro is a browser extension that assists with job applications on LinkedIn. This privacy policy explains how the extension handles your data.

## Data Collection

**LinkedApply Pro does NOT collect, transmit, or store any personal data on external servers.**

All data is stored locally on your device using Chrome's built-in `chrome.storage` API.

## What Data is Stored Locally

The following data is stored **only on your device**:

- **Profile Information** — Name, email, phone number, and address you enter in Settings
- **Job Application Preferences** — Search terms, filters, question defaults
- **AI API Keys** — Your own API keys (Bring Your Own Key model)
- **Applied Job Records** — History of jobs you've applied to
- **Resume Text** — Parsed text from resumes you upload

## Third-Party Services

LinkedApply Pro connects to the following third-party AI services **only when you provide your own API key**:

| Service | Purpose | Data Sent |
|---|---|---|
| Google Gemini API | AI question answering, resume tailoring | Job description text, your profile context |
| OpenAI API | AI question answering, resume tailoring | Job description text, your profile context |
| DeepSeek API | AI question answering, resume tailoring | Job description text, your profile context |

**Your API keys are stored locally and sent directly to the respective provider.** They are never transmitted to LinkedApply Pro servers.

## Data Sharing

We do **NOT**:
- Sell or share your data with third parties
- Use analytics or tracking services
- Send your data to any server we operate
- Access your LinkedIn credentials

## LinkedIn Interaction

The extension interacts with LinkedIn's web interface in your browser to:
- Read job posting details (title, description, company)
- Fill in application form fields using your saved settings
- Navigate job search pages

The extension does **not** access your LinkedIn account credentials or session tokens.

## Data Deletion

All extension data can be deleted by:
1. Using the **Reset Extension** button in Settings → Account
2. Uninstalling the extension (all local data is automatically removed)

## Permissions Explained

| Permission | Why It's Needed |
|---|---|
| `storage` | Save your settings and job history locally |
| `activeTab` | Interact with the current LinkedIn tab |
| `sidePanel` | Display the dashboard side panel |
| `alarms` | Schedule periodic tasks (daily goal resets) |
| `tabs` | Open LinkedIn tabs and settings pages |

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last Updated" date above.

## Contact

For questions about this privacy policy, please open an issue on our GitHub repository.
