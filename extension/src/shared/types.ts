/* ============================================================
   LinkedApply Pro — TypeScript Interfaces & Types
   ============================================================ */

// ---- Bot States ----
export type BotStatus = 'idle' | 'searching' | 'filtering' | 'applying' | 'paused' | 'error' | 'stopped';

// ---- Plan Types ----
export type PlanType = 'free_trial' | 'day' | 'week' | 'month' | 'year' | 'lifetime';
export type PlanStatus = 'active' | 'expired' | 'canceled' | 'past_due';

export interface Subscription {
  plan: PlanType;
  status: PlanStatus;
  expiresAt: string | null;
  features: string[];
  dailyLimit: number;       // -1 = unlimited
  trialDaysRemaining?: number;
}

// ---- Job Models ----
export interface Job {
  id: string;
  jobId: string;
  title: string;
  company: string;
  location: string;
  workStyle: 'Remote' | 'Hybrid' | 'On-site' | '';
  description: string;
  experienceRequired: string;
  jobLink: string;
  externalLink: string;
  dateApplied: string;
  dateListed: string;
  status: JobStatus;
  matchScore: number | null;
  matchDetails?: MatchDetails | null;
  resumeUsed: string;
  hrName: string;
  hrLink: string;
  questionsAnswered: QuestionAnswer[];
  skillsExtracted: ExtractedSkills | null;
  tailoredResume?: TailoredResumeData | null;
  coverLetter?: CoverLetterData | null;
  standOutTips?: StandOutTips | null;
  notes: string;
}

export interface MatchDetails {
  score: number;
  headline: string;
  recommendation: string;
  shouldApply: boolean;
  strengths: string[];
  gaps: string[];
  requiredQualifications: QualificationMatch[];
  preferredQualifications: QualificationMatch[];
}

export interface QualificationMatch {
  description: string;
  matched: boolean;
  note?: string;
}

export interface CoverLetterData {
  subject: string;
  greeting: string;
  bodyParagraphs: string[];
  closing: string;
  signature: string;
  plainText: string;
  generatedAt: number;
  jobTitle: string;
  company: string;
}

export interface StandOutTips {
  highlightSkills: string[];
  highlightAchievements: string[];
  profileImprovements: string[];
}

export interface TailoredResumeData {
  summary: string;
  skills: string[];
  experience: { title: string; company: string; duration: string; bullets: string[] }[];
  atsScore: number;
  keywordsAdded: string[];
}

export type JobStatus = 'bookmarked' | 'applied' | 'external' | 'interview' | 'offer' | 'rejected' | 'skipped' | 'failed';

export interface FailedJob {
  jobId: string;
  title: string;
  company: string;
  jobLink: string;
  error: string;
  timestamp: string;
}

export interface AnswerMemoryEntry {
  question: string;
  questionKey: string;
  answer: string;
  answeredBy: 'pattern' | 'ai' | 'user';
  usedCount: number;
  lastUsed: string;
}

// ---- Question Answering ----
export interface QuestionAnswer {
  question: string;
  answer: string;
  type: QuestionType;
  answeredBy: 'pattern' | 'ai' | 'random' | 'user';
}

export type QuestionType = 'select' | 'radio' | 'text' | 'textarea' | 'checkbox';

// ---- AI / Skills ----
export interface ExtractedSkills {
  techStack: string[];
  technicalSkills: string[];
  otherSkills: string[];
  requiredSkills: string[];
  niceToHave: string[];
}

export type AIProvider = 'openai' | 'gemini' | 'deepseek';

export interface AIConfig {
  provider: AIProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  streaming: boolean;
}

// ---- User Profile / Config ----
export interface UserProfile {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  phoneCountryCode: string;
  currentCity: string;
  street: string;
  state: string;
  zipcode: string;
  country: string;
  ethnicity: string;
  gender: string;
  disabilityStatus: string;
  veteranStatus: string;
  highestEducation: string;
}

export interface SearchPreferences {
  searchTerms: string[];
  searchLocation: string;
  sortBy: '' | 'Most recent' | 'Most relevant';
  datePosted: '' | 'Any time' | 'Past month' | 'Past week' | 'Past 24 hours';
  easyApplyOnly: boolean;
  experienceLevel: string[];
  jobType: string[];
  onSite: string[];
  salary: string;
  companies: string[];
  industry: string[];
  badWords: string[];
  goodWords: string[];
  aboutCompanyBadWords: string[];
  aboutCompanyGoodWords: string[];
  securityClearance: boolean;
  didMasters: boolean;
  currentExperience: number;
}

export interface QuestionDefaults {
  defaultResumePath: string;
  yearsOfExperience: string;
  requireVisa: 'Yes' | 'No';
  website: string;
  linkedIn: string;
  desiredSalary: number;
  usCitizenship: string;
  linkedinHeadline: string;
  noticePeriod: number;
  currentCtc: number;
  linkedinSummary: string;
  coverLetter: string;
  recentEmployer: string;
  confidenceLevel: string;
  pauseBeforeSubmit: boolean;
  pauseAtFailedQuestion: boolean;
  overwritePreviousAnswers: boolean;
}

export interface BotSettings {
  closeTabs: boolean;
  followCompanies: boolean;
  runNonStop: boolean;
  alternateSortby: boolean;
  cycleDatePosted: boolean;
  clickGap: number;     // milliseconds
  speedMode: 'normal' | 'turbo' | 'custom';
  customMinDelay: number;
  customMaxDelay: number;
  smoothScroll: boolean;
}

// ---- Session Summary ----
export interface SessionSummary {
  totalRuns: number;
  easyApplied: number;
  externalCollected: number;
  failed: number;
  skipped: number;
  randomAnswers: number;
  startTime: string;
  endTime: string;
  estimatedTimeSaved: number; // seconds
  dailyGoal: number;          // user's daily target (0 = no limit)
}

// ---- Message Passing ----
export type MessageType =
  | 'START_BOT'
  | 'STOP_BOT'
  | 'PAUSE_BOT'
  | 'RESUME_BOT'
  | 'GET_STATUS'
  | 'STATUS_UPDATE'
  | 'JOB_APPLIED'
  | 'JOB_FAILED'
  | 'JOB_SKIPPED'
  | 'UPDATE_SETTINGS'
  | 'OPEN_SIDEPANEL'
  | 'PAUSE_BEFORE_SUBMIT'
  | 'CHECK_SUBSCRIPTION'
  | 'SUBSCRIPTION_RESPONSE'
  | 'RETRY_JOB'
  | 'RETRY_APPLY'
  | 'AI_MATCH_JOB'
  | 'AI_TAILOR_RESUME'
  | 'AI_COVER_LETTER'
  | 'AI_STANDOUT_TIPS'
  | 'GET_USAGE';

export interface ExtensionMessage {
  type: MessageType;
  payload?: any;
  timestamp: number;
}
