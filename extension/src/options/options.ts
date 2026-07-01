/* ============================================================
   LinkedApply Pro — Options Page Controller (Phase 4)
   Full settings management: Profile, Questions, Search,
   AI, Bot Settings — all with load/save to chrome.storage
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { estimateCost } from '../services/usage-tracker';
import {
  STORAGE_KEYS,
  DEFAULT_PROFILE,
  DEFAULT_SEARCH_PREFS,
  DEFAULT_BOT_SETTINGS,
} from '../shared/constants';
import type {
  UserProfile,
  QuestionDefaults,
  SearchPreferences,
  AIConfig,
  BotSettings,
} from '../shared/types';
import { extractTextFromPDF } from '../services/resume-parser';

const log = createLogger('Options');

// ================================================
//  PAGE NAVIGATION
// ================================================
function initNavigation(): void {
  const navItems = document.querySelectorAll<HTMLElement>('.options__nav-item');
  const pages = document.querySelectorAll<HTMLElement>('.options__page');

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const targetPage = item.dataset.page;
      if (!targetPage) return;

      navItems.forEach((n) => n.classList.remove('options__nav-item--active'));
      item.classList.add('options__nav-item--active');

      pages.forEach((page) => {
        page.style.display = page.id === `page-${targetPage}` ? 'block' : 'none';
      });

      log.info(`Navigated to: ${targetPage}`);
    });
  });
}

// ================================================
//  PROFILE
// ================================================
const profileFields = [
  'firstName', 'middleName', 'lastName', 'email', 'phoneNumber',
  'phoneCountryCode', 'currentCity', 'street', 'state', 'zipcode', 'country',
  'gender', 'ethnicity', 'veteranStatus', 'disabilityStatus', 'highestEducation',
] as const;

async function loadProfile(): Promise<void> {
  const profile = await getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE) || DEFAULT_PROFILE;
  profileFields.forEach((field) => {
    const el = document.getElementById(field) as HTMLInputElement | HTMLSelectElement;
    if (el && (profile as any)[field] !== undefined) {
      el.value = String((profile as any)[field]);
    }
  });
  log.info('Profile loaded');
}

async function saveProfile(): Promise<void> {
  const profile: Record<string, string> = {};
  profileFields.forEach((field) => {
    const el = document.getElementById(field) as HTMLInputElement | HTMLSelectElement;
    if (el) profile[field] = el.value;
  });
  await setStorage(STORAGE_KEYS.USER_PROFILE, profile);
  showStatus('profile-status', '✓ Profile saved!');
  log.info('Profile saved');
}

// ================================================
//  QUESTION DEFAULTS
// ================================================
async function loadQuestions(): Promise<void> {
  const defaults = await getStorage<QuestionDefaults>(STORAGE_KEYS.QUESTION_DEFAULTS);
  if (!defaults) return;

  setVal('q-yearsExperience', defaults.yearsOfExperience);
  setVal('q-desiredSalary', String(defaults.desiredSalary || ''));
  setVal('q-requireVisa', defaults.requireVisa);
  setVal('q-usCitizenship', defaults.usCitizenship);
  setVal('q-noticePeriod', String(defaults.noticePeriod || ''));
  setVal('q-currentCtc', String(defaults.currentCtc || ''));
  setVal('q-linkedin', defaults.linkedIn);
  setVal('q-website', defaults.website);
  setVal('q-recentEmployer', defaults.recentEmployer);
  setVal('q-confidenceLevel', defaults.confidenceLevel);
  setVal('q-linkedinHeadline', defaults.linkedinHeadline);
  setVal('q-coverLetter', defaults.coverLetter);
  setChecked('q-overwrite', defaults.overwritePreviousAnswers);
  setChecked('q-pauseBeforeSubmit', defaults.pauseBeforeSubmit);

  // Load skills map
  const skillsMap = await getStorage<Record<string, number>>(STORAGE_KEYS.USER_SKILLS_MAP) || {};
  const skillsText = Object.entries(skillsMap).map(([k, v]) => `${k}=${v}`).join('\n');
  setVal('q-skillsMap', skillsText);

  log.info('Question defaults loaded');
}

async function saveQuestions(): Promise<void> {
  const defaults: QuestionDefaults = {
    defaultResumePath: '',
    yearsOfExperience: getVal('q-yearsExperience') || '3',
    requireVisa: getVal('q-requireVisa') as 'Yes' | 'No',
    website: getVal('q-website'),
    linkedIn: getVal('q-linkedin'),
    desiredSalary: parseInt(getVal('q-desiredSalary')) || 0,
    usCitizenship: getVal('q-usCitizenship'),
    linkedinHeadline: getVal('q-linkedinHeadline'),
    noticePeriod: parseInt(getVal('q-noticePeriod')) || 0,
    currentCtc: parseInt(getVal('q-currentCtc')) || 0,
    linkedinSummary: '',
    coverLetter: getVal('q-coverLetter'),
    recentEmployer: getVal('q-recentEmployer'),
    confidenceLevel: getVal('q-confidenceLevel') || '8',
    pauseBeforeSubmit: getChecked('q-pauseBeforeSubmit'),
    pauseAtFailedQuestion: false,
    overwritePreviousAnswers: getChecked('q-overwrite'),
  };

  await setStorage(STORAGE_KEYS.QUESTION_DEFAULTS, defaults);

  // Save skills map
  const skillsText = getVal('q-skillsMap');
  const skillsMap: Record<string, number> = {};
  for (const line of skillsText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const [skill, years] = trimmed.split('=');
    skillsMap[skill.trim().toLowerCase()] = parseInt(years.trim()) || 0;
  }
  await setStorage(STORAGE_KEYS.USER_SKILLS_MAP, skillsMap);

  showStatus('questions-status', '✓ Question defaults saved!');
  log.info('Question defaults saved');
}

// ================================================
//  SEARCH PREFERENCES
// ================================================
async function loadSearch(): Promise<void> {
  const prefs = await getStorage<SearchPreferences>(STORAGE_KEYS.SEARCH_PREFS) || DEFAULT_SEARCH_PREFS;

  setVal('s-searchTerms', (prefs.searchTerms || []).join('\n'));
  setVal('s-searchLocation', prefs.searchLocation);
  setVal('s-sortBy', prefs.sortBy);
  setVal('s-datePosted', prefs.datePosted);
  setVal('s-currentExperience', String(prefs.currentExperience || ''));
  setChecked('s-easyApplyOnly', prefs.easyApplyOnly);
  setChecked('s-securityClearance', prefs.securityClearance);
  setChecked('s-didMasters', prefs.didMasters);
  setVal('s-badWords', (prefs.badWords || []).join(', '));
  setVal('s-goodWords', (prefs.goodWords || []).join(', '));
  setVal('s-companies', (prefs.companies || []).join(', '));
  setVal('s-aboutBadWords', (prefs.aboutCompanyBadWords || []).join(', '));
  setVal('s-aboutGoodWords', (prefs.aboutCompanyGoodWords || []).join(', '));

  log.info('Search preferences loaded');
}

async function saveSearch(): Promise<void> {
  const prefs: SearchPreferences = {
    searchTerms: getVal('s-searchTerms').split('\n').map((s) => s.trim()).filter(Boolean),
    searchLocation: getVal('s-searchLocation'),
    sortBy: getVal('s-sortBy') as SearchPreferences['sortBy'],
    datePosted: getVal('s-datePosted') as SearchPreferences['datePosted'],
    easyApplyOnly: getChecked('s-easyApplyOnly'),
    experienceLevel: [],
    jobType: [],
    onSite: [],
    salary: '',
    companies: csvToArray(getVal('s-companies')),
    industry: [],
    badWords: csvToArray(getVal('s-badWords')),
    goodWords: csvToArray(getVal('s-goodWords')),
    aboutCompanyBadWords: csvToArray(getVal('s-aboutBadWords')),
    aboutCompanyGoodWords: csvToArray(getVal('s-aboutGoodWords')),
    securityClearance: getChecked('s-securityClearance'),
    didMasters: getChecked('s-didMasters'),
    currentExperience: parseInt(getVal('s-currentExperience')) || 0,
  };

  await setStorage(STORAGE_KEYS.SEARCH_PREFS, prefs);
  showStatus('search-status', '✓ Search preferences saved!');
  log.info('Search preferences saved');
}

// ================================================
//  AI SETTINGS
// ================================================
const DEFAULT_API_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  gemini: '',
  deepseek: 'https://api.deepseek.com/v1',
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
};

async function loadAI(): Promise<void> {
  const config = await getStorage<AIConfig>(STORAGE_KEYS.AI_CONFIG);
  if (!config) return;

  setVal('ai-provider', config.provider);
  setVal('ai-apiUrl', config.apiUrl);
  setVal('ai-apiKey', config.apiKey);
  setVal('ai-model', config.model);
  setChecked('ai-streaming', config.streaming);

  log.info('AI settings loaded');
}

async function saveAI(): Promise<void> {
  const config: AIConfig = {
    provider: getVal('ai-provider') as AIConfig['provider'],
    apiUrl: getVal('ai-apiUrl'),
    apiKey: getVal('ai-apiKey'),
    model: getVal('ai-model'),
    streaming: getChecked('ai-streaming'),
  };

  await setStorage(STORAGE_KEYS.AI_CONFIG, config);
  showStatus('ai-status', '✓ AI settings saved!');
  log.info('AI settings saved');
}

async function testAIConnection(): Promise<void> {
  const statusEl = document.getElementById('ai-status');
  if (statusEl) statusEl.textContent = '⏳ Testing...';

  const config: AIConfig = {
    provider: getVal('ai-provider') as AIConfig['provider'],
    apiUrl: getVal('ai-apiUrl'),
    apiKey: getVal('ai-apiKey'),
    model: getVal('ai-model'),
    streaming: getChecked('ai-streaming'),
  };

  try {
    // Dynamic import to avoid loading AI module on every options page load
    const { createAIProvider } = await import('../services/ai/ai-provider');
    const provider = createAIProvider(config);
    const success = await provider.testConnection();

    if (success) {
      showStatus('ai-status', '✅ Connection successful!');
    } else {
      showStatus('ai-status', '❌ Connection failed. Check your API key and URL.');
    }
  } catch (error) {
    showStatus('ai-status', `❌ Error: ${String(error).substring(0, 60)}`);
    log.error('AI connection test failed', error);
  }
}

function initAIProviderSync(): void {
  const providerSelect = document.getElementById('ai-provider') as HTMLSelectElement;
  providerSelect?.addEventListener('change', () => {
    const provider = providerSelect.value;
    const urlInput = document.getElementById('ai-apiUrl') as HTMLInputElement;
    const modelInput = document.getElementById('ai-model') as HTMLInputElement;

    if (urlInput && !urlInput.value) {
      urlInput.value = DEFAULT_API_URLS[provider] || '';
    }
    if (modelInput && !modelInput.value) {
      modelInput.value = DEFAULT_MODELS[provider] || '';
    }
  });
}

// ================================================
//  BOT SETTINGS
// ================================================
async function loadBot(): Promise<void> {
  const settings = await getStorage<BotSettings>(STORAGE_KEYS.BOT_SETTINGS) || DEFAULT_BOT_SETTINGS;

  setVal('b-speedMode', settings.speedMode);
  setVal('b-clickGap', String(settings.clickGap));
  setVal('b-customMin', String(settings.customMinDelay));
  setVal('b-customMax', String(settings.customMaxDelay));
  setChecked('b-followCompanies', settings.followCompanies);
  setChecked('b-closeTabs', settings.closeTabs);
  setChecked('b-runNonStop', settings.runNonStop);
  setChecked('b-smoothScroll', settings.smoothScroll);

  // Show/hide custom delay row
  updateCustomDelayVisibility(settings.speedMode);

  // Load match filter
  const matchFilter = await getStorage<{ enabled: boolean; top: boolean; high: boolean; medium: boolean; low: boolean }>(STORAGE_KEYS.MATCH_FILTER);
  if (matchFilter) {
    (document.getElementById('b-matchEnabled') as HTMLInputElement).checked = matchFilter.enabled;
    (document.getElementById('b-matchTop') as HTMLInputElement).checked = matchFilter.top;
    (document.getElementById('b-matchHigh') as HTMLInputElement).checked = matchFilter.high;
    (document.getElementById('b-matchMedium') as HTMLInputElement).checked = matchFilter.medium;
    (document.getElementById('b-matchLow') as HTMLInputElement).checked = matchFilter.low;
  }

  log.info('Bot settings loaded');
}

async function saveBot(): Promise<void> {
  const settings: BotSettings = {
    speedMode: getVal('b-speedMode') as BotSettings['speedMode'],
    clickGap: parseInt(getVal('b-clickGap')) || 2000,
    customMinDelay: parseInt(getVal('b-customMin')) || 1000,
    customMaxDelay: parseInt(getVal('b-customMax')) || 3000,
    followCompanies: getChecked('b-followCompanies'),
    closeTabs: getChecked('b-closeTabs'),
    runNonStop: getChecked('b-runNonStop'),
    smoothScroll: getChecked('b-smoothScroll'),
    alternateSortby: false,
    cycleDatePosted: false,
  };

  // Save match filter
  const matchFilterData = {
    enabled: (document.getElementById('b-matchEnabled') as HTMLInputElement)?.checked || false,
    top: (document.getElementById('b-matchTop') as HTMLInputElement)?.checked || false,
    high: (document.getElementById('b-matchHigh') as HTMLInputElement)?.checked || false,
    medium: (document.getElementById('b-matchMedium') as HTMLInputElement)?.checked || false,
    low: (document.getElementById('b-matchLow') as HTMLInputElement)?.checked || false,
  };
  await setStorage(STORAGE_KEYS.MATCH_FILTER, matchFilterData);

  await setStorage(STORAGE_KEYS.BOT_SETTINGS, settings);
  showStatus('bot-status', '✓ Bot settings saved!');
  log.info('Bot settings saved');
}

function initBotSpeedToggle(): void {
  const speedSelect = document.getElementById('b-speedMode') as HTMLSelectElement;
  speedSelect?.addEventListener('change', () => {
    updateCustomDelayVisibility(speedSelect.value);
  });
}

function updateCustomDelayVisibility(mode: string): void {
  const customRow = document.getElementById('custom-delay-row');
  if (customRow) {
    customRow.style.display = mode === 'custom' ? 'flex' : 'none';
  }
}

// ================================================
//  FORM HELPERS
// ================================================
function getVal(id: string): string {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  return el?.value || '';
}

function setVal(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (el) el.value = value;
}

function getChecked(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement;
  return el?.checked ?? false;
}

function setChecked(id: string, value: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) el.checked = value;
}

function showStatus(id: string, message: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 3000);
  }
}

function csvToArray(csv: string): string[] {
  return csv.split(',').map((s) => s.trim()).filter(Boolean);
}

// ================================================
//  BOOT
// ================================================
document.addEventListener('DOMContentLoaded', async () => {
  log.info('Options page loaded');

  // Navigation
  initNavigation();

  // Profile
  document.getElementById('save-profile')?.addEventListener('click', saveProfile);
  await loadProfile();

  // Questions
  document.getElementById('save-questions')?.addEventListener('click', saveQuestions);
  await loadQuestions();

  // Resume upload handler
  const resumeUploadEl = document.getElementById('q-resumeUpload') as HTMLInputElement;
  resumeUploadEl?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const statusEl = document.getElementById('q-resumeStatus');
    if (statusEl) statusEl.textContent = 'Parsing resume...';

    try {
      const text = await extractTextFromPDF(file);
      await setStorage(STORAGE_KEYS.RESUME_TEXT, text);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (statusEl) {
        statusEl.textContent = `✓ Resume parsed: ${wordCount} words. JD matching enabled.`;
        statusEl.style.color = 'var(--color-success, #22c55e)';
      }
      log.info(`Resume uploaded and parsed: ${wordCount} words`);
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = `✗ Failed to parse PDF. Ensure it has selectable text.`;
        statusEl.style.color = 'var(--color-error, #ef4444)';
      }
      log.error('Resume upload failed', error);
    }
  });

  // Check if resume already uploaded on load
  getStorage<string>(STORAGE_KEYS.RESUME_TEXT).then((text) => {
    if (text) {
      const statusEl = document.getElementById('q-resumeStatus');
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (statusEl) {
        statusEl.textContent = `✓ Resume loaded: ${wordCount} words. Upload new to replace.`;
        statusEl.style.color = 'var(--color-success, #22c55e)';
      }
    }
  });

  // Search
  document.getElementById('save-search')?.addEventListener('click', saveSearch);
  await loadSearch();

  // AI
  document.getElementById('save-ai')?.addEventListener('click', saveAI);
  document.getElementById('test-ai')?.addEventListener('click', testAIConnection);
  initAIProviderSync();
  initTierSwitcher();
  await loadAI();
  await loadUsageDashboard();

  // Bot
  document.getElementById('save-bot')?.addEventListener('click', saveBot);
  initBotSpeedToggle();
  await loadBot();

  // Billing
  await loadBillingPage();
  initBillingActions();

  // Account
  initAccountPage();
  await loadStorageInfo();
});

// ---- Tier Switcher ----
function initTierSwitcher(): void {
  const byokRadio = document.getElementById('tier-byok') as HTMLInputElement;
  const proRadio = document.getElementById('tier-pro') as HTMLInputElement;
  const byokConfig = document.getElementById('byok-config');
  const proConfig = document.getElementById('pro-config');
  const byokLabel = document.getElementById('tier-byok-label');
  const proLabel = document.getElementById('tier-pro-label');

  const switchTier = () => {
    const isByok = byokRadio?.checked;
    if (byokConfig) byokConfig.style.display = isByok ? 'block' : 'none';
    if (proConfig) proConfig.style.display = isByok ? 'none' : 'block';
    byokLabel?.classList.toggle('tier-option--active', !!isByok);
    proLabel?.classList.toggle('tier-option--active', !isByok);
  };

  byokRadio?.addEventListener('change', switchTier);
  proRadio?.addEventListener('change', switchTier);
  switchTier(); // set initial state

  // Pro activate button
  document.getElementById('activate-pro')?.addEventListener('click', () => {
    const keyEl = document.getElementById('pro-license-key') as HTMLInputElement;
    const statusEl = document.getElementById('pro-status');
    if (keyEl && statusEl) {
      if (keyEl.value.trim().startsWith('LP-')) {
        statusEl.textContent = '✓ License activated (demo mode)';
        statusEl.style.color = 'var(--color-success)';
      } else {
        statusEl.textContent = '✗ Invalid license key';
        statusEl.style.color = 'var(--color-danger)';
      }
    }
  });
}

// ---- Usage Dashboard ----
async function loadUsageDashboard(): Promise<void> {
  try {
    const usage = await chrome.runtime.sendMessage({ type: 'GET_USAGE', timestamp: Date.now() });
    if (usage) {
      const dailyEl = document.getElementById('usage-daily');
      const totalEl = document.getElementById('usage-total');
      const costEl = document.getElementById('usage-cost');
      if (dailyEl) dailyEl.textContent = String(usage.dailyCalls?.count || 0);
      if (totalEl) totalEl.textContent = String(usage.totalCalls || 0);
      if (costEl) costEl.textContent = estimateCost(usage.dailyCalls?.count || 0);
    }
  } catch (e) {
    log.warn('Failed to load usage dashboard', e);
  }
}

// ---- Billing Page ----
async function loadBillingPage(): Promise<void> {
  try {
    const usage = await chrome.runtime.sendMessage({ type: 'GET_USAGE', timestamp: Date.now() });
    if (usage) {
      const daily = usage.dailyCalls?.count || 0;
      const total = usage.totalCalls || 0;
      const setText = (id: string, t: string) => {
        const el = document.getElementById(id);
        if (el) el.textContent = t;
      };
      setText('billing-daily', String(daily));
      setText('billing-total', String(total));
      setText('billing-cost', estimateCost(daily));

      // Update plan badge
      const tier = usage.tier || 'byok';
      setText('billing-plan-badge', tier === 'pro' ? 'Pro' : 'BYOK (Free)');
      setText('billing-plan-status',
        tier === 'pro' ? 'Active — Hosted API' : 'Active — Using your own API key'
      );
    }
  } catch (e) {
    log.warn('Failed to load billing data', e);
  }
}

function initBillingActions(): void {
  // Plan select buttons → open pricing page
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
  document.querySelectorAll('.billing__select-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = (btn as HTMLElement).dataset.plan;
      chrome.tabs.create({ url: `${backendUrl}/#pricing` });
      log.info(`Plan selected: ${plan}`);
    });
  });

  // Upgrade button
  const upgradeBtn = document.getElementById('billing-upgrade-btn') as HTMLAnchorElement;
  if (upgradeBtn) {
    upgradeBtn.href = `${backendUrl}/#pricing`;
  }

  // BYOK → AI Settings link
  document.getElementById('billing-goto-ai')?.addEventListener('click', (e) => {
    e.preventDefault();
    // Switch to AI page
    const aiNav = document.querySelector('[data-page="ai"]') as HTMLElement;
    if (aiNav) aiNav.click();
  });
}

// ---- Account Page ----
function initAccountPage(): void {
  // Export JSON
  document.getElementById('export-json-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('export-status');
    try {
      const allData = await chrome.storage.local.get(null);
      const json = JSON.stringify(allData, null, 2);
      downloadBlob(json, `linkedapply-backup-${dateSlug()}.json`, 'application/json');
      if (statusEl) { statusEl.textContent = '✓ Exported'; setTimeout(() => statusEl.textContent = '', 3000); }
    } catch (e) {
      if (statusEl) statusEl.textContent = '✗ Export failed';
    }
  });

  // Export CSV (jobs only)
  document.getElementById('export-csv-btn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('export-status');
    try {
      const jobs = await getStorage<any[]>(STORAGE_KEYS.APPLIED_JOBS) || [];
      const headers = ['Job ID','Title','Company','Location','Work Style','Status','Date Applied','Match Score','Job Link'];
      const rows = jobs.map(j => [
        j.id, j.title, j.company, j.location, j.workStyle, j.status,
        j.dateApplied, j.matchScore ?? '', j.jobLink
      ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      downloadBlob(csv, `linkedapply-jobs-${dateSlug()}.csv`, 'text/csv');
      if (statusEl) { statusEl.textContent = `✓ Exported ${jobs.length} jobs`; setTimeout(() => statusEl.textContent = '', 3000); }
    } catch (e) {
      if (statusEl) statusEl.textContent = '✗ Export failed';
    }
  });

  // Import file picker
  let pendingImportData: Record<string, any> | null = null;
  const fileInput = document.getElementById('import-file-input') as HTMLInputElement;
  const importBtn = document.getElementById('import-btn') as HTMLButtonElement;
  const fileNameEl = document.getElementById('import-file-name');

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (fileNameEl) fileNameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        pendingImportData = JSON.parse(reader.result as string);
        if (importBtn) importBtn.disabled = false;
      } catch {
        if (fileNameEl) fileNameEl.textContent = 'Invalid JSON file';
        pendingImportData = null;
      }
    };
    reader.readAsText(file);
  });

  importBtn?.addEventListener('click', async () => {
    const statusEl = document.getElementById('import-status');
    if (!pendingImportData) return;
    try {
      await chrome.storage.local.set(pendingImportData);
      if (statusEl) { statusEl.textContent = '✓ Data imported — reload to apply'; statusEl.style.color = 'var(--color-success)'; }
      pendingImportData = null;
      if (importBtn) importBtn.disabled = true;
    } catch (e) {
      if (statusEl) { statusEl.textContent = '✗ Import failed'; statusEl.style.color = 'var(--color-danger)'; }
    }
  });

  // Clear jobs
  document.getElementById('clear-jobs-btn')?.addEventListener('click', async () => {
    if (!confirm('Delete all job records? Settings will be kept.')) return;
    await chrome.storage.local.remove([STORAGE_KEYS.APPLIED_JOBS, STORAGE_KEYS.FAILED_JOBS]);
    alert('Job history cleared.');
    await loadStorageInfo();
  });

  // Reset all
  document.getElementById('reset-all-btn')?.addEventListener('click', async () => {
    if (!confirm('⚠️ This will DELETE ALL DATA including your profile, settings, and jobs. Continue?')) return;
    if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
    await chrome.storage.local.clear();
    alert('Extension reset. The page will now reload.');
    location.reload();
  });

  // Version from manifest
  try {
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById('about-version');
    if (versionEl && manifest.version) versionEl.textContent = `v${manifest.version}`;
  } catch { /* ignore */ }
}

async function loadStorageInfo(): Promise<void> {
  try {
    const allData = await chrome.storage.local.get(null);
    const bytes = new Blob([JSON.stringify(allData)]).size;
    const usedEl = document.getElementById('storage-used');
    if (usedEl) {
      usedEl.textContent = bytes > 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${(bytes / 1024).toFixed(1)} KB`;
    }
    const jobs = allData[STORAGE_KEYS.APPLIED_JOBS];
    const jobsEl = document.getElementById('storage-jobs-count');
    if (jobsEl) jobsEl.textContent = Array.isArray(jobs) ? String(jobs.length) : '0';
  } catch { /* ignore */ }
}

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dateSlug(): string {
  return new Date().toISOString().slice(0, 10);
}
