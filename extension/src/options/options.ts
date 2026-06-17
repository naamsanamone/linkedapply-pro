/* ============================================================
   LinkedApply Pro — Options Page Controller (Phase 4)
   Full settings management: Profile, Questions, Search,
   AI, Bot Settings — all with load/save to chrome.storage
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
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
  setVal('s-companies', (prefs.companies || []).join(', '));

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
    goodWords: [],
    aboutCompanyBadWords: [],
    aboutCompanyGoodWords: [],
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
  gemini: 'gemini-1.5-flash',
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

  // Search
  document.getElementById('save-search')?.addEventListener('click', saveSearch);
  await loadSearch();

  // AI
  document.getElementById('save-ai')?.addEventListener('click', saveAI);
  document.getElementById('test-ai')?.addEventListener('click', testAIConnection);
  initAIProviderSync();
  await loadAI();

  // Bot
  document.getElementById('save-bot')?.addEventListener('click', saveBot);
  initBotSpeedToggle();
  await loadBot();
});
