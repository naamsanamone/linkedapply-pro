/* ============================================================
   LinkedApply Pro — [PREMIUM] Job Matcher
   AI-powered job-to-candidate fit scoring (0-100)
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile } from '../../shared/types';
import { fillPrompt, JOB_MATCH_PROMPT } from './prompts';

const log = createLogger('AI:Matcher');

export interface JobMatchResult {
  score: number;
  strengths: string[];
  gaps: string[];
  recommendation: string;
  shouldApply: boolean;
}

/**
 * Score how well a user matches a job description (0-100).
 * Premium feature — requires Monthly plan or above.
 */
export async function aiMatchJob(
  client: AIProviderClient,
  profile: UserProfile,
  jobDescription: string
): Promise<JobMatchResult | null> {
  try {
    log.info('Calculating job match score...');

    const userProfileStr = formatProfileForAI(profile);
    const prompt = fillPrompt(JOB_MATCH_PROMPT, {
      userProfile: userProfileStr,
      jobDescription,
    });

    const result = await client.completeJSON<JobMatchResult>(prompt, {
      temperature: 0.1,
    });

    // Validate score range
    result.score = Math.max(0, Math.min(100, result.score));

    log.info(`Job match score: ${result.score}/100 (should apply: ${result.shouldApply})`);
    return result;
  } catch (error) {
    log.error('Job matching failed', error);
    return null;
  }
}

function formatProfileForAI(profile: UserProfile): string {
  return [
    `Name: ${profile.firstName} ${profile.lastName}`,
    `Location: ${profile.currentCity}, ${profile.state}, ${profile.country}`,
    `Email: ${profile.email}`,
  ].filter(Boolean).join('\n');
}
