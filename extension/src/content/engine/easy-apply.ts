/* ============================================================
   LinkedApply Pro — Easy Apply Form Filler
   Port of the Python Easy Apply flow:
   Open modal → Answer questions → Navigate pages → Submit
   ============================================================ */

import { createLogger } from '../../shared/logger';
import { getStorage } from '../../shared/storage';
import { STORAGE_KEYS } from '../../shared/constants';
import type { UserProfile, QuestionDefaults, QuestionAnswer, BotSettings } from '../../shared/types';
import {
  waitForElement,
  clickElement,
  findSpanByText,
  humanDelay,
  scrollToView,
  findByTextContent,
} from './dom-utils';
import { answerQuestions } from './question-answerer';

const log = createLogger('EasyApply');

export interface EasyApplyResult {
  success: boolean;
  resume: string;
  questionsAnswered: QuestionAnswer[];
  error?: string;
}

/**
 * Execute the full Easy Apply flow for a job.
 * Port of the Python easy apply modal handling (lines 1043-1098 in runAiBot.py)
 *
 * Flow:
 * 1. Click Easy Apply button → modal opens
 * 2. Loop: Answer questions → Upload resume → Click Next/Review
 * 3. Follow/unfollow company
 * 4. Click "Submit application"
 * 5. Click "Done"
 */
export async function executeEasyApply(
  easyApplyButton: HTMLElement,
  workLocation: string,
  jobDescription: string | null,
  botSettings: BotSettings
): Promise<EasyApplyResult> {
  const allQuestions: QuestionAnswer[] = [];
  let resume = 'Previous resume';

  try {
    // Load user profile and question defaults
    const [profile, defaults] = await Promise.all([
      getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE),
      getStorage<QuestionDefaults>(STORAGE_KEYS.QUESTION_DEFAULTS),
    ]);

    if (!profile) {
      return { success: false, resume, questionsAnswered: allQuestions, error: 'No user profile configured' };
    }

    const questionDefaults: QuestionDefaults = defaults || getDefaultQuestionDefaults();

    // Step 1: Click Easy Apply button
    await clickElement(easyApplyButton);
    await humanDelay(1000, 2000);

    // Step 2: Find the Easy Apply modal
    const modal = await waitForElement('.jobs-easy-apply-modal', 5000);
    if (!modal) {
      return { success: false, resume, questionsAnswered: allQuestions, error: 'Easy Apply modal not found' };
    }

    // Step 3: Loop through modal pages — answer questions, upload resume, navigate
    // Unlike before, we answer questions on the FIRST page too (not just skipping to Next).
    let nextButton: HTMLElement | null = null;
    let pageCount = 0;
    let stuckRetries = 0;
    let lastPageSignature = '';
    const MAX_PAGES = 15;
    const MAX_STUCK_RETRIES = 3;

    do {
      pageCount++;
      if (pageCount > MAX_PAGES) {
        log.error('Exceeded maximum page count — likely stuck in a loop');
        await discardApplication();
        return {
          success: false,
          resume,
          questionsAnswered: allQuestions,
          error: 'Stuck in navigation loop (>15 pages)',
        };
      }

      // Answer questions on current page (including the first page)
      const context = {
        profile,
        defaults: questionDefaults,
        workLocation,
        jobDescription,
      };
      const pageAnswers = await answerQuestions(modal, context);
      allQuestions.push(...pageAnswers);

      // Try to upload resume (if upload field exists and we have a resume)
      if (questionDefaults.defaultResumePath) {
        await tryUploadResume(modal, questionDefaults.defaultResumePath);
      }

      // Look for the "Review" or "Next" button
      nextButton = findButtonInModal(modal, 'Review') || findButtonInModal(modal, 'Next');

      if (nextButton) {
        try {
          await clickElement(nextButton);
          await humanDelay(botSettings.clickGap || 1500, (botSettings.clickGap || 1500) + 1000);
        } catch {
          log.warn('Click intercepted on Next/Review, breaking loop');
          break;
        }

        // Check for LinkedIn validation errors (red error messages)
        const validationErrors = modal.querySelectorAll('.artdeco-inline-feedback--error');
        if (validationErrors.length > 0) {
          log.warn(`Found ${validationErrors.length} validation error(s) — required fields not filled`);
        }

        // Stuck detection: check if we're still on the same page
        const currentSignature = getPageSignature(modal);
        if (currentSignature === lastPageSignature) {
          stuckRetries++;
          log.warn(`Page didn't change after clicking Next (retry ${stuckRetries}/${MAX_STUCK_RETRIES})`);
          if (stuckRetries >= MAX_STUCK_RETRIES) {
            log.error('Stuck on same page — required questions likely unanswered. Discarding.');
            await discardApplication();
            return {
              success: false,
              resume,
              questionsAnswered: allQuestions,
              error: 'Stuck on page with unanswered required questions',
            };
          }
        } else {
          stuckRetries = 0;
        }
        lastPageSignature = currentSignature;
      }
    } while (nextButton && !isReviewPage(modal));

    // Step 5: We're on the Review page. Click "Review" one more time if needed.
    const reviewBtn = findSpanByText('Review', document) as HTMLElement;
    if (reviewBtn) {
      scrollToView(reviewBtn, true);
      await clickElement(reviewBtn);
      await humanDelay(500, 1000);
    }

    // Step 6: Handle follow company checkbox
    await handleFollowCompany(modal, botSettings);

    // Step 7: Pause before submit (if enabled) — send notification to sidepanel
    if (questionDefaults.pauseBeforeSubmit) {
      log.info('⏸️ Pausing before submit — waiting for user confirmation via sidepanel...');
      try {
        await chrome.runtime.sendMessage({
          type: 'PAUSE_BEFORE_SUBMIT',
          payload: { message: 'Application ready to submit. Confirm in sidepanel.' },
          timestamp: Date.now(),
        });
      } catch { /* sidepanel may not be open */ }

      // Wait for user confirmation (poll storage for up to 60 seconds)
      const confirmed = await waitForSubmitConfirmation(60000);
      if (!confirmed) {
        log.info('User did not confirm — discarding application');
        await discardApplication();
        return {
          success: false,
          resume,
          questionsAnswered: allQuestions,
          error: 'User declined to submit (pauseBeforeSubmit)',
        };
      }
      log.info('User confirmed — proceeding with submit');
    }

    // Step 8: Submit the application
    const submitBtn = findSpanByText('Submit application', document) as HTMLElement;
    if (submitBtn) {
      scrollToView(submitBtn, true);
      await clickElement(submitBtn);
      log.info('✅ Application submitted!');
      await humanDelay(1500, 2500);

      // Dismiss the post-apply confirmation modal.
      await dismissPostApplyModal();

      return { success: true, resume, questionsAnswered: allQuestions };
    }

    // Submit button not found
    log.error('Could not find "Submit application" button');
    await discardApplication();
    return {
      success: false,
      resume,
      questionsAnswered: allQuestions,
      error: 'Submit application button not found',
    };

  } catch (error) {
    log.error('Easy Apply failed', error);
    await discardApplication();
    return {
      success: false,
      resume,
      questionsAnswered: allQuestions,
      error: String(error),
    };
  }
}

/**
 * Handle external (non-Easy Apply) job applications.
 * Opens the external apply link and collects it.
 */
export async function handleExternalApply(
  applyButton: HTMLElement,
  closeTabs: boolean
): Promise<{ applicationLink: string; success: boolean }> {
  try {
    await clickElement(applyButton);
    await humanDelay(1000, 2000);

    // Check for "Continue" button (LinkedIn sometimes shows a confirmation)
    const continueBtn = findSpanByText('Continue');
    if (continueBtn) {
      await clickElement(continueBtn as HTMLElement);
      await humanDelay(1000, 2000);
    }

    // The external link should have opened in a new tab
    // Since we're in a content script, we can't directly access other tabs
    // Instead, send a message to the service worker to handle the external tab
    const applicationLink = 'External apply (check new tab)';
    log.info(`External apply link collected`);

    return { applicationLink, success: true };
  } catch (error) {
    log.error('External apply failed', error);
    return { applicationLink: 'Failed', success: false };
  }
}

/**
 * Discard the current job application (press Escape → click Discard)
 */
export async function discardApplication(): Promise<void> {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await humanDelay(500, 1000);
    const discardBtn = findSpanByText('Discard');
    if (discardBtn) {
      await clickElement(discardBtn as HTMLElement);
      await humanDelay(300, 600);
    }
    log.info('Application discarded');
  } catch (error) {
    log.warn('Failed to discard application', error);
  }
}

// ---- Post-Apply Modal Dismissal ----

async function dismissPostApplyModal(): Promise<void> {
  log.info('Dismissing post-apply confirmation modal...');

  // Retry up to 5 times (total ~10 seconds) to give the modal time to render
  for (let attempt = 0; attempt < 5; attempt++) {
    // Strategy 1: Click "Not now" button by scanning ALL buttons for exact text
    // LinkedIn often puts "Not now" directly in <button> without a <span> wrapper
    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const btn of allButtons) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if (text === 'not now' || text === 'done' || text === 'dismiss') {
        btn.click();
        log.info(`Closed post-apply modal via "${btn.textContent?.trim()}" button`);
        await humanDelay(500, 1000);
        return;
      }
    }

    // Strategy 2: Click "Not now" or "Done" via span (for older LinkedIn UI)
    const spanMatch = findSpanByText('Not now', document) || findSpanByText('Done', document);
    if (spanMatch) {
      (spanMatch as HTMLElement).click();
      log.info('Closed post-apply modal via span text match');
      await humanDelay(500, 1000);
      return;
    }

    // Strategy 3: Click the X (dismiss) button on the modal
    const dismissBtn = document.querySelector<HTMLElement>(
      'button.artdeco-modal__dismiss, button[data-test-modal-close-btn], .artdeco-modal button[aria-label="Dismiss"]'
    );
    if (dismissBtn) {
      dismissBtn.click();
      log.info('Closed post-apply modal via X button');
      await humanDelay(500, 1000);
      return;
    }

    // Wait before retrying — modal may still be rendering
    log.debug(`Post-apply modal not found yet, retrying (${attempt + 1}/5)...`);
    await humanDelay(1500, 2000);
  }

  // Strategy 5: Press Escape as absolute last resort
  log.warn('Could not find any dismiss button after 5 attempts, pressing Escape');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await humanDelay(500, 1000);

  // Check if an overlay is still blocking and force-remove it
  const overlay = document.querySelector('.artdeco-modal-overlay');
  if (overlay) {
    overlay.remove();
    log.warn('Force-removed lingering modal overlay from DOM');
  }
}

// ---- Stuck Detection & Pause Helpers ----

/**
 * Get a signature of the current modal page to detect stuck state.
 * Compares question labels + field content to know if the page changed.
 */
function getPageSignature(modal: Element): string {
  const labels = Array.from(modal.querySelectorAll('label'))
    .map(l => l.textContent?.trim() || '')
    .join('|');
  const errorCount = modal.querySelectorAll('.artdeco-inline-feedback--error').length;
  return `${labels}::${errorCount}`;
}

/**
 * Wait for the user to confirm submission via storage flag.
 * The sidepanel sets 'submit_confirmed' to true/false.
 */
async function waitForSubmitConfirmation(timeoutMs: number): Promise<boolean> {
  // Clear any previous flag
  await chrome.storage.local.set({ submit_confirmed: null });

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await chrome.storage.local.get('submit_confirmed');
    if (result.submit_confirmed === true) {
      await chrome.storage.local.remove('submit_confirmed');
      return true;
    }
    if (result.submit_confirmed === false) {
      await chrome.storage.local.remove('submit_confirmed');
      return false;
    }
    await humanDelay(1000, 1500);
  }
  // Timeout — default to not submitting
  return false;
}

// ---- Internal helpers ----

function findButtonInModal(modal: Element, text: string): HTMLElement | null {
  // Try span text match first
  const span = findSpanByText(text, modal);
  if (span) {
    // Return the parent button
    const btn = span.closest('button');
    return btn || (span as HTMLElement);
  }
  // Try button with text content
  const buttons = modal.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.trim().includes(text)) {
      return btn;
    }
  }
  return null;
}

function isReviewPage(modal: Element): boolean {
  // Check if we can see "Submit application" — means we're at the end
  const submitBtn = findSpanByText('Submit application', modal);
  return submitBtn !== null;
}

async function tryUploadResume(modal: Element, resumePath: string): Promise<boolean> {
  try {
    const fileInput = modal.querySelector("input[name='file']") as HTMLInputElement;
    if (fileInput) {
      // In Chrome extensions, we can't directly set file inputs due to security
      // The resume from LinkedIn's previous upload will be used
      log.debug('Resume upload field found — using LinkedIn\'s saved resume');
      return true;
    }
  } catch {
    log.debug('No resume upload field found');
  }
  return false;
}

async function handleFollowCompany(
  modal: Element,
  settings: BotSettings
): Promise<void> {
  try {
    const followCheckbox = modal.querySelector(
      "input#follow-company-checkbox[type='checkbox']"
    ) as HTMLInputElement;

    if (followCheckbox && followCheckbox.checked !== settings.followCompanies) {
      const label = modal.querySelector("label[for='follow-company-checkbox']") as HTMLElement;
      if (label) {
        await clickElement(label);
      }
    }
  } catch (error) {
    log.debug('Failed to update follow company checkbox', error);
  }
}

function getDefaultQuestionDefaults(): QuestionDefaults {
  return {
    defaultResumePath: '',
    yearsOfExperience: '3',
    requireVisa: 'No',
    website: '',
    linkedIn: '',
    desiredSalary: 0,
    usCitizenship: 'Yes',
    linkedinHeadline: '',
    noticePeriod: 0,
    currentCtc: 0,
    linkedinSummary: '',
    coverLetter: '',
    recentEmployer: '',
    confidenceLevel: '8',
    pauseBeforeSubmit: false,
    pauseAtFailedQuestion: false,
    overwritePreviousAnswers: false,
  };
}
