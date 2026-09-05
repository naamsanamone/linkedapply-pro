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
  CustomQAPair,
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
// ---- Custom Q&A Helpers ----
function addQARow(question = '', answer = ''): void {
  const list = document.getElementById('custom-qa-list');
  if (!list) return;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center;';
  row.innerHTML = `
    <input class="input qa-question" type="text" placeholder="Question keyword (e.g. github)" value="${escAttr(question)}" style="flex:1;">
    <input class="input qa-answer" type="text" placeholder="Your answer" value="${escAttr(answer)}" style="flex:1;">
    <button class="btn btn-ghost btn-sm qa-remove" title="Remove" style="padding:4px 8px;">🗑️</button>
  `;
  row.querySelector('.qa-remove')?.addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function getCustomQA(): CustomQAPair[] {
  const rows = document.querySelectorAll('#custom-qa-list > div');
  const pairs: CustomQAPair[] = [];
  rows.forEach((row) => {
    const q = (row.querySelector('.qa-question') as HTMLInputElement)?.value.trim();
    const a = (row.querySelector('.qa-answer') as HTMLInputElement)?.value.trim();
    if (q && a) pairs.push({ question: q, answer: a });
  });
  return pairs;
}

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

  // Load custom Q&A pairs
  const customQA = await getStorage<CustomQAPair[]>(STORAGE_KEYS.CUSTOM_QA) || [];
  customQA.forEach((pair) => addQARow(pair.question, pair.answer));

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

  // Save custom Q&A pairs
  const customQA = getCustomQA();
  await setStorage(STORAGE_KEYS.CUSTOM_QA, customQA);

  showStatus('questions-status', `✓ Question defaults saved! (${customQA.length} custom Q&A)`);
  log.info(`Question defaults saved with ${customQA.length} custom Q&A pairs`);
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
  if (!config) {
    // First-time user: trigger provider sync to populate default model/URL
    const providerSelect = document.getElementById('ai-provider') as HTMLSelectElement | null;
    if (providerSelect) {
      providerSelect.dispatchEvent(new Event('change'));
    }
    return;
  }

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
  setChecked('b-useTailoredResume', settings.useTailoredResume ?? false);

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

  // Load pre-apply review settings
  const paSettings = await getStorage<{ enabled: boolean; timeoutSeconds: number; defaultAction: string }>(STORAGE_KEYS.PRE_APPLY_SETTINGS);
  if (paSettings) {
    setChecked('pa-enabled', paSettings.enabled);
    setVal('pa-timeout', String(paSettings.timeoutSeconds));
    setVal('pa-default-action', paSettings.defaultAction);
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
    useTailoredResume: getChecked('b-useTailoredResume'),
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

  // Save pre-apply review settings
  const preApplySettings = {
    enabled: getChecked('pa-enabled'),
    timeoutSeconds: parseInt(getVal('pa-timeout')) || 30,
    defaultAction: getVal('pa-default-action') || 'apply',
  };
  await setStorage(STORAGE_KEYS.PRE_APPLY_SETTINGS, preApplySettings);

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
  document.getElementById('add-qa-btn')?.addEventListener('click', () => addQARow());
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
      await chrome.storage.local.remove(STORAGE_KEYS.RESUME_STRUCTURED); // re-parse on next tailor
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
  await loadAI();
  await loadUsageDashboard();

  // Resume
  initResume();
  await loadResume();

  // Bot
  document.getElementById('save-bot')?.addEventListener('click', saveBot);
  initBotSpeedToggle();
  await loadBot();

  // Account
  initAccountPage();
  await loadStorageInfo();

  // Onboarding (show if first run)
  await checkOnboarding();
});

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

    if (typeof pendingImportData !== 'object' || pendingImportData === null || Array.isArray(pendingImportData)) {
      alert('Invalid import file: expected a JSON object.');
      return;
    }

    if (Array.isArray(pendingImportData.jobs) && !('applied_jobs' in pendingImportData)) {
      pendingImportData['applied_jobs'] = pendingImportData.jobs;
      delete pendingImportData.jobs;
      delete pendingImportData.exportedAt;
      delete pendingImportData.totalJobs;
    }

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

// ---- Resume Upload/Paste ----
function initResume(): void {
  const textarea = document.getElementById('resume-text') as HTMLTextAreaElement;
  const charCount = document.getElementById('resume-char-count');
  const saveStatus = document.getElementById('resume-save-status');

  // Character counter
  textarea?.addEventListener('input', () => {
    if (charCount) charCount.textContent = `${textarea.value.length} characters`;
  });

  // Save resume
  document.getElementById('save-resume')?.addEventListener('click', async () => {
    const text = textarea?.value?.trim() || '';
    if (!text) {
      if (saveStatus) saveStatus.textContent = 'Nothing to save';
      return;
    }
    await setStorage(STORAGE_KEYS.RESUME_TEXT, text);
    if (saveStatus) {
      saveStatus.textContent = `\u2713 Saved (${text.length} chars)`;
      saveStatus.style.color = 'var(--color-success)';
      setTimeout(() => saveStatus.textContent = '', 3000);
    }
  });

  // Clear resume
  document.getElementById('clear-resume')?.addEventListener('click', async () => {
    if (!confirm('Clear your saved resume?')) return;
    if (textarea) textarea.value = '';
    if (charCount) charCount.textContent = '0 characters';
    await chrome.storage.local.remove(STORAGE_KEYS.RESUME_TEXT);
    if (saveStatus) {
      saveStatus.textContent = 'Cleared';
      setTimeout(() => saveStatus.textContent = '', 2000);
    }
  });

  // PDF upload
  const fileInput = document.getElementById('resume-file-input') as HTMLInputElement;
  const fileName = document.getElementById('resume-file-name');

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (fileName) fileName.textContent = file.name;

    if (file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (textarea) {
          textarea.value = reader.result as string;
          if (charCount) charCount.textContent = `${textarea.value.length} characters`;
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.pdf')) {
      // Read PDF as text (basic extraction)
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = extractTextFromPdfArrayBuffer(reader.result as ArrayBuffer);
          if (textarea) {
            textarea.value = text;
            if (charCount) charCount.textContent = `${text.length} characters`;
          }
        } catch {
          if (fileName) fileName.textContent = 'PDF parse failed — try pasting text instead';
        }
      };
      reader.readAsArrayBuffer(file);
    }
  });
}

async function loadResume(): Promise<void> {
  const text = await getStorage<string>(STORAGE_KEYS.RESUME_TEXT);
  const textarea = document.getElementById('resume-text') as HTMLTextAreaElement;
  const charCount = document.getElementById('resume-char-count');
  if (text && textarea) {
    textarea.value = text;
    if (charCount) charCount.textContent = `${text.length} characters`;
  }
}

// Simple PDF text extraction (best-effort from raw PDF stream)
function extractTextFromPdfArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const raw = new TextDecoder('latin1').decode(bytes);
  // Extract text between BT...ET blocks
  const textBlocks: string[] = [];
  const btRegex = /BT[\s\S]*?ET/g;
  let match;
  while ((match = btRegex.exec(raw)) !== null) {
    const block = match[0];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*?)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textBlocks.push(tjMatch[1]);
    }
    const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
    let tjArrMatch;
    while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = tjArrMatch[1];
      const parts = inner.match(/\(([^)]*?)\)/g);
      if (parts) {
        textBlocks.push(parts.map(p => p.slice(1, -1)).join(''));
      }
    }
  }
  const text = textBlocks.join('\n').replace(/\\n/g, '\n').replace(/\\r/g, '').trim();
  if (!text) throw new Error('No text found');
  return text;
}

// ---- Onboarding Wizard ----
async function checkOnboarding(): Promise<void> {
  const done = await getStorage<boolean>(STORAGE_KEYS.ONBOARDING_COMPLETE);
  if (done) return;
  showOnboardingWizard();
}

function showOnboardingWizard(): void {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  let currentStep = 0;
  const totalSteps = 4;

  function goToStep(step: number): void {
    // Hide all steps
    for (let i = 0; i < totalSteps; i++) {
      const el = document.getElementById(`ob-step-${i}`);
      if (el) el.style.display = i === step ? 'block' : 'none';
    }
    // Update dots
    document.querySelectorAll('.onboarding__dot').forEach((dot, i) => {
      dot.classList.remove('onboarding__dot--active', 'onboarding__dot--done');
      if (i === step) dot.classList.add('onboarding__dot--active');
      else if (i < step) dot.classList.add('onboarding__dot--done');
    });
    currentStep = step;
  }

  async function finishOnboarding(): Promise<void> {
    await setStorage(STORAGE_KEYS.ONBOARDING_COMPLETE, true);
    overlay!.style.display = 'none';
    // Reload settings so main page reflects what was saved
    await loadResume();
    log.info('Onboarding complete');
  }

  // Step 0: Welcome
  document.getElementById('ob-start')?.addEventListener('click', () => goToStep(1));
  document.getElementById('ob-skip')?.addEventListener('click', finishOnboarding);

  // Step 1: Resume
  const obResume = document.getElementById('ob-resume') as HTMLTextAreaElement;
  const obResumeCount = document.getElementById('ob-resume-count');
  obResume?.addEventListener('input', () => {
    if (obResumeCount) obResumeCount.textContent = `${obResume.value.length} characters`;
  });
  document.getElementById('ob-resume-next')?.addEventListener('click', async () => {
    const text = obResume?.value?.trim();
    if (text) {
      await setStorage(STORAGE_KEYS.RESUME_TEXT, text);
      // Also populate the resume textarea on the profile page
      const mainTextarea = document.getElementById('resume-text') as HTMLTextAreaElement;
      if (mainTextarea) mainTextarea.value = text;
    }
    goToStep(2);
  });
  document.getElementById('ob-resume-skip')?.addEventListener('click', () => goToStep(2));

  // Step 2: AI Provider
  document.getElementById('ob-ai-next')?.addEventListener('click', async () => {
    const provider = (document.getElementById('ob-ai-provider') as HTMLSelectElement)?.value || 'gemini';
    const apiKey = (document.getElementById('ob-ai-key') as HTMLInputElement)?.value?.trim();
    if (apiKey) {
      const config: AIConfig = {
        provider: provider as any,
        model: DEFAULT_MODELS[provider] || 'gemini-2.5-flash',
        apiUrl: DEFAULT_API_URLS[provider] || '',
        apiKey,
        streaming: false,
      };
      await setStorage(STORAGE_KEYS.AI_CONFIG, config);
      // Populate AI settings fields on the main page
      setVal('ai-provider', config.provider);
      setVal('ai-apiUrl', config.apiUrl);
      setVal('ai-model', config.model);
      setVal('ai-apiKey', config.apiKey);
    }
    goToStep(3);
  });
  document.getElementById('ob-ai-skip')?.addEventListener('click', () => goToStep(3));

  // Step 3: Search + Finish
  document.getElementById('ob-finish')?.addEventListener('click', async () => {
    const keywords = (document.getElementById('ob-search-keywords') as HTMLInputElement)?.value?.trim();
    const location = (document.getElementById('ob-search-location') as HTMLInputElement)?.value?.trim();
    if (keywords || location) {
      // Load existing search prefs and merge
      const existing = await getStorage<SearchPreferences>(STORAGE_KEYS.SEARCH_PREFS) || {} as SearchPreferences;
      if (keywords) {
        existing.searchTerms = keywords.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (location) {
        existing.searchLocation = location;
      }
      await setStorage(STORAGE_KEYS.SEARCH_PREFS, existing);
      // Populate search fields on main page
      if (keywords) setVal('s-searchTerms', (existing.searchTerms || []).join('\n'));
      if (location) setVal('s-searchLocation', location);
    }
    await finishOnboarding();
  });
}
