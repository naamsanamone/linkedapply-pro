/* ============================================================
   LinkedApply Pro — Background Service Worker
   Event-driven orchestrator (Manifest V3)
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS, DEFAULT_SESSION } from '../shared/constants';
import type { BotStatus, SessionSummary, ExtensionMessage } from '../shared/types';

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

      case 'GET_STATUS':
        getStatus().then(sendResponse);
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
}

// ---- Event Handlers ----
async function handleStatusUpdate(payload: any): Promise<void> {
  if (payload?.status) {
    await setStorage(STORAGE_KEYS.BOT_STATUS, payload.status);
  }
  broadcastUpdate();
}

async function handleJobApplied(payload: any): Promise<void> {
  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY) || { ...DEFAULT_SESSION };
  session.easyApplied += 1;
  session.estimatedTimeSaved += 80; // 80 seconds per easy apply
  await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);

  log.info(`Job applied! Total: ${session.easyApplied}`);
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
        chrome.tabs.sendMessage(tab.id, message);
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
