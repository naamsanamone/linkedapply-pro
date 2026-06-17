/* ============================================================
   LinkedApply Pro — [PREMIUM] ATS Keyword Analyzer
   Identifies missing keywords and scores resume-JD match
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile } from '../../shared/types';
import { fillPrompt, ATS_ANALYSIS_PROMPT } from './prompts';

const log = createLogger('AI:ATS');

export interface ATSAnalysisResult {
  atsScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestions: string[];
  sectionScores: {
    skills: number;
    experience: number;
    education: number;
    keywords: number;
  };
}

/**
 * Analyze how well a resume/profile matches a job description from an ATS perspective.
 * Premium feature — requires Monthly plan or above.
 */
export async function aiAnalyzeATS(
  client: AIProviderClient,
  profile: UserProfile,
  jobDescription: string
): Promise<ATSAnalysisResult | null> {
  try {
    log.info('Running ATS keyword analysis...');

    const userProfileStr = [
      `Name: ${profile.firstName} ${profile.lastName}`,
      `Location: ${profile.currentCity}, ${profile.state}, ${profile.country}`,
      `Email: ${profile.email}`,
    ].join('\n');

    const prompt = fillPrompt(ATS_ANALYSIS_PROMPT, {
      userProfile: userProfileStr,
      jobDescription,
    });

    const result = await client.completeJSON<ATSAnalysisResult>(prompt, {
      temperature: 0,
    });

    // Validate scores
    result.atsScore = Math.max(0, Math.min(100, result.atsScore));
    if (result.sectionScores) {
      result.sectionScores.skills = Math.max(0, Math.min(100, result.sectionScores.skills));
      result.sectionScores.experience = Math.max(0, Math.min(100, result.sectionScores.experience));
      result.sectionScores.education = Math.max(0, Math.min(100, result.sectionScores.education));
      result.sectionScores.keywords = Math.max(0, Math.min(100, result.sectionScores.keywords));
    }

    log.info(`ATS analysis complete — Score: ${result.atsScore}/100, ${result.missingKeywords.length} missing keywords`);
    return result;
  } catch (error) {
    log.error('ATS analysis failed', error);
    return null;
  }
}
