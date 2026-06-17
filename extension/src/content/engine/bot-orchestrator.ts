/* ============================================================
   LinkedApply Pro — Bot Orchestrator
   The main control loop that ties search → filter → details →
   apply together. Port of Python's apply_to_jobs() + run()
   ============================================================ */

import { createLogger } from '../../shared/logger';
import { getStorage, setStorage, updateStorage } from '../../shared/storage';
import { STORAGE_KEYS, TIME_SAVED, DEFAULT_SEARCH_PREFS, DEFAULT_BOT_SETTINGS } from '../../shared/constants';
import type {
  BotStatus,
  SearchPreferences,
  BotSettings,
  SessionSummary,
  Job,
  ExtensionMessage,
} from '../../shared/types';

import { navigateToSearch, applyFilters, getPageInfo, goToNextPage, getJobListings, isDailyLimitReached } from './job-search';
import { getJobMainDetails, checkCompanyBlacklist, getJobDescription, getHiringManagerInfo, getDateListed, isEasyApplyJob, getExternalApplyButton } from './job-details';
import { executeEasyApply, handleExternalApply, discardApplication } from './easy-apply';
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
      // Check daily limit
      if (isDailyLimitReached()) {
        log.warn('Daily Easy Apply limit reached!');
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

  // Step 6: Check if Easy Apply or External
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
      job.status = 'applied';
      await saveAppliedJob(job);
      appliedJobIds.add(details.jobId);
      await incrementSession('easyApplied');
      sendJobApplied(job);
      log.info(`✅ Successfully applied to "${details.title}" at ${details.company}`);
    } else {
      log.error(`❌ Failed to apply: ${result.error}`);
      await incrementSession('failed');
    }
  } else {
    // External Apply
    const externalBtn = getExternalApplyButton();
    if (externalBtn && !prefs.easyApplyOnly) {
      const extResult = await handleExternalApply(externalBtn, settings.closeTabs);
      if (extResult.success) {
        const job: Job = buildJobRecord(details, jd, hrInfo, dateListed, reposted, jobLink, extResult.applicationLink, []);
        job.status = 'external';
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
