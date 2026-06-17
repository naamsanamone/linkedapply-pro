/* ============================================================
   LinkedApply Pro — Popup Controller
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { BotStatus, SessionSummary, Subscription, ExtensionMessage } from '../shared/types';

const log = createLogger('Popup');

// ---- DOM References ----
const statusDot = document.getElementById('status-dot') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const progressBar = document.getElementById('progress-bar') as HTMLElement;
const dashboardBtn = document.getElementById('dashboard-btn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const upgradeBtn = document.getElementById('upgrade-btn') as HTMLButtonElement;
const upgradeCta = document.getElementById('upgrade-cta') as HTMLElement;
const planBadge = document.getElementById('plan-badge') as HTMLElement;

// Stat elements
const statApplied = document.getElementById('stat-applied') as HTMLElement;
const statExternal = document.getElementById('stat-external') as HTMLElement;
const statSkipped = document.getElementById('stat-skipped') as HTMLElement;
const statTime = document.getElementById('stat-time') as HTMLElement;

// ---- State ----
let currentStatus: BotStatus = 'idle';

// ---- Initialize ----
async function init(): Promise<void> {
  log.info('Popup opened');

  // Load current state
  const [status, session, subscription] = await Promise.all([
    getStorage<BotStatus>(STORAGE_KEYS.BOT_STATUS),
    getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY),
    getStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTION),
  ]);

  if (status) updateStatusUI(status);
  if (session) updateStatsUI(session);
  if (subscription) updatePlanUI(subscription);

  // Set up event listeners
  startBtn.addEventListener('click', handleStartStop);
  dashboardBtn.addEventListener('click', openDashboard);
  settingsBtn.addEventListener('click', openSettings);
  upgradeBtn.addEventListener('click', openUpgrade);

  // Listen for status updates from service worker
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === 'STATUS_UPDATE') {
      updateStatusUI(message.payload.status);
      if (message.payload.session) {
        updateStatsUI(message.payload.session);
      }
    }
  });
}

// ---- Event Handlers ----
function handleStartStop(): void {
  if (currentStatus === 'idle' || currentStatus === 'stopped' || currentStatus === 'paused') {
    sendMessage({ type: 'START_BOT', timestamp: Date.now() });
    updateStatusUI('searching');
  } else {
    sendMessage({ type: 'STOP_BOT', timestamp: Date.now() });
    updateStatusUI('stopped');
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

function openUpgrade(): void {
  // Open the ShipFast landing page pricing section
  chrome.tabs.create({ url: `${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'}/#pricing` });
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
    paused: 'Paused',
    error: 'Error occurred',
    stopped: 'Stopped',
  };
  statusText.textContent = statusLabels[status] || 'Unknown';
}

function updateStatsUI(session: SessionSummary): void {
  statApplied.textContent = String(session.easyApplied);
  statExternal.textContent = String(session.externalCollected);
  statSkipped.textContent = String(session.skipped);

  // Format time saved
  const minutes = Math.round(session.estimatedTimeSaved / 60);
  statTime.textContent = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
}

function updatePlanUI(subscription: Subscription): void {
  const badgeEl = planBadge.querySelector('.badge') as HTMLElement;
  if (!badgeEl) return;

  if (subscription.plan === 'free_trial') {
    badgeEl.className = 'badge badge-primary';
    badgeEl.textContent = subscription.trialDaysRemaining
      ? `Trial: ${subscription.trialDaysRemaining}d left`
      : 'Free Trial';
    upgradeCta.style.display = 'flex';
  } else {
    badgeEl.className = 'badge badge-pro';
    const planNames: Record<string, string> = {
      day: 'Day Pass', week: 'Weekly', month: 'Monthly',
      year: 'Yearly', lifetime: '♾️ Lifetime',
    };
    badgeEl.textContent = planNames[subscription.plan] || 'Pro';
    upgradeCta.style.display = 'none';
  }
}

// ---- Helpers ----
function sendMessage(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message);
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);
