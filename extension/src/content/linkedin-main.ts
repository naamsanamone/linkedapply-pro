/* ============================================================
   LinkedApply Pro — LinkedIn Content Script (Entry Point)
   Injected into linkedin.com/* pages.
   Connects the automation engine to the service worker.
   ============================================================ */

import { createLogger } from '../shared/logger';
import type { ExtensionMessage, BotStatus } from '../shared/types';
import {
  startAutomation,
  stopAutomation,
  pauseAutomation,
  resumeAutomation,
  getAutomationState,
  retryJob,
} from './engine/bot-orchestrator';

const log = createLogger('Content');

log.info('LinkedApply Pro content script loaded:', window.location.href);

// ---- LinkedIn Page Detection ----
function detectLinkedInPage(): string {
  const url = window.location.href;
  if (url.includes('/jobs/search')) return 'job_search';
  if (url.includes('/jobs/view')) return 'job_detail';
  if (url.includes('/jobs/collections')) return 'job_collections';
  if (url.includes('/in/')) return 'profile';
  if (url.includes('/feed')) return 'feed';
  return 'other';
}

const pageType = detectLinkedInPage();
log.info(`Page type: ${pageType}`);

// ---- Message Listener ----
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    log.info('Received:', message.type);

    switch (message.type) {
      case 'START_BOT':
        log.info('Starting automation...');
        startAutomation();
        sendResponse({ success: true });
        break;

      case 'STOP_BOT':
        stopAutomation();
        sendResponse({ success: true });
        break;

      case 'PAUSE_BOT':
        pauseAutomation();
        sendResponse({ success: true });
        break;

      case 'RESUME_BOT':
        resumeAutomation();
        sendResponse({ success: true });
        break;

      case 'GET_STATUS':
        const state = getAutomationState();
        const status: BotStatus = state.isPaused ? 'paused'
          : state.isRunning ? 'applying'
          : 'idle';
        sendResponse({ status });
        break;

      case 'RETRY_APPLY':
        log.info('Retrying job application on this page...');
        retryJob();
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }

    return true;
  }
);

// ---- Notify Service Worker ----
chrome.runtime.sendMessage({
  type: 'STATUS_UPDATE',
  payload: { status: 'idle', pageType },
  timestamp: Date.now(),
} as ExtensionMessage).catch(() => {
  // Service worker may not be ready yet
});
