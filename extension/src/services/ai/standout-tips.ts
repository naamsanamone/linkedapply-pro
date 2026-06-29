/* ============================================================
   LinkedApply Pro — [PREMIUM] Stand Out Tips Generator
   AI-powered suggestions to help candidates stand out
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile, StandOutTips } from '../../shared/types';
import { fillPrompt, STAND_OUT_TIPS_PROMPT } from './prompts';

const log = createLogger('AI:StandOut');

/**
 * Generate personalized stand-out tips for a specific job.
 */
export async function aiGenerateStandOutTips(
  client: AIProviderClient,
  profile: UserProfile,
  jobTitle: string,
  company: string,
  jobDescription: string
): Promise<StandOutTips | null> {
  try {
    log.info(`Generating stand-out tips for "${jobTitle}" at ${company}...`);

    const userProfileStr = [
      `Name: ${profile.firstName} ${profile.lastName}`,
      `Email: ${profile.email}`,
      `Location: ${profile.currentCity}, ${profile.state}`,
      `Education: ${profile.highestEducation || 'N/A'}`,
    ].join('\n');

    const prompt = fillPrompt(STAND_OUT_TIPS_PROMPT, {
      userProfile: userProfileStr,
      jobTitle,
      company,
      jobDescription: jobDescription.substring(0, 2000),
    });

    const result = await client.completeJSON<StandOutTips>(prompt, {
      temperature: 0.4,
      maxTokens: 1500,
    });

    // Ensure arrays exist
    result.highlightSkills = result.highlightSkills || [];
    result.highlightAchievements = result.highlightAchievements || [];
    result.profileImprovements = result.profileImprovements || [];

    log.info(`Stand-out tips generated: ${result.highlightSkills.length} skills, ${result.highlightAchievements.length} achievements, ${result.profileImprovements.length} improvements`);
    return result;
  } catch (error) {
    log.error('Stand-out tips generation failed', error);
    return null;
  }
}
