/* ============================================================
   LinkedApply Pro — Profile Import Service
   Parses structured data from LinkedIn profile pages or
   uploaded resumes (text) to auto-fill the user profile
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { UserProfile, QuestionDefaults } from '../shared/types';

const log = createLogger('ProfileImport');

// ---- Import Source Types ----
export type ImportSource = 'linkedin_page' | 'resume_text' | 'json_file';

export interface ImportResult {
  success: boolean;
  source: ImportSource;
  fieldsImported: string[];
  fieldsSkipped: string[];
  profile: Partial<UserProfile>;
  questionDefaults: Partial<QuestionDefaults>;
}

// ================================================
//  LINKEDIN PAGE IMPORT
// ================================================

/**
 * Extract profile data from the current LinkedIn profile page DOM.
 * Must be called from a content script running on linkedin.com/in/*
 */
export function extractFromLinkedInPage(): Partial<UserProfile> & { headline?: string; summary?: string } {
  const profile: any = {};

  // Full name
  const nameEl = document.querySelector('.pv-text-details__left-panel h1');
  if (nameEl) {
    const parts = (nameEl.textContent || '').trim().split(/\s+/);
    profile.firstName = parts[0] || '';
    profile.lastName = parts.length > 2 ? parts.slice(-1)[0] : (parts[1] || '');
    profile.middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
  }

  // Headline
  const headlineEl = document.querySelector('.pv-text-details__left-panel .text-body-medium');
  if (headlineEl) {
    profile.headline = (headlineEl.textContent || '').trim();
  }

  // Location
  const locationEl = document.querySelector('.pv-text-details__left-panel .text-body-small.inline');
  if (locationEl) {
    const locationText = (locationEl.textContent || '').trim();
    const locationParts = locationText.split(',').map((s: string) => s.trim());
    profile.currentCity = locationParts[0] || '';
    profile.state = locationParts[1] || '';
    profile.country = locationParts[2] || locationParts[1] || '';
  }

  // Contact info (from overlay if open)
  const emailEl = document.querySelector('a[href^="mailto:"]');
  if (emailEl) {
    profile.email = emailEl.getAttribute('href')?.replace('mailto:', '') || '';
  }

  const phoneEl = document.querySelector('a[href^="tel:"]');
  if (phoneEl) {
    profile.phoneNumber = phoneEl.getAttribute('href')?.replace('tel:', '') || '';
  }

  // Summary / About
  const aboutSection = document.querySelector('#about ~ .display-flex .pv-shared-text-with-see-more span[aria-hidden="true"]');
  if (aboutSection) {
    profile.summary = (aboutSection.textContent || '').trim();
  }

  // LinkedIn URL
  profile.linkedIn = window.location.href.split('?')[0];

  log.info('LinkedIn profile extracted', Object.keys(profile));
  return profile;
}

// ================================================
//  RESUME TEXT IMPORT
// ================================================

/**
 * Parse a plain-text resume to extract profile fields.
 * Uses regex patterns for common resume formats.
 */
export function parseResumeText(text: string): Partial<UserProfile> & Partial<QuestionDefaults> {
  const profile: any = {};
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Email
  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  if (emailMatch) profile.email = emailMatch[0];

  // Phone
  const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) profile.phoneNumber = phoneMatch[0].trim();

  // LinkedIn URL
  const linkedInMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedInMatch) profile.linkedIn = `https://${linkedInMatch[0]}`;

  // Website / Portfolio
  const websiteMatch = text.match(/(?:portfolio|website|github|site)[:\s]*(https?:\/\/[\S]+)/i);
  if (websiteMatch) profile.website = websiteMatch[1];

  // GitHub
  const githubMatch = text.match(/github\.com\/[\w-]+/i);
  if (githubMatch && !profile.website) profile.website = `https://${githubMatch[0]}`;

  // Name (assume first line or first non-email/phone line)
  for (const line of lines.slice(0, 5)) {
    if (line.includes('@') || /^\d/.test(line) || line.length > 60) continue;
    const nameParts = line.split(/\s+/);
    if (nameParts.length >= 2 && nameParts.length <= 4 && nameParts.every((p) => /^[A-Z]/.test(p))) {
      profile.firstName = nameParts[0];
      profile.lastName = nameParts[nameParts.length - 1];
      if (nameParts.length > 2) profile.middleName = nameParts.slice(1, -1).join(' ');
      break;
    }
  }

  // Location
  const locationMatch = text.match(/(?:location|address|city)[:\s]*([^\n]+)/i);
  if (locationMatch) {
    const parts = locationMatch[1].split(',').map((s) => s.trim());
    profile.currentCity = parts[0];
    profile.state = parts[1] || '';
    profile.country = parts[2] || '';
  }

  // Years of experience
  const expMatch = text.match(/(\d+)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:experience|exp)/i);
  if (expMatch) profile.yearsOfExperience = expMatch[1];

  // Recent employer
  const employerMatch = text.match(/(?:experience|work\s*history)\s*\n\s*(.+?)\s*(?:\n|—|–|-|\|)/i);
  if (employerMatch) profile.recentEmployer = employerMatch[1].trim();

  log.info('Resume parsed', Object.keys(profile));
  return profile;
}

// ================================================
//  JSON IMPORT / EXPORT
// ================================================

/**
 * Import a full profile + question defaults from a JSON file.
 */
export async function importFromJSON(jsonString: string): Promise<ImportResult> {
  try {
    const data = JSON.parse(jsonString);
    const result: ImportResult = {
      success: true,
      source: 'json_file',
      fieldsImported: [],
      fieldsSkipped: [],
      profile: {},
      questionDefaults: {},
    };

    if (data.profile) {
      result.profile = data.profile;
      result.fieldsImported.push(...Object.keys(data.profile));
    }
    if (data.questionDefaults) {
      result.questionDefaults = data.questionDefaults;
      result.fieldsImported.push(...Object.keys(data.questionDefaults).map((k) => `q:${k}`));
    }
    if (data.searchPreferences) {
      await setStorage(STORAGE_KEYS.SEARCH_PREFS, data.searchPreferences);
      result.fieldsImported.push('searchPreferences');
    }
    if (data.botSettings) {
      await setStorage(STORAGE_KEYS.BOT_SETTINGS, data.botSettings);
      result.fieldsImported.push('botSettings');
    }

    return result;
  } catch (error) {
    log.error('JSON import failed', error);
    return {
      success: false,
      source: 'json_file',
      fieldsImported: [],
      fieldsSkipped: ['all'],
      profile: {},
      questionDefaults: {},
    };
  }
}

/**
 * Export all user settings as JSON for backup/transfer.
 */
export async function exportAllSettingsJSON(): Promise<string> {
  const [profile, questionDefaults, searchPrefs, botSettings, aiConfig] = await Promise.all([
    getStorage(STORAGE_KEYS.USER_PROFILE),
    getStorage(STORAGE_KEYS.QUESTION_DEFAULTS),
    getStorage(STORAGE_KEYS.SEARCH_PREFS),
    getStorage(STORAGE_KEYS.BOT_SETTINGS),
    getStorage(STORAGE_KEYS.AI_CONFIG),
  ]);

  const exportData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    profile,
    questionDefaults,
    searchPreferences: searchPrefs,
    botSettings,
    aiConfig: aiConfig ? { ...aiConfig as any, apiKey: '***REDACTED***' } : null,
  };

  return JSON.stringify(exportData, null, 2);
}

// ================================================
//  MERGE IMPORTED DATA INTO STORAGE
// ================================================

/**
 * Apply imported profile data to storage (merge, don't overwrite blanks).
 */
export async function applyImport(result: ImportResult): Promise<void> {
  if (!result.success) return;

  // Merge profile
  if (Object.keys(result.profile).length > 0) {
    const existing = await getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE) || {} as UserProfile;
    const merged: any = { ...existing };

    for (const [key, value] of Object.entries(result.profile)) {
      if (value && String(value).trim()) {
        merged[key] = value;
      }
    }

    await setStorage(STORAGE_KEYS.USER_PROFILE, merged);
    log.info(`Profile updated: ${Object.keys(result.profile).length} fields`);
  }

  // Merge question defaults
  if (Object.keys(result.questionDefaults).length > 0) {
    const existing = await getStorage<QuestionDefaults>(STORAGE_KEYS.QUESTION_DEFAULTS) || {} as QuestionDefaults;
    const merged = { ...existing, ...result.questionDefaults };
    await setStorage(STORAGE_KEYS.QUESTION_DEFAULTS, merged);
    log.info(`Question defaults updated: ${Object.keys(result.questionDefaults).length} fields`);
  }
}
