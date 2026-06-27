/* ============================================================
   LinkedApply Pro — Bot Orchestrator
   The main control loop that ties search → filter → details →
   apply together. Port of Python's apply_to_jobs() + run()
   ============================================================ */

import { createLogger } from '../../shared/logger';
import { getStorage, setStorage, updateStorage } from '../../shared/storage';
import { STORAGE_KEYS, TIME_SAVED, DEFAULT_SEARCH_PREFS, DEFAULT_BOT_SETTINGS } from '../../shared/constants';
import type { TailoredResume } from '../../services/ai/resume-tailor';
import type {
  BotStatus,
  SearchPreferences,
  BotSettings,
  SessionSummary,
  Job,
  FailedJob,
  ExtensionMessage,
  MatchDetails,
} from '../../shared/types';

import { navigateToSearch, applyFilters, getPageInfo, goToNextPage, getJobListings, isDailyLimitReached } from './job-search';
import { getJobMainDetails, checkCompanyBlacklist, getJobDescription, getHiringManagerInfo, getDateListed, isEasyApplyJob, getExternalApplyButton } from './job-details';
import { executeEasyApply, handleExternalApply, discardApplication, dismissAnyOverlay } from './easy-apply';
import { humanDelay, waitForElement } from './dom-utils';

const log = createLogger('Orchestrator');

// ---- Orchestration State ----
let isRunning = false;
let isPaused = false;
let shouldStop = false;

// ---- Tracking Sets ----
let appliedJobIds = new Set<string>();
let rejectedJobs = new Set<string>();
let blacklistedCompanies = new Set<string>();

/**
 * Start the full automation cycle.
 * Port of Python's apply_to_jobs() — the main bot loop.
 */
export async function startAutomation(): Promise<void> {
  if (isRunning) {
    log.warn('Bot is already running');
    return;
  }

  isRunning = true;
  isPaused = false;
  shouldStop = false;

  log.info('🚀 Bot automation started');
  sendStatusUpdate('searching');

  try {
    const prefs = await getStorage<SearchPreferences>(STORAGE_KEYS.SEARCH_PREFS) || DEFAULT_SEARCH_PREFS;
    const botSettings = await getStorage<BotSettings>(STORAGE_KEYS.BOT_SETTINGS) || DEFAULT_BOT_SETTINGS;
    const existingJobs = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS);

    const settings: BotSettings = botSettings;

    // Build applied job IDs set from history
    if (existingJobs) {
      appliedJobIds = new Set(existingJobs.map((j) => j.id));
    }

    // Build blacklist sets
    blacklistedCompanies = new Set(
      (prefs.companies || []).map((c) => c.toLowerCase())
    );

    // Process job listings page by page
    let processedOnTerm = 0;
    const maxPerTerm = 100; // Safety limit

    while (processedOnTerm < maxPerTerm && !shouldStop) {
      // Check daily limit (LinkedIn's built-in)
      if (isDailyLimitReached()) {
        log.warn('Daily Easy Apply limit reached!');
        sendStatusUpdate('stopped');
        isRunning = false;
        return;
      }

      // Check user's daily goal
      const currentSession = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY);
      if (currentSession && currentSession.dailyGoal > 0 && currentSession.easyApplied >= currentSession.dailyGoal) {
        log.info(`🎯 Daily goal reached! (${currentSession.easyApplied}/${currentSession.dailyGoal})`);
        sendStatusUpdate('stopped');
        isRunning = false;
        return;
      }

      // Wait for and pause checks
      while (isPaused && !shouldStop) {
        await humanDelay(1000, 2000);
      }
      if (shouldStop) break;

      // Get page info
      const { paginationElement, currentPage } = getPageInfo();

      // Get job listings
      const jobListings = await getJobListings();
      if (jobListings.length === 0) {
        log.info('No job listings found on this page');
        break;
      }

      // Process each job
      for (const jobElement of jobListings) {
        if (shouldStop) break;
        while (isPaused && !shouldStop) {
          await humanDelay(1000, 2000);
        }

        try {
          await processJob(jobElement, prefs, settings);
          processedOnTerm++;
        } catch (error) {
          log.error('Error processing job', error);
        }
      }

      // Go to next page
      if (paginationElement && currentPage) {
        const hasNext = await goToNextPage(paginationElement, currentPage);
        if (!hasNext) {
          log.info('No more pages');
          break;
        }
      } else {
        log.info('No pagination — end of results');
        break;
      }
    }

    // Done
    log.info('✅ Automation cycle complete');
    sendStatusUpdate('stopped');
  } catch (error) {
    log.error('Automation failed', error);
    sendStatusUpdate('error');
  } finally {
    isRunning = false;
  }
}

/**
 * Process a single job listing element.
 * Port of the inner loop in apply_to_jobs().
 */
async function processJob(
  jobElement: Element,
  prefs: SearchPreferences,
  settings: BotSettings
): Promise<void> {
  // Step 0: Dismiss any lingering overlay from previous job (e.g. "Update your profile")
  await dismissAnyOverlay();

  // Step 1: Extract main details + skip checks
  const details = await getJobMainDetails(
    jobElement,
    appliedJobIds,
    blacklistedCompanies,
    rejectedJobs
  );

  if (details.skip) {
    await incrementSession('skipped');
    return;
  }

  const jobLink = `https://www.linkedin.com/jobs/view/${details.jobId}`;
  log.info(`Processing: "${details.title}" at ${details.company}`);
  sendStatusUpdate('applying');

  // Step 2: Check About Company blacklist
  const blacklistResult = await checkCompanyBlacklist(
    prefs.aboutCompanyBadWords,
    prefs.aboutCompanyGoodWords
  );

  if (blacklistResult.skip) {
    log.info(`Skipping: ${blacklistResult.reason}`);
    rejectedJobs.add(details.jobId);
    blacklistedCompanies.add(details.company.toLowerCase());
    await incrementSession('skipped');
    return;
  }

  // Step 3: Get HR info
  const hrInfo = getHiringManagerInfo();

  // Step 4: Get date listed
  const { dateListed, reposted } = getDateListed();


  // Step 5: Get job description + check bad words / experience
  const jd = getJobDescription(prefs);
  if (jd.skip) {
    log.info(`Skipping: ${jd.skipMessage}`);
    rejectedJobs.add(details.jobId);
    await incrementSession('skipped');
    return;
  }

  // Step 6: JD Match Scoring (if enabled) — routed through background worker
  let computedMatchScore: number | null = null;
  let computedMatchDetails: MatchDetails | null = null;
  const matchFilter = await getStorage<{ enabled: boolean; top: boolean; high: boolean; medium: boolean; low: boolean }>(STORAGE_KEYS.MATCH_FILTER);
  
  if (matchFilter?.enabled && jd.description !== 'Unknown') {
    try {
      const matchResponse = await chrome.runtime.sendMessage({
        type: 'AI_MATCH_JOB',
        payload: { jobDescription: jd.description },
        timestamp: Date.now(),
      });

      if (matchResponse?.error) {
        log.warn(`⚠ JD Match: ${matchResponse.error}`);
      } else if (matchResponse?.result) {
        const matchResult = matchResponse.result;
        computedMatchScore = Math.max(0, Math.min(100, matchResult.score));
        computedMatchDetails = {
          score: computedMatchScore,
          headline: matchResult.headline || '',
          recommendation: matchResult.recommendation || '',
          shouldApply: matchResult.shouldApply ?? true,
          strengths: matchResult.strengths || [],
          gaps: matchResult.gaps || [],
          requiredQualifications: matchResult.requiredQualifications || [],
          preferredQualifications: matchResult.preferredQualifications || [],
        };
        const category: 'top' | 'high' | 'medium' | 'low' = 
          computedMatchScore >= 80 ? 'top' :
          computedMatchScore >= 60 ? 'high' :
          computedMatchScore >= 40 ? 'medium' : 'low';
        
        const reqMatched = computedMatchDetails.requiredQualifications.filter(q => q.matched).length;
        const reqTotal = computedMatchDetails.requiredQualifications.length;
        log.info(`📊 Match: ${computedMatchScore}% (${category}) — ${reqMatched}/${reqTotal} required quals — "${details.title}"`);
        
        if (!matchFilter[category]) {
          log.info(`⏭ Skipping "${details.title}" — ${category} match (${computedMatchScore}%) below filter threshold`);
          await incrementSession('skipped');
          return;
        }
      }
    } catch (error) {
      log.warn('JD match scoring failed, continuing without score', error);
    }
  }

  // Step 6b: Resume Tailoring (if match scoring ran successfully) — routed through background worker
  let tailoredResult: TailoredResume | null = null;
  if (computedMatchScore !== null && jd.description !== 'Unknown') {
    try {
      const tailorResponse = await chrome.runtime.sendMessage({
        type: 'AI_TAILOR_RESUME',
        payload: { jobDescription: jd.description },
        timestamp: Date.now(),
      });

      if (tailorResponse?.result) {
        tailoredResult = tailorResponse.result;
        log.info(`📝 Resume tailored — ATS: ${tailoredResult!.atsScore}%, keywords: ${tailoredResult!.keywordsAdded.join(', ')}`);
      } else if (tailorResponse?.error) {
        log.warn(`Resume tailoring: ${tailorResponse.error}`);
      }
    } catch (error) {
      log.warn('Resume tailoring failed, continuing without', error);
    }
  }

  // Step 7: Check if Easy Apply or External
  const easyApplyBtn = isEasyApplyJob();

  if (easyApplyBtn) {
    // Easy Apply
    const result = await executeEasyApply(
      easyApplyBtn,
      details.workLocation,
      jd.description !== 'Unknown' ? jd.description : null,
      settings
    );

    if (result.success) {
      // Save applied job
      const job: Job = buildJobRecord(details, jd, hrInfo, dateListed, reposted, jobLink, 'Easy Applied', result.questionsAnswered);
      job.matchScore = computedMatchScore;
      if (computedMatchDetails) job.matchDetails = computedMatchDetails;
      if (tailoredResult) job.tailoredResume = tailoredResult;
      job.status = 'applied';
      await saveAppliedJob(job);
      appliedJobIds.add(details.jobId);
      await incrementSession('easyApplied');
      sendJobApplied(job);
      log.info(`✅ Successfully applied to "${details.title}" at ${details.company}`);
    } else {
      log.error(`❌ Failed to apply: ${result.error}`);
      await saveFailedJob(details, jobLink, result.error || 'Unknown error');
      await incrementSession('failed');
      sendJobFailed(details.title, details.company, result.error || 'Unknown error');
    }
  } else {
    // External Apply
    const externalBtn = getExternalApplyButton();
    if (externalBtn && !prefs.easyApplyOnly) {
      const extResult = await handleExternalApply(externalBtn, settings.closeTabs);
      if (extResult.success) {
        const job: Job = buildJobRecord(details, jd, hrInfo, dateListed, reposted, jobLink, extResult.applicationLink, []);
        job.status = 'external';
        job.matchScore = computedMatchScore;
        if (computedMatchDetails) job.matchDetails = computedMatchDetails;
        if (tailoredResult) job.tailoredResume = tailoredResult;
        await saveAppliedJob(job);
        appliedJobIds.add(details.jobId);
        await incrementSession('externalCollected');
        sendJobApplied(job);
      }
    } else {
      log.debug('Skipping non-Easy Apply job (Easy Apply only mode)');
    }
  }

  await humanDelay(settings.clickGap || 2000, (settings.clickGap || 2000) + 1500);
}

// ---- Control Methods ----

export function stopAutomation(): void {
  shouldStop = true;
  isRunning = false;
  isPaused = false;
  log.info('Bot stopped');
  sendStatusUpdate('stopped');
}

export function pauseAutomation(): void {
  isPaused = true;
  log.info('Bot paused');
  sendStatusUpdate('paused');
}

export function resumeAutomation(): void {
  isPaused = false;
  log.info('Bot resumed');
  sendStatusUpdate('searching');
}

export function getAutomationState(): { isRunning: boolean; isPaused: boolean } {
  return { isRunning, isPaused };
}

/**
 * Retry applying to the job on the current page.
 * Called when user clicks Retry on a failed job and is navigated to the job page.
 */
export async function retryJob(): Promise<void> {
  log.info('🔄 Retrying job application on current page...');
  sendStatusUpdate('applying');

  try {
    const settings = await getStorage<BotSettings>(STORAGE_KEYS.BOT_SETTINGS) || DEFAULT_BOT_SETTINGS;

    // Wait for page to fully load
    await humanDelay(2000, 3000);

    // Dismiss any overlays
    await dismissAnyOverlay();

    // Find Easy Apply button
    const easyApplyBtn = isEasyApplyJob();
    if (!easyApplyBtn) {
      log.warn('No Easy Apply button found on this page');
      sendStatusUpdate('idle');
      return;
    }

    const result = await executeEasyApply(
      easyApplyBtn,
      '',
      null,
      settings
    );

    if (result.success) {
      log.info('✅ Retry successful!');
      await incrementSession('easyApplied');

      // Build a minimal job record
      const jobLink = window.location.href;
      const title = document.querySelector<HTMLElement>('.t-24.t-bold.inline, h1.t-24')?.textContent?.trim() || 'Unknown';
      const company = document.querySelector<HTMLElement>('.jobs-unified-top-card__company-name a, .t-14.t-normal a')?.textContent?.trim() || 'Unknown';
      const job: Job = {
        id: `retry_${Date.now()}`,
        jobId: jobLink.match(/\/view\/(\d+)/)?.[1] || '',
        title,
        company,
        location: '',
        workStyle: '',
        description: '',
        experienceRequired: 'Unknown',
        jobLink,
        externalLink: 'Easy Applied',
        status: 'applied',
        dateApplied: new Date().toISOString(),
        dateListed: '',
        matchScore: null,
        hrName: '',
        hrLink: '',
        resumeUsed: result.resume || '',
        questionsAnswered: result.questionsAnswered || [],
        skillsExtracted: null,
        notes: '',
      };
      await saveAppliedJob(job);
      sendJobApplied(job);
    } else {
      log.error(`❌ Retry failed: ${result.error}`);
    }
  } catch (error) {
    log.error('Retry failed', error);
  } finally {
    sendStatusUpdate('idle');
  }
}

// ---- Helpers ----

function buildJobRecord(
  details: Awaited<ReturnType<typeof getJobMainDetails>>,
  jd: ReturnType<typeof getJobDescription>,
  hrInfo: ReturnType<typeof getHiringManagerInfo>,
  dateListed: string,
  reposted: boolean,
  jobLink: string,
  applicationLink: string,
  questionsAnswered: any[]
): Job {
  return {
    id: details.jobId,
    jobId: details.jobId,
    title: details.title,
    company: details.company,
    location: details.workLocation,
    workStyle: (details.workStyle as Job['workStyle']) || '',
    description: jd.description,
    experienceRequired: jd.experienceRequired !== null ? String(jd.experienceRequired) : 'Unknown',
    jobLink,
    externalLink: applicationLink,
    dateApplied: new Date().toISOString(),
    dateListed,
    status: 'applied',
    matchScore: null,
    resumeUsed: 'Previous resume',
    hrName: hrInfo.hrName,
    hrLink: hrInfo.hrLink,
    questionsAnswered,
    skillsExtracted: null,
    notes: reposted ? 'Reposted job' : '',
  };
}

async function saveAppliedJob(job: Job): Promise<void> {
  const existing = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS) || [];
  existing.push(job);
  await setStorage(STORAGE_KEYS.APPLIED_JOBS, existing);
}

async function incrementSession(
  field: 'easyApplied' | 'externalCollected' | 'skipped' | 'failed'
): Promise<void> {
  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY);
  if (!session) return;

  session[field] = (session[field] || 0) + 1;

  // Add time saved estimate
  if (field === 'easyApplied') session.estimatedTimeSaved += TIME_SAVED.easyApply;
  else if (field === 'externalCollected') session.estimatedTimeSaved += TIME_SAVED.external;
  else if (field === 'skipped') session.estimatedTimeSaved += TIME_SAVED.skip;

  await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);
}

// ---- Message Helpers ----

function sendStatusUpdate(status: BotStatus): void {
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    payload: { status },
    timestamp: Date.now(),
  } as ExtensionMessage).catch(() => {}); // Swallow if no listener
}

function sendJobApplied(job: Job): void {
  chrome.runtime.sendMessage({
    type: 'JOB_APPLIED',
    payload: { job },
    timestamp: Date.now(),
  } as ExtensionMessage).catch(() => {});
}

function sendJobFailed(title: string, company: string, error: string): void {
  chrome.runtime.sendMessage({
    type: 'JOB_FAILED',
    payload: { title, company, error },
    timestamp: Date.now(),
  } as ExtensionMessage).catch(() => {});
}

async function saveFailedJob(
  details: Awaited<ReturnType<typeof getJobMainDetails>>,
  jobLink: string,
  error: string
): Promise<void> {
  const failed = await getStorage<FailedJob[]>(STORAGE_KEYS.FAILED_JOBS) || [];
  failed.push({
    jobId: details.jobId,
    title: details.title,
    company: details.company,
    jobLink,
    error,
    timestamp: new Date().toISOString(),
  });
  // Keep only last 100 failures
  if (failed.length > 100) failed.splice(0, failed.length - 100);
  await setStorage(STORAGE_KEYS.FAILED_JOBS, failed);
}
