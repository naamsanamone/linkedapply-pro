/* ============================================================
   LinkedApply Pro — Constants & Defaults
   ============================================================ */

// ---- Extension Info ----
export const APP_NAME = 'LinkedApply Pro';
export const APP_VERSION = '1.0.0';

// ---- Backend URLs ----
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
export const API_BASE = `${BACKEND_URL}/api`;

// ---- LinkedIn URLs ----
export const LINKEDIN_BASE = 'https://www.linkedin.com';
export const LINKEDIN_JOBS_URL = `${LINKEDIN_BASE}/jobs/search/`;
export const LINKEDIN_LOGIN_URL = `${LINKEDIN_BASE}/login`;
export const LINKEDIN_FEED_URL = `${LINKEDIN_BASE}/feed/`;

// ---- Plan Limits ----
export const PLAN_LIMITS: Record<string, { dailyApplications: number; searchTerms: number; badWords: number; companies: number }> = {
  free_trial: { dailyApplications: 5, searchTerms: 3, badWords: 3, companies: 5 },
  day: { dailyApplications: -1, searchTerms: -1, badWords: -1, companies: -1 },
  week: { dailyApplications: -1, searchTerms: -1, badWords: -1, companies: -1 },
  month: { dailyApplications: -1, searchTerms: -1, badWords: -1, companies: -1 },
  year: { dailyApplications: -1, searchTerms: -1, badWords: -1, companies: -1 },
  lifetime: { dailyApplications: -1, searchTerms: -1, badWords: -1, companies: -1 },
};

// ---- Premium Features (gated by plan) ----
export const PREMIUM_FEATURES = [
  'ai_answers',
  'ai_resume_tailor',
  'ai_cover_letter',
  'job_match_score',
  'ats_keywords',
  'kanban_board',
  'analytics',
  'export_data',
  'cloud_sync',
  'email_notifications',
  'turbo_speed',
  'unlimited_search_terms',
  'unlimited_blacklist',
  'follow_up_reminders',
] as const;

export type PremiumFeature = typeof PREMIUM_FEATURES[number];

// ---- Bot Timing Defaults ----
export const DEFAULT_CLICK_GAP = 2000;  // ms
export const SPEED_MODES = {
  normal: { min: 2000, max: 5000 },
  turbo: { min: 500, max: 1500 },
  custom: { min: 1000, max: 3000 },
} as const;

// ---- Time Saved Estimates (seconds per action) ----
export const TIME_SAVED = {
  easyApply: 80,
  external: 20,
  skip: 10,
} as const;

// ---- Storage Keys ----
export const STORAGE_KEYS = {
  USER_PROFILE: 'user_profile',
  SEARCH_PREFS: 'search_preferences',
  QUESTION_DEFAULTS: 'question_defaults',
  BOT_SETTINGS: 'bot_settings',
  AI_CONFIG: 'ai_config',
  SESSION_SUMMARY: 'session_summary',
  APPLIED_JOBS: 'applied_jobs',
  FAILED_JOBS: 'failed_jobs',
  BOT_STATUS: 'bot_status',
  SUBSCRIPTION: 'subscription',
  AUTH_TOKEN: 'auth_token',
  THEME: 'theme',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  FOLLOW_UP_REMINDERS: 'follow_up_reminders',
  REMINDER_SETTINGS: 'reminder_settings',
  LAST_SYNC_TIMESTAMP: 'last_sync_timestamp',
  USER_SKILLS_MAP: 'user_skills_map',
  ANSWER_MEMORY: 'answer_memory',
  RESUME_TEXT: 'resume_text',
  MATCH_FILTER: 'match_filter',
} as const;

// ---- Default Values ----
export const DEFAULT_PROFILE = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  phoneCountryCode: 'India (+91)',
  currentCity: '',
  street: '',
  state: '',
  zipcode: '',
  country: '',
  ethnicity: 'Decline',
  gender: '',
  disabilityStatus: 'Decline',
  veteranStatus: 'Decline',
  highestEducation: '',
};

export const DEFAULT_SEARCH_PREFS = {
  searchTerms: [],
  searchLocation: '',
  sortBy: '' as const,
  datePosted: '' as const,
  easyApplyOnly: true,
  experienceLevel: [],
  jobType: [],
  onSite: [],
  salary: '',
  companies: [],
  industry: [],
  badWords: [],
  goodWords: [],
  aboutCompanyBadWords: [],
  aboutCompanyGoodWords: [],
  securityClearance: false,
  didMasters: false,
  currentExperience: 0,
};

export const DEFAULT_BOT_SETTINGS = {
  closeTabs: true,
  followCompanies: false,
  runNonStop: false,
  alternateSortby: false,
  cycleDatePosted: false,
  clickGap: DEFAULT_CLICK_GAP,
  speedMode: 'normal' as const,
  customMinDelay: 1000,
  customMaxDelay: 3000,
  smoothScroll: true,
};

export const DEFAULT_SESSION = {
  totalRuns: 0,
  easyApplied: 0,
  externalCollected: 0,
  failed: 0,
  skipped: 0,
  randomAnswers: 0,
  startTime: '',
  endTime: '',
  estimatedTimeSaved: 0,
  dailyGoal: 25,
};
