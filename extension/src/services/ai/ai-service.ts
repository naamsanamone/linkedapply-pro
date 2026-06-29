/* ============================================================
   LinkedApply Pro — AI Service (Orchestrator)
   High-level AI facade that coordinates all AI sub-modules.
   This is the single import for any code that needs AI.
   ============================================================ */

import { createLogger } from '../../shared/logger';
import { getStorage } from '../../shared/storage';
import { STORAGE_KEYS } from '../../shared/constants';
import type { AIConfig, UserProfile, ExtractedSkills, QuestionType, CoverLetterData } from '../../shared/types';
import { createAIProvider, createAIProviderFromStorage, type AIProviderClient } from './ai-provider';
import { aiAnswerQuestion } from './ai-question-answerer';
import { aiExtractSkills } from './ai-skills-extractor';
import { aiMatchJob, type JobMatchResult } from './job-matcher';
import { aiTailorResume, type TailoredResume } from './resume-tailor';
import { aiGenerateCoverLetter } from './cover-letter-gen';
import { aiAnalyzeATS, type ATSAnalysisResult } from './ats-analyzer';

const log = createLogger('AIService');

/**
 * AIService — singleton facade for all AI operations.
 *
 * Usage:
 *   const ai = AIService.getInstance();
 *   await ai.init();
 *   const answer = await ai.answerQuestion('How many...?');
 */
class AIServiceImpl {
  private client: AIProviderClient | null = null;
  private profile: UserProfile | null = null;

  async init(): Promise<boolean> {
    this.client = await createAIProviderFromStorage();
    this.profile = await getStorage<UserProfile>(STORAGE_KEYS.USER_PROFILE);

    if (this.client) {
      log.info(`AI initialized: ${this.client.provider} (${this.client.model})`);
      return true;
    }
    log.info('AI not configured — running without AI');
    return false;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  getProviderName(): string | null {
    return this.client?.provider ?? null;
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) return false;
    return this.client.testConnection();
  }

  // ---- Core Features (from Python) ----

  async answerQuestion(
    question: string,
    options?: {
      questionType?: QuestionType;
      selectOptions?: string[];
      jobDescription?: string;
      aboutCompany?: string;
    }
  ): Promise<string | null> {
    if (!this.client) return null;

    const userInfo = this.profile
      ? `${this.profile.firstName} ${this.profile.lastName}, ${this.profile.currentCity}, ${this.profile.country}`
      : undefined;

    return aiAnswerQuestion(this.client, question, {
      ...options,
      userInfo,
    });
  }

  async extractSkills(jobDescription: string): Promise<ExtractedSkills | null> {
    if (!this.client) return null;
    return aiExtractSkills(this.client, jobDescription);
  }

  // ---- Premium Features ----

  async matchJob(jobDescription: string): Promise<JobMatchResult | null> {
    if (!this.client || !this.profile) return null;
    return aiMatchJob(this.client, this.profile, jobDescription);
  }

  async tailorResume(
    jobDescription: string,
    skills?: ExtractedSkills | null
  ): Promise<TailoredResume | null> {
    if (!this.client || !this.profile) return null;
    return aiTailorResume(this.client, this.profile, jobDescription, skills || null);
  }

  async generateCoverLetter(
    jobTitle: string,
    company: string,
    jobDescription: string
  ): Promise<CoverLetterData | null> {
    if (!this.client || !this.profile) return null;
    return aiGenerateCoverLetter(this.client, this.profile, jobTitle, company, jobDescription);
  }

  async analyzeATS(jobDescription: string): Promise<ATSAnalysisResult | null> {
    if (!this.client || !this.profile) return null;
    return aiAnalyzeATS(this.client, this.profile, jobDescription);
  }

  /**
   * Reconfigure AI with new settings (when user updates AI config)
   */
  async reconfigure(config: AIConfig): Promise<boolean> {
    try {
      this.client = createAIProvider(config);
      const success = await this.client.testConnection();
      if (success) {
        log.info(`AI reconfigured: ${config.provider} (${config.model})`);
      }
      return success;
    } catch (error) {
      log.error('AI reconfiguration failed', error);
      this.client = null;
      return false;
    }
  }
}

// ---- Singleton ----

let instance: AIServiceImpl | null = null;

export function getAIService(): AIServiceImpl {
  if (!instance) {
    instance = new AIServiceImpl();
  }
  return instance;
}

// Re-export types for consumers
export type { AIProviderClient, JobMatchResult, TailoredResume, ATSAnalysisResult };
