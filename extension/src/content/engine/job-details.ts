/* ============================================================
   LinkedApply Pro — Job Details Extractor
   Port of get_job_main_details(), check_blacklist(),
   get_job_description(), extract_years_of_experience()
   ============================================================ */

import { createLogger } from '../../shared/logger';
import { getStorage } from '../../shared/storage';
import { STORAGE_KEYS } from '../../shared/constants';
import type { Job, SearchPreferences } from '../../shared/types';
import { scrollToView, humanDelay, waitForElement, clickElement } from './dom-utils';

const log = createLogger('JobDetails');

const RE_EXPERIENCE = /[(]?\s*(\d+)\s*[)]?\s*[-to]*\s*\d*[+]*\s*year[s]?/gi;

export interface JobMainDetails {
  jobId: string;
  title: string;
  company: string;
  workLocation: string;
  workStyle: string;
  skip: boolean;
  skipReason?: string;
}

export interface JobDescription {
  description: string;
  experienceRequired: number | null;
  skip: boolean;
  skipReason: string | null;
  skipMessage: string | null;
}

/**
 * Extract main details from a job listing card element.
 * Port of Python's get_job_main_details()
 */
export async function getJobMainDetails(
  jobElement: Element,
  appliedJobIds: Set<string>,
  blacklistedCompanies: Set<string>,
  rejectedJobs: Set<string>
): Promise<JobMainDetails> {
  let skip = false;
  let skipReason: string | undefined;

  // Get job ID from data attribute
  const jobId = jobElement.getAttribute('data-occludable-job-id') || 
                jobElement.getAttribute('data-job-id') ||
                jobElement.closest('[data-job-id]')?.getAttribute('data-job-id') || '';

  // Click into job details
  const jobLink = jobElement.querySelector('a') as HTMLElement;
  scrollToView(jobElement);

  // Get title — text before first newline
  let title = jobLink?.textContent?.trim() || 'Unknown';
  const newlineIdx = title.indexOf('\n');
  if (newlineIdx > 0) title = title.substring(0, newlineIdx).trim();

  // Get company + location from subtitle
  const subtitle = jobElement.querySelector('.artdeco-entity-lockup__subtitle');
  let company = 'Unknown';
  let workLocation = '';
  let workStyle = '';

  if (subtitle) {
    const subtitleText = subtitle.textContent?.trim() || '';
    const dotIndex = subtitleText.indexOf(' · ');
    if (dotIndex > -1) {
      company = subtitleText.substring(0, dotIndex).trim();
      workLocation = subtitleText.substring(dotIndex + 3).trim();
      // Extract work style from parentheses e.g., "San Francisco, CA (Remote)"
      const parenOpen = workLocation.lastIndexOf('(');
      const parenClose = workLocation.lastIndexOf(')');
      if (parenOpen > -1 && parenClose > parenOpen) {
        workStyle = workLocation.substring(parenOpen + 1, parenClose);
        workLocation = workLocation.substring(0, parenOpen).trim();
      }
    } else {
      company = subtitleText;
    }
  }

  // Skip checks
  if (blacklistedCompanies.has(company.toLowerCase())) {
    skip = true;
    skipReason = 'Blacklisted company';
    log.info(`Skipping "${title} | ${company}" (blacklisted company). Job ID: ${jobId}`);
  } else if (rejectedJobs.has(jobId)) {
    skip = true;
    skipReason = 'Previously rejected';
    log.info(`Skipping previously rejected "${title} | ${company}". Job ID: ${jobId}`);
  } else if (appliedJobIds.has(jobId)) {
    skip = true;
    skipReason = 'Already applied';
    log.info(`Already applied to "${title} | ${company}". Job ID: ${jobId}`);
  }

  // Check if LinkedIn shows "Applied" badge
  if (!skip) {
    const appliedBadge = jobElement.querySelector('.job-card-container__footer-job-state');
    if (appliedBadge?.textContent?.trim() === 'Applied') {
      skip = true;
      skipReason = 'Already applied (LinkedIn badge)';
      log.info(`Already applied to "${title} | ${company}". Job ID: ${jobId}`);
    }
  }

  // Click into job details if not skipping
  if (!skip && jobLink) {
    try {
      await clickElement(jobLink);
      await humanDelay(1000, 2000);
    } catch (error) {
      log.error(`Failed to click job details for "${title}"`, error);
      // Try dismissing any overlay and retrying
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await humanDelay(500, 800);
      try {
        await clickElement(jobLink);
      } catch {
        skip = true;
        skipReason = 'Failed to open job details';
      }
    }
  }

  return { jobId, title, company, workLocation, workStyle, skip, skipReason };
}

/**
 * Check About Company section for blacklisted words.
 * Port of Python's check_blacklist()
 */
export async function checkCompanyBlacklist(
  badWords: string[],
  goodWords: string[]
): Promise<{ skip: boolean; reason?: string }> {
  try {
    const aboutCompanyEl = document.querySelector('.jobs-company__box');
    if (!aboutCompanyEl) return { skip: false };

    scrollToView(aboutCompanyEl);
    const aboutCompany = aboutCompanyEl.textContent?.toLowerCase() || '';

    // Check good words first (if found, skip blacklist check)
    for (const word of goodWords) {
      if (aboutCompany.includes(word.toLowerCase())) {
        log.info(`Found good word "${word}" in About Company. Skipping blacklist check.`);
        return { skip: false };
      }
    }

    // Check bad words
    for (const word of badWords) {
      if (aboutCompany.includes(word.toLowerCase())) {
        log.info(`Found blacklisted word "${word}" in About Company.`);
        return { skip: true, reason: `About Company contains "${word}"` };
      }
    }
  } catch (error) {
    log.warn('Failed to check About Company blacklist', error);
  }

  return { skip: false };
}

/**
 * Extract job description and check for bad words, experience requirements.
 * Port of Python's get_job_description()
 */
export function getJobDescription(
  prefs: SearchPreferences
): JobDescription {
  let description = 'Unknown';
  let experienceRequired: number | null = null;
  let skip = false;
  let skipReason: string | null = null;
  let skipMessage: string | null = null;

  try {
    const descEl = document.querySelector('.jobs-box__html-content');
    if (!descEl) {
      log.warn('Could not find job description element');
      return { description, experienceRequired, skip, skipReason, skipMessage };
    }

    description = descEl.textContent?.trim() || 'Unknown';
    const descLower = description.toLowerCase();

    // Check bad words in JD
    for (const word of prefs.badWords) {
      if (descLower.includes(word.toLowerCase())) {
        skip = true;
        skipReason = 'Found bad word in job description';
        skipMessage = `Job description contains "${word}"`;
        log.info(skipMessage);
        return { description, experienceRequired, skip, skipReason, skipMessage };
      }
    }

    // Check security clearance
    if (!prefs.securityClearance) {
      if (descLower.includes('polygraph') || descLower.includes('clearance') || descLower.includes('secret')) {
        skip = true;
        skipReason = 'Requires security clearance';
        skipMessage = 'Job requires security clearance';
        return { description, experienceRequired, skip, skipReason, skipMessage };
      }
    }

    // Extract experience requirement
    experienceRequired = extractYearsOfExperience(description);

    // Check if required experience exceeds current
    if (prefs.currentExperience > -1 && experienceRequired !== null) {
      let effectiveExperience = prefs.currentExperience;
      if (prefs.didMasters && descLower.includes('master')) {
        effectiveExperience += 2;
        log.info('Added 2 years for Masters degree');
      }
      if (experienceRequired > effectiveExperience) {
        skip = true;
        skipReason = 'Required experience too high';
        skipMessage = `Experience required (${experienceRequired}yr) > Your experience (${effectiveExperience}yr)`;
      }
    }
  } catch (error) {
    log.error('Failed to extract job description', error);
  }

  return { description, experienceRequired, skip, skipReason, skipMessage };
}

/**
 * Extract max years of experience from job description text.
 * Port of Python's extract_years_of_experience()
 */
export function extractYearsOfExperience(text: string): number | null {
  const matches = text.match(RE_EXPERIENCE);
  if (!matches || matches.length === 0) return null;

  const years: number[] = [];
  for (const match of matches) {
    const numMatch = match.match(/(\d+)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      if (num <= 12) years.push(num);
    }
  }

  return years.length > 0 ? Math.max(...years) : null;
}

/**
 * Extract HR/hiring manager info from the job detail page
 */
export function getHiringManagerInfo(): { hrName: string; hrLink: string } {
  try {
    const hrCard = document.querySelector('.hirer-card__hirer-information');
    if (hrCard) {
      const link = hrCard.querySelector('a');
      const nameEl = hrCard.querySelector('span');
      return {
        hrName: nameEl?.textContent?.trim() || 'Unknown',
        hrLink: link?.getAttribute('href') || 'Unknown',
      };
    }
  } catch (error) {
    log.debug('HR info not found');
  }
  return { hrName: 'Unknown', hrLink: 'Unknown' };
}

/**
 * Extract date posted from "X time ago" text
 */
export function getDateListed(): { dateListed: string; reposted: boolean } {
  try {
    // Look for "X ago" spans in the top card
    const topCardClasses = [
      'job-details-jobs-unified-top-card__primary-description-container',
      'job-details-jobs-unified-top-card__primary-description',
      'jobs-unified-top-card__primary-description',
    ];

    let topCard: Element | null = null;
    for (const cls of topCardClasses) {
      topCard = document.querySelector(`.${cls}`);
      if (topCard) break;
    }

    if (topCard) {
      const spans = topCard.querySelectorAll('span');
      for (const span of spans) {
        const text = span.textContent?.trim() || '';
        if (text.includes(' ago')) {
          const reposted = text.includes('Reposted');
          const cleanText = text.replace('Reposted', '').trim();
          const date = calculateDatePosted(cleanText);
          return {
            dateListed: date ? date.toISOString() : 'Unknown',
            reposted,
          };
        }
      }
    }
  } catch (error) {
    log.debug('Failed to extract date listed');
  }
  return { dateListed: 'Unknown', reposted: false };
}

/**
 * Calculate actual date from "X time ago" string
 */
function calculateDatePosted(timeString: string): Date | null {
  const match = timeString.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const now = new Date();

  switch (unit) {
    case 'second': return new Date(now.getTime() - value * 1000);
    case 'minute': return new Date(now.getTime() - value * 60 * 1000);
    case 'hour':   return new Date(now.getTime() - value * 3600 * 1000);
    case 'day':    return new Date(now.getTime() - value * 86400 * 1000);
    case 'week':   return new Date(now.getTime() - value * 7 * 86400 * 1000);
    case 'month':  return new Date(now.getTime() - value * 30 * 86400 * 1000);
    case 'year':   return new Date(now.getTime() - value * 365 * 86400 * 1000);
    default: return null;
  }
}

/**
 * Check if a job is an Easy Apply job (has Easy Apply button)
 */
export function isEasyApplyJob(): HTMLElement | null {
  // Primary: button with "Easy" in aria-label
  const easyBtn = document.querySelector<HTMLElement>(
    "button.jobs-apply-button[aria-label*='Easy']"
  );
  if (easyBtn) return easyBtn;

  // Fallback: link with Easy Apply URL pattern
  const applyLink = document.querySelector<HTMLElement>(
    "a[href*='openSDUIApplyFlow=true']"
  );
  if (applyLink) return applyLink;

  return null;
}

/**
 * Get external apply button (for non-Easy Apply jobs)
 */
export function getExternalApplyButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    "button.jobs-apply-button.artdeco-button--3"
  );
}
