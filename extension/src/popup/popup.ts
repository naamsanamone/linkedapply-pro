/* ============================================================
   LinkedApply Pro — Popup Controller
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { BotStatus, SessionSummary, ExtensionMessage } from '../shared/types';

const log = createLogger('Popup');

// ---- DOM References ----
const statusDot = document.getElementById('status-dot') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const progressBar = document.getElementById('progress-bar') as HTMLElement;
const dashboardBtn = document.getElementById('dashboard-btn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;

// Stat elements
const statApplied = document.getElementById('stat-applied') as HTMLElement;
const statTailored = document.getElementById('stat-tailored') as HTMLElement;
const statSkipped = document.getElementById('stat-skipped') as HTMLElement;
const statTime = document.getElementById('stat-time') as HTMLElement;

// ---- State ----
let currentStatus: BotStatus = 'idle';

// ---- Initialize ----
async function init(): Promise<void> {
  log.info('Popup opened');

  // Load current state
  const [status, session] = await Promise.all([
    getStorage<BotStatus>(STORAGE_KEYS.BOT_STATUS),
    getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY),
  ]);

  if (status) updateStatusUI(status);
  if (session) updateStatsUI(session);

  // Set up event listeners
  startBtn.addEventListener('click', handleStartStop);
  dashboardBtn.addEventListener('click', openDashboard);
  settingsBtn.addEventListener('click', openSettings);

  const reviewBtn = document.getElementById('review-btn');
  reviewBtn?.addEventListener('click', openDashboard);

  // Listen for status updates from service worker
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'STATUS_UPDATE') {
      if (message.payload?.status) updateStatusUI(message.payload.status);
      if (message.payload.session) {
        updateStatsUI(message.payload.session);
      }
    }
  });
}

// ---- Event Handlers ----
let isHandlingStartStop = false;
async function handleStartStop(): Promise<void> {
  if (isHandlingStartStop) return;
  isHandlingStartStop = true;
  startBtn.setAttribute('disabled', 'true');

  try {
    if (currentStatus === 'idle' || currentStatus === 'stopped' || currentStatus === 'paused') {
      await chrome.runtime.sendMessage({ type: 'START_BOT', timestamp: Date.now() });
      updateStatusUI('searching');
    } else {
      await chrome.runtime.sendMessage({ type: 'STOP_BOT', timestamp: Date.now() });
      updateStatusUI('stopped');
    }
  } catch (err) {
    log.error('Failed to toggle bot', err);
  } finally {
    setTimeout(() => {
      startBtn.removeAttribute('disabled');
      isHandlingStartStop = false;
    }, 600);
  }
}

async function openDashboard(): Promise<void> {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow.id) {
      await chrome.sidePanel.open({ windowId: currentWindow.id });
    }
  } catch (error) {
    log.error('Failed to open sidePanel directly from popup', error);
    // Fallback: tell service worker to try
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL', timestamp: Date.now() });
  }
  window.close();
}

function openSettings(): void {
  chrome.runtime.openOptionsPage();
  window.close();
}

// ---- UI Updates ----
function updateStatusUI(status: BotStatus): void {
  currentStatus = status;

  // Update status dot
  statusDot.className = 'status-dot';
  switch (status) {
    case 'searching':
    case 'filtering':
    case 'applying':
    case 'reviewing':
      statusDot.classList.add('status-dot--active');
      startBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Stop`;
      progressBar.style.display = 'block';
      document.getElementById('popup-root')?.classList.add('popup--running');
      break;
    case 'paused':
      statusDot.classList.add('status-dot--idle');
      startBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Resume`;
      break;
    case 'error':
      statusDot.classList.add('status-dot--error');
      startBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Retry`;
      break;
    default:
      statusDot.classList.add('status-dot--idle');
      startBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Start`;
      progressBar.style.display = 'none';
      document.getElementById('popup-root')?.classList.remove('popup--running');
  }

  // Update status text
  const statusLabels: Record<BotStatus, string> = {
    idle: 'Ready to start',
    searching: 'Searching jobs...',
    filtering: 'Applying filters...',
    applying: 'Applying to job...',
    reviewing: 'Reviewing job...',
    paused: 'Paused',
    error: 'Error occurred',
    stopped: 'Stopped',
  };
  statusText.textContent = statusLabels[status] || 'Unknown';

  // Show/hide review button
  const reviewBtn = document.getElementById('review-btn');
  if (reviewBtn) reviewBtn.style.display = status === 'reviewing' ? 'block' : 'none';
}

function updateStatsUI(session: SessionSummary): void {
  statApplied.textContent = String(session.easyApplied);
  statTailored.textContent = String((session as any).tailoredCount || 0);
  statSkipped.textContent = String(session.skipped);

  // Format time saved
  const minutes = Math.round(session.estimatedTimeSaved / 60);
  statTime.textContent = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
}

// ---- Helpers ----
function sendMessage(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message);
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);
