/* ============================================================
   LinkedApply Pro — Job Matcher
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
 * Uses resume text + skills map for accurate matching.
 */
export async function aiMatchJob(
  client: AIProviderClient,
  profile: UserProfile,
  jobDescription: string,
  resumeText?: string,
  skillsMap?: Record<string, number>
): Promise<JobMatchResult | null> {
  try {
    log.info('Calculating job match score...');

    const userProfileStr = formatProfileForAI(profile, resumeText, skillsMap);
    const prompt = fillPrompt(JOB_MATCH_PROMPT, {
      userProfile: userProfileStr,
      jobDescription: jobDescription.substring(0, 3000), // Limit JD length for token efficiency
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

function formatProfileForAI(
  profile: UserProfile,
  resumeText?: string,
  skillsMap?: Record<string, number>
): string {
  const parts: string[] = [
    `Name: ${profile.firstName} ${profile.lastName}`,
    `Location: ${profile.currentCity}, ${profile.state}, ${profile.country}`,
  ];

  // Add skills with years of experience
  if (skillsMap && Object.keys(skillsMap).length > 0) {
    const skillsList = Object.entries(skillsMap)
      .map(([skill, years]) => `${skill} (${years} years)`)
      .join(', ');
    parts.push(`Skills: ${skillsList}`);
  }

  // Add resume text (truncated to fit token limits)
  if (resumeText) {
    parts.push(`\nRESUME:\n${resumeText.substring(0, 2500)}`);
  }

  return parts.filter(Boolean).join('\n');
}
