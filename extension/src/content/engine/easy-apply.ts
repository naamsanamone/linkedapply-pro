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
  botSettings: BotSettings,
  tailoredResumeBlob?: Blob | null  // If provided, upload this PDF instead of using LinkedIn's default
): Promise<EasyApplyResult> {
  const allQuestions: QuestionAnswer[] = [];
  let resume = 'Previous resume';

  try {
    // Load user profile and question defaults
    const [profile, defaults, skillsMap] = await Promise.all([
      getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE),
      getStorage<QuestionDefaults>(STORAGE_KEYS.QUESTION_DEFAULTS),
      getStorage<Record<string, number>>(STORAGE_KEYS.USER_SKILLS_MAP),
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

    // Per-job resume tailoring removed — always use default LinkedIn resume
    // On-demand tailoring is available via sidepanel

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
        skillsMap: skillsMap || undefined,
      };
      const pageAnswers = await answerQuestions(modal, context);
      allQuestions.push(...pageAnswers);

      // Try to upload resume (tailored PDF if available, otherwise default)
      if (tailoredResumeBlob || questionDefaults.defaultResumePath) {
        await tryUploadResume(modal, questionDefaults.defaultResumePath || '', tailoredResumeBlob || undefined);
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

    // Step 5: We're on the Review page — proceed to submit.

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
    const submitBtn = findSubmitButton(modal);
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
 * Discard the current job application (press Escape → click Discard).
 * Made robust: tries clicking Discard immediately, then Escape + retry.
 */
export async function discardApplication(): Promise<void> {
  try {
    // First check if "Save this application?" dialog is already visible
    const discardedFast = await tryClickDiscard();
    if (discardedFast) return;

    // Press Escape to trigger the "Save this application?" dialog
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await humanDelay(300, 500);

    // Retry loop — dialog may take a moment to appear
    for (let attempt = 0; attempt < 4; attempt++) {
      const clicked = await tryClickDiscard();
      if (clicked) return;
      await humanDelay(150, 300);
    }

    // Last resort: press Escape again + force close
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await humanDelay(200, 300);
    await tryClickDiscard();

    log.warn('Discard button not found after retries');
  } catch (error) {
    log.warn('Failed to discard application', error);
  }
}

/**
 * Try to find and click the "Discard" button. Returns true if clicked.
 */
async function tryClickDiscard(): Promise<boolean> {
  // Strategy 1: Find Discard button by text
  const allButtons = Array.from(document.querySelectorAll('button'));
  for (const btn of allButtons) {
    const text = btn.textContent?.trim().toLowerCase() || '';
    if (text === 'discard' || text.includes('discard')) {
      btn.click();
      await humanDelay(100, 200);
      log.info('Application discarded (via button)');
      return true;
    }
  }

  // Strategy 2: Find Discard via span
  const discardSpan = findSpanByText('Discard');
  if (discardSpan) {
    (discardSpan as HTMLElement).click();
    await humanDelay(100, 200);
    log.info('Application discarded (via span)');
    return true;
  }

  // Strategy 3: X close button on modal
  const closeBtn = document.querySelector<HTMLElement>(
    'button[aria-label="Dismiss"], button[data-test-modal-close-btn], button.artdeco-modal__dismiss'
  );
  if (closeBtn) {
    closeBtn.click();
    await humanDelay(100, 200);
    log.info('Application discarded (via close button)');
    return true;
  }

  return false;
}

// ---- Post-Apply Modal Dismissal ----

const DISMISS_TEXTS = ['not now', 'skip', 'no thanks', 'done', 'dismiss', 'discard', 'got it', 'close'];

async function dismissPostApplyModal(): Promise<void> {
  log.info('Dismissing post-apply confirmation modal...');

  for (let attempt = 0; attempt < 5; attempt++) {
    // Strategy 1: Scan ALL buttons for dismiss-like text
    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const btn of allButtons) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if (DISMISS_TEXTS.some(t => text === t || text.startsWith(t))) {
        btn.click();
        log.info(`Closed post-apply modal via "${btn.textContent?.trim()}" button`);
        await humanDelay(500, 1000);
        return;
      }
    }

    // Strategy 2: Find dismiss text via span (older LinkedIn UI)
    for (const dismissText of ['Not now', 'Skip', 'Done', 'No thanks', 'Got it']) {
      const spanMatch = findSpanByText(dismissText, document);
      if (spanMatch) {
        (spanMatch as HTMLElement).click();
        log.info(`Closed post-apply modal via span "${dismissText}"`);
        await humanDelay(500, 1000);
        return;
      }
    }

    // Strategy 3: Click X (dismiss) button on any artdeco modal
    const dismissBtn = document.querySelector<HTMLElement>(
      'button.artdeco-modal__dismiss, ' +
      'button[data-test-modal-close-btn], ' +
      '.artdeco-modal button[aria-label="Dismiss"], ' +
      '.artdeco-modal button[aria-label="Close"], ' +
      '.artdeco-modal__dismiss'
    );
    if (dismissBtn) {
      dismissBtn.click();
      log.info('Closed post-apply modal via X button');
      await humanDelay(500, 1000);
      return;
    }

    // Strategy 4: Detect "Update your profile" heading and click skip
    const headings = Array.from(document.querySelectorAll('h2, h3, [class*="modal"] h2'));
    for (const h of headings) {
      const text = h.textContent?.trim().toLowerCase() || '';
      if (text.includes('update') && text.includes('profile')) {
        log.info('Detected "Update your profile" overlay — looking for dismiss button');
        // Find the closest modal/section and click any dismiss-like button in it
        const container = h.closest('.artdeco-modal, [role="dialog"], section, div[class*="modal"]') || document;
        const containerButtons = Array.from(container.querySelectorAll('button'));
        for (const btn of containerButtons) {
          const btnText = btn.textContent?.trim().toLowerCase() || '';
          if (DISMISS_TEXTS.some(t => btnText === t || btnText.startsWith(t))) {
            btn.click();
            log.info(`Dismissed profile update via "${btn.textContent?.trim()}"`);
            await humanDelay(500, 1000);
            return;
          }
        }
        // If no text match, click the X button inside the container
        const xBtn = container.querySelector<HTMLElement>('button[aria-label="Dismiss"], button[aria-label="Close"], button.artdeco-modal__dismiss');
        if (xBtn) {
          xBtn.click();
          log.info('Dismissed profile update via X button');
          await humanDelay(500, 1000);
          return;
        }
      }
    }

    log.debug(`Post-apply modal not found yet, retrying (${attempt + 1}/5)...`);
    await humanDelay(1500, 2000);
  }

  // Last resort: Escape key
  log.warn('Could not find any dismiss button after 5 attempts, pressing Escape');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await humanDelay(500, 1000);

  // Force-remove lingering overlays
  const overlays = document.querySelectorAll('.artdeco-modal-overlay, .artdeco-modal-overlay--is-top-layer');
  overlays.forEach(overlay => {
    overlay.remove();
    log.warn('Force-removed lingering modal overlay from DOM');
  });
}

/**
 * Dismiss any lingering overlay/modal before processing the next job.
 * Called by the orchestrator at the start of each processJob cycle.
 */
export async function dismissAnyOverlay(): Promise<void> {
  // Check for any visible artdeco modals
  const modal = document.querySelector<HTMLElement>('.artdeco-modal:not([style*="display: none"])');
  if (!modal) return;

  log.info('Found lingering overlay — attempting to dismiss...');

  // Priority 1: Check for "Save this application?" dialog — click Discard immediately
  const allButtons = Array.from(modal.querySelectorAll('button'));
  for (const btn of allButtons) {
    const text = btn.textContent?.trim().toLowerCase() || '';
    if (text === 'discard' || text.includes('discard')) {
      btn.click();
      log.info('Dismissed "Save this application?" dialog via Discard');
      await humanDelay(300, 500);
      return;
    }
  }

  // Priority 2: Try other dismiss texts
  for (const btn of allButtons) {
    const text = btn.textContent?.trim().toLowerCase() || '';
    if (DISMISS_TEXTS.some(t => text === t || text.startsWith(t))) {
      btn.click();
      log.info(`Dismissed lingering overlay via "${btn.textContent?.trim()}"`);
      await humanDelay(300, 500);
      return;
    }
  }

  // Priority 3: Try X button
  const xBtn = modal.querySelector<HTMLElement>('button[aria-label="Dismiss"], button[aria-label="Close"], button.artdeco-modal__dismiss');
  if (xBtn) {
    xBtn.click();
    log.info('Dismissed lingering overlay via X button');
    await humanDelay(300, 500);
    return;
  }

  // Escape as fallback
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await humanDelay(300, 500);
  log.warn('Pressed Escape to dismiss lingering overlay');
}

// ---- Stuck Detection & Pause Helpers ----

/**
 * Find the submit button using multiple strategies for robustness.
 * Scoped to modal first, falls back to document. Handles non-English UIs.
 */
function findSubmitButton(modal: Element): HTMLElement | null {
  const SUBMIT_TEXTS = ['submit application', 'submit', 'enviar solicitud', 'bewerbung absenden', 'candidater', 'envoyer'];

  // Strategy 1: Find button/span with submit text inside modal
  for (const text of SUBMIT_TEXTS) {
    const btn = findButtonInModal(modal, text.charAt(0).toUpperCase() + text.slice(1));
    if (btn) return btn;
    const span = findSpanByText(text.charAt(0).toUpperCase() + text.slice(1), modal as HTMLElement);
    if (span) return span as HTMLElement;
  }

  // Strategy 2: Check aria-label on buttons in modal footer
  const footerBtns = modal.querySelectorAll<HTMLElement>('footer button, .artdeco-modal__actionbar button');
  for (const btn of footerBtns) {
    const aria = btn.getAttribute('aria-label')?.toLowerCase() || '';
    const text = btn.textContent?.toLowerCase() || '';
    if (SUBMIT_TEXTS.some(t => aria.includes(t) || text.includes(t))) return btn;
  }

  // Strategy 3: Primary button in modal footer (last resort)
  const primaryBtn = modal.querySelector<HTMLElement>('footer button.artdeco-button--primary');
  if (primaryBtn) return primaryBtn;

  // Strategy 4: Fall back to document-wide search
  const docBtn = findSpanByText('Submit application', document) as HTMLElement;
  return docBtn || null;
}

/**
 * Get a signature of the current modal page to detect stuck state.
 * Compares question labels + field content to know if the page changed.
 */
function getPageSignature(modal: Element): string {
  const heading = modal.querySelector('h2, h3')?.textContent?.trim() || '';
  const labels = Array.from(modal.querySelectorAll('label'))
    .map(l => l.textContent?.trim() || '')
    .join('|');
  const fields = Array.from(modal.querySelectorAll('input, select, textarea'))
    .map(f => (f as HTMLElement).id || (f as HTMLInputElement).name || '')
    .filter(Boolean)
    .join(',');
  const errorCount = modal.querySelectorAll('.artdeco-inline-feedback--error').length;
  return `${heading}::${labels}::${fields}::${errorCount}`;
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

async function tryUploadResume(modal: Element, resumePath: string, tailoredBlob?: Blob): Promise<boolean> {
  try {
    const fileInput = modal.querySelector("input[type='file']") as HTMLInputElement;
    if (!fileInput) {
      log.debug('No resume upload field found');
      return false;
    }

    // If we have a tailored resume blob, upload it
    if (tailoredBlob) {
      try {
        const file = new File([tailoredBlob], 'tailored_resume.pdf', {
          type: 'application/pdf',
          lastModified: Date.now(),
        });

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Dispatch change event so LinkedIn picks up the file
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));

        log.info(`📄 Tailored resume uploaded (${(tailoredBlob.size / 1024).toFixed(1)} KB)`);
        return true;
      } catch (uploadErr) {
        log.warn('Failed to upload tailored resume, using default', uploadErr);
      }
    }

    // Use LinkedIn's previously saved/uploaded resume
    log.debug('Resume upload field found — using LinkedIn\'s saved resume');
    return true;
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
