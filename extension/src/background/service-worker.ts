/* ============================================================
   LinkedApply Pro — Background Service Worker
   Event-driven orchestrator (Manifest V3)
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS, DEFAULT_SESSION } from '../shared/constants';
import type { BotStatus, SessionSummary, ExtensionMessage, UserProfile } from '../shared/types';
import { createAIProviderFromStorage } from '../services/ai/ai-provider';
import { aiMatchJob } from '../services/ai/job-matcher';
import { aiTailorResume } from '../services/ai/resume-tailor';
import { aiGenerateCoverLetter } from '../services/ai/cover-letter-gen';
import { aiGenerateStandOutTips } from '../services/ai/standout-tips';

const log = createLogger('ServiceWorker');

// ---- Extension Install / Update ----
chrome.runtime.onInstalled.addListener((details) => {
  log.info(`Extension ${details.reason}`, { version: chrome.runtime.getManifest().version });

  // Enable side panel to open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(log.error);

  // Initialize default storage values on first install
  if (details.reason === 'install') {
    initializeDefaults();
  }
});

async function initializeDefaults(): Promise<void> {
  const existing = await getStorage(STORAGE_KEYS.BOT_STATUS);
  if (!existing) {
    await setStorage(STORAGE_KEYS.BOT_STATUS, 'idle');
    await setStorage(STORAGE_KEYS.SESSION_SUMMARY, DEFAULT_SESSION);
    await setStorage(STORAGE_KEYS.SUBSCRIPTION, {
      plan: 'free_trial',
      status: 'active',
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
      features: [],
      dailyLimit: 5,
      trialDaysRemaining: 3,
    });
    log.info('Default storage values initialized');
  }
}

// ---- Message Router ----
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    log.info(`Message received: ${message.type}`, { from: sender.tab?.id || 'popup/sidepanel' });

    switch (message.type) {
      case 'START_BOT':
        handleStartBot(sender.tab?.id);
        sendResponse({ success: true });
        break;

      case 'STOP_BOT':
        handleStopBot(sender.tab?.id);
        sendResponse({ success: true });
        break;

      case 'PAUSE_BOT':
      case 'RESUME_BOT':
        forwardToContentScript(message, sender.tab?.id);
        sendResponse({ success: true });
        break;

      case 'STATUS_UPDATE':
        handleStatusUpdate(message.payload);
        break;

      case 'JOB_APPLIED':
        handleJobApplied(message.payload);
        sendResponse({ success: true });
        break;

      case 'JOB_FAILED':
        handleJobFailed(message.payload);
        sendResponse({ success: true });
        break;

      case 'JOB_SKIPPED':
        handleJobSkipped(message.payload);
        sendResponse({ success: true });
        break;

      case 'OPEN_SIDEPANEL':
        openSidePanel(sender);
        sendResponse({ success: true });
        break;

      case 'RETRY_JOB':
        handleRetryJob(message.payload?.jobLink);
        sendResponse({ success: true });
        break;

      case 'GET_STATUS':
        getStatus().then(sendResponse);
        return true; // async

      case 'AI_MATCH_JOB':
        handleAIMatchJob(message.payload).then(sendResponse);
        return true; // async

      case 'AI_TAILOR_RESUME':
        handleAITailorResume(message.payload).then(sendResponse);
        return true; // async

      case 'AI_COVER_LETTER':
        handleAICoverLetter(message.payload).then(sendResponse);
        return true; // async

      case 'AI_STANDOUT_TIPS':
        handleAIStandOutTips(message.payload).then(sendResponse);
        return true; // async

      default:
        sendResponse({ error: 'Unknown message type' });
    }

    return true; // Keep channel open
  }
);

// ---- Bot Control ----
async function handleStartBot(tabId?: number): Promise<void> {
  log.info('Starting bot...');
  await setStorage(STORAGE_KEYS.BOT_STATUS, 'searching');

  // Update session start time
  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY) || { ...DEFAULT_SESSION };
  session.startTime = new Date().toISOString();
  session.totalRuns += 1;
  await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);
  updateBadge(session.easyApplied, 'running');

  // Send to the currently active tab
  const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTabs.length > 0 && activeTabs[0].id) {
    chrome.tabs.sendMessage(activeTabs[0].id, {
      type: 'START_BOT',
      timestamp: Date.now(),
    } as ExtensionMessage);
  } else {
    // Open LinkedIn jobs page
    const newTab = await chrome.tabs.create({ url: 'https://www.linkedin.com/jobs/search/' });
    // Wait for content script to load then send start
    setTimeout(() => {
      if (newTab.id) {
        chrome.tabs.sendMessage(newTab.id, {
          type: 'START_BOT',
          timestamp: Date.now(),
        } as ExtensionMessage);
      }
    }, 3000);
  }
}

async function handleStopBot(tabId?: number): Promise<void> {
  log.info('Stopping bot...');
  await setStorage(STORAGE_KEYS.BOT_STATUS, 'stopped');

  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY);
  if (session) {
    session.endTime = new Date().toISOString();
    await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);
  }

  // Forward to content script
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  tabs.forEach((tab) => {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'STOP_BOT',
        timestamp: Date.now(),
      } as ExtensionMessage);
    }
  });

  broadcastUpdate();
  updateBadge(0, 'stopped');
}

// ---- Event Handlers ----
async function handleStatusUpdate(payload: any): Promise<void> {
  if (payload?.status) {
    await setStorage(STORAGE_KEYS.BOT_STATUS, payload.status);

    // Notify on stop or error
    if (payload.status === 'stopped') {
      const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY);
      const applied = session?.easyApplied || 0;
      showNotification(
        'stopped',
        '⏹️ Bot Stopped',
        applied > 0 ? `Session complete — ${applied} applications sent.` : 'Automation has been stopped.'
      );
    } else if (payload.status === 'error') {
      showNotification(
        'error',
        '⚠️ Bot Error',
        'The bot encountered an error and stopped. Check the dashboard for details.'
      );
    }
  }
  broadcastUpdate();
}

async function handleJobApplied(payload: any): Promise<void> {
  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY) || { ...DEFAULT_SESSION };
  session.easyApplied += 1;
  session.estimatedTimeSaved += 80; // 80 seconds per easy apply
  await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);

  log.info(`Job applied! Total: ${session.easyApplied}`);
  updateBadge(session.easyApplied, 'running');

  // Notify every 5 applications
  if (session.easyApplied % 5 === 0) {
    showNotification(
      'progress',
      `🚀 ${session.easyApplied} Applications Sent!`,
      `You've applied to ${session.easyApplied} jobs this session. Keep going!`
    );
  }

  // Notify when daily goal is reached
  if (session.dailyGoal > 0 && session.easyApplied === session.dailyGoal) {
    showNotification(
      'goal',
      '🎯 Daily Goal Reached!',
      `You hit your target of ${session.dailyGoal} applications. Great work!`
    );
  }

  broadcastUpdate();
}

async function handleJobFailed(payload: any): Promise<void> {
  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY) || { ...DEFAULT_SESSION };
  session.failed += 1;
  await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);
  broadcastUpdate();
}

async function handleJobSkipped(payload: any): Promise<void> {
  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY) || { ...DEFAULT_SESSION };
  session.skipped += 1;
  session.estimatedTimeSaved += 10;
  await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);
  broadcastUpdate();
}

// ---- Helpers ----
async function getStatus(): Promise<{ status: BotStatus; session: SessionSummary }> {
  const status = await getStorage<BotStatus>(STORAGE_KEYS.BOT_STATUS) || 'idle';
  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY) || DEFAULT_SESSION;
  return { status, session };
}

async function handleRetryJob(jobLink?: string): Promise<void> {
  if (!jobLink) {
    log.warn('No job link provided for retry');
    return;
  }

  log.info(`Retrying job: ${jobLink}`);

  // Open job page in a new tab
  const tab = await chrome.tabs.create({ url: jobLink, active: true });

  // Wait for the tab to finish loading, then send RETRY_APPLY
  const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
    if (tabId === tab.id && changeInfo.status === 'complete') {
      chrome.tabs.onUpdated.removeListener(listener);
      // Give content script time to initialize
      setTimeout(() => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'RETRY_APPLY',
            timestamp: Date.now(),
          } as ExtensionMessage).catch((err) => {
            log.error('Failed to send RETRY_APPLY', err);
          });
        }
      }, 2000);
    }
  };
  chrome.tabs.onUpdated.addListener(listener);

  // Safety timeout: remove listener after 30s
  setTimeout(() => {
    chrome.tabs.onUpdated.removeListener(listener);
  }, 30000);
}

function broadcastUpdate(): void {
  // Notify popup and side panel
  getStatus().then((data) => {
    chrome.runtime.sendMessage({
      type: 'STATUS_UPDATE',
      payload: data,
      timestamp: Date.now(),
    } as ExtensionMessage).catch(() => {
      // No listeners — popup/sidepanel not open
    });
  });
}

function forwardToContentScript(message: ExtensionMessage, excludeTabId?: number): void {
  chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.id !== excludeTabId) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {
          // Tab may have been closed or navigated away — ignore
        });
      }
    });
  });
}

async function openSidePanel(sender: chrome.runtime.MessageSender): Promise<void> {
  try {
    let windowId = sender.tab?.windowId;
    if (!windowId) {
      const currentWindow = await chrome.windows.getCurrent();
      windowId = currentWindow.id;
    }
    if (windowId) {
      await chrome.sidePanel.open({ windowId });
    }
  } catch (error) {
    log.error('Failed to open side panel', error);
  }
}

// ---- Alarms (reminders, subscription refresh, sync) ----
chrome.alarms.onAlarm.addListener(async (alarm) => {
  log.info(`Alarm fired: ${alarm.name}`);

  switch (alarm.name) {
    case 'subscription_check': {
      // Periodic subscription refresh from backend
      try {
        const { refreshSubscription } = await import('../services/subscription-service');
        await refreshSubscription();
      } catch (e) {
        log.error('Subscription refresh failed', e);
      }
      break;
    }

    case 'cloud_sync': {
      // Periodic cloud sync
      try {
        const { syncToCloud } = await import('../services/sync-service');
        await syncToCloud();
      } catch (e) {
        log.error('Cloud sync failed', e);
      }
      break;
    }

    case 'reminder_cleanup': {
      // Clean up old reminders
      try {
        const { cleanupOldReminders } = await import('../services/reminder-service');
        await cleanupOldReminders();
      } catch (e) {
        log.error('Reminder cleanup failed', e);
      }
      break;
    }

    default: {
      // Check if it's a follow-up reminder alarm
      if (alarm.name.startsWith('followup_')) {
        try {
          const { handleReminderAlarm } = await import('../services/reminder-service');
          await handleReminderAlarm(alarm.name);
        } catch (e) {
          log.error('Reminder alarm failed', e);
        }
      }
    }
  }
});

// ---- Notification Button Clicks (for reminders) ----
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith('followup_')) {
    try {
      const { handleNotificationClick } = await import('../services/reminder-service');
      await handleNotificationClick(notificationId, buttonIndex);
    } catch (e) {
      log.error('Notification click handler failed', e);
    }
  }
});

// ---- Set up periodic alarms ----
chrome.alarms.create('subscription_check', { periodInMinutes: 60 });
chrome.alarms.create('cloud_sync', { periodInMinutes: 30 });
chrome.alarms.create('reminder_cleanup', { periodInMinutes: 1440 }); // Once daily

log.info('Service worker initialized');

// ---- Notification Helper ----
function showNotification(id: string, title: string, message: string): void {
  try {
    chrome.notifications.create(`linkedapply_${id}_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title,
      message,
      priority: 1,
    }, () => {
      // Suppress any errors (e.g. icon not found)
      if (chrome.runtime.lastError) { /* ignore */ }
    });
  } catch {
    // notifications may be disabled
  }
}

// ---- Badge Helper ----
function updateBadge(count: number, state: 'running' | 'stopped' | 'error'): void {
  try {
    if (state === 'stopped') {
      chrome.action.setBadgeText({ text: '' });
    } else {
      chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
      chrome.action.setBadgeBackgroundColor({
        color: state === 'error' ? '#ef4444' : '#22c55e',
      });
    }
  } catch {
    // badge API may not be available
  }
}

// Initialize badge from stored session on startup
(async () => {
  const status = await getStorage<string>(STORAGE_KEYS.BOT_STATUS);
  if (status === 'searching' || status === 'applying') {
    const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY);
    updateBadge(session?.easyApplied || 0, 'running');
  }
})();

// ---- AI Proxy Handlers ----
// Content scripts can't reliably make cross-origin fetch calls.
// These handlers run in the service worker which has full host_permissions.

// AI client cache — avoid re-creating on every call
import type { AIProviderClient } from '../services/ai/ai-provider';
let _cachedAIClient: AIProviderClient | null = null;
let _aiClientCreatedAt = 0;
const AI_CLIENT_TTL = 5 * 60 * 1000; // re-read config every 5 min

// Rate limit tracking — back off on 429
let _rateLimitUntil = 0;      // timestamp when we can retry
let _rateLimitBackoff = 0;    // current backoff in ms
const RATE_LIMIT_MAX_BACKOFF = 120_000; // 2 minutes max

async function getOrCreateAIClient(): Promise<AIProviderClient | null> {
  const now = Date.now();
  if (_cachedAIClient && (now - _aiClientCreatedAt) < AI_CLIENT_TTL) {
    return _cachedAIClient;
  }
  _cachedAIClient = await createAIProviderFromStorage();
  _aiClientCreatedAt = now;
  return _cachedAIClient;
}

function checkRateLimit(): string | null {
  const now = Date.now();
  if (now < _rateLimitUntil) {
    const waitSec = Math.ceil((_rateLimitUntil - now) / 1000);
    return `Rate limited — retry in ${waitSec}s`;
  }
  return null;
}

function handleRateLimitError(error: any): void {
  // Parse retry delay from Gemini 429 response
  const retryMatch = error.message?.match(/retry in ([\d.]+)s/i);
  let waitMs: number;

  if (retryMatch) {
    waitMs = Math.ceil(parseFloat(retryMatch[1]) * 1000);
  } else {
    // Exponential backoff: 15s, 30s, 60s, 120s
    _rateLimitBackoff = _rateLimitBackoff ? Math.min(_rateLimitBackoff * 2, RATE_LIMIT_MAX_BACKOFF) : 15_000;
    waitMs = _rateLimitBackoff;
  }

  _rateLimitUntil = Date.now() + waitMs;
  log.warn(`⏳ AI rate limited — backing off for ${Math.ceil(waitMs / 1000)}s`);
}

function clearRateLimit(): void {
  _rateLimitBackoff = 0;
  // Don't clear _rateLimitUntil — let it expire naturally
}

async function handleAIMatchJob(payload: any): Promise<any> {
  // Check rate limit first
  const rateLimitMsg = checkRateLimit();
  if (rateLimitMsg) return { error: rateLimitMsg };

  try {
    const aiClient = await getOrCreateAIClient();
    if (!aiClient) return { error: 'No AI provider configured' };

    const profile = await getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE);
    if (!profile) return { error: 'No user profile found' };

    const resumeText = await getStorage<string>(STORAGE_KEYS.RESUME_TEXT);
    const skillsMap = await getStorage<Record<string, number>>(STORAGE_KEYS.USER_SKILLS_MAP);

    const result = await aiMatchJob(
      aiClient, profile, payload.jobDescription,
      resumeText || undefined, skillsMap || undefined
    );

    clearRateLimit();
    return { success: true, result };
  } catch (error: any) {
    if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE')) {
      handleRateLimitError(error);
      return { error: 'AI quota exceeded — will retry after cooldown' };
    }
    log.error('AI match job failed in service worker', error);
    return { error: error.message || 'AI match failed' };
  }
}

async function handleAITailorResume(payload: any): Promise<any> {
  // Check rate limit first
  const rateLimitMsg = checkRateLimit();
  if (rateLimitMsg) return { error: rateLimitMsg };

  try {
    const aiClient = await getOrCreateAIClient();
    if (!aiClient) return { error: 'No AI provider configured' };

    const profile = await getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE);
    if (!profile) return { error: 'No user profile found' };

    const resumeText = await getStorage<string>(STORAGE_KEYS.RESUME_TEXT);
    const skillsMap = await getStorage<Record<string, number>>(STORAGE_KEYS.USER_SKILLS_MAP);

    const result = await aiTailorResume(
      aiClient, profile, payload.jobDescription, null,
      resumeText || undefined, skillsMap || undefined
    );

    clearRateLimit();
    return { success: true, result };
  } catch (error: any) {
    if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE')) {
      handleRateLimitError(error);
      return { error: 'AI quota exceeded — will retry after cooldown' };
    }
    log.error('AI tailor resume failed in service worker', error);
    return { error: error.message || 'AI tailor failed' };
  }
}

async function handleAICoverLetter(payload: any): Promise<any> {
  const rateLimitMsg = checkRateLimit();
  if (rateLimitMsg) return { error: rateLimitMsg };

  try {
    const aiClient = await getOrCreateAIClient();
    if (!aiClient) return { error: 'No AI provider configured' };

    const profile = await getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE);
    if (!profile) return { error: 'No user profile found' };

    const result = await aiGenerateCoverLetter(
      aiClient, profile,
      payload.jobTitle || 'Software Engineer',
      payload.company || 'Unknown Company',
      payload.jobDescription || ''
    );

    clearRateLimit();
    return { success: true, result };
  } catch (error: any) {
    if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE') || error.message?.includes('daily quota')) {
      handleRateLimitError(error);
      return { error: 'AI quota exceeded — will retry after cooldown' };
    }
    log.error('AI cover letter failed in service worker', error);
    return { error: error.message || 'AI cover letter failed' };
  }
}

async function handleAIStandOutTips(payload: any): Promise<any> {
  const rateLimitMsg = checkRateLimit();
  if (rateLimitMsg) return { error: rateLimitMsg };

  try {
    const aiClient = await getOrCreateAIClient();
    if (!aiClient) return { error: 'No AI provider configured' };

    const profile = await getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE);
    if (!profile) return { error: 'No user profile found' };

    const result = await aiGenerateStandOutTips(
      aiClient, profile,
      payload.jobTitle || 'Software Engineer',
      payload.company || 'Unknown Company',
      payload.jobDescription || ''
    );

    clearRateLimit();
    return { success: true, result };
  } catch (error: any) {
    if (error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED') || error.message?.includes('503') || error.message?.includes('UNAVAILABLE') || error.message?.includes('daily quota')) {
      handleRateLimitError(error);
      return { error: 'AI quota exceeded — will retry after cooldown' };
    }
    log.error('AI stand-out tips failed in service worker', error);
    return { error: error.message || 'AI stand-out tips failed' };
  }
}
