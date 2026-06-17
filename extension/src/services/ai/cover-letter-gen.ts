/* ============================================================
   LinkedApply Pro — [PREMIUM] Cover Letter Generator
   AI-powered personalized cover letters per job
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile } from '../../shared/types';
import { fillPrompt, COVER_LETTER_PROMPT } from './prompts';

const log = createLogger('AI:CoverLetter');

/**
 * Generate a personalized cover letter for a specific job.
 * Premium feature — requires Monthly plan or above.
 */
export async function aiGenerateCoverLetter(
  client: AIProviderClient,
  profile: UserProfile,
  jobTitle: string,
  company: string,
  jobDescription: string
): Promise<string | null> {
  try {
    log.info(`Generating cover letter for "${jobTitle}" at ${company}...`);

    const userProfileStr = [
      `Name: ${profile.firstName} ${profile.lastName}`,
      `Email: ${profile.email}`,
      `Phone: ${profile.phoneNumber}`,
      `Location: ${profile.currentCity}, ${profile.state}`,
    ].join('\n');

    const prompt = fillPrompt(COVER_LETTER_PROMPT, {
      userProfile: userProfileStr,
      jobTitle,
      company,
      jobDescription,
    });

    const coverLetter = await client.complete(prompt, {
      temperature: 0.5,
      maxTokens: 1500,
    });

    // Clean up any accidental markdown
    const cleaned = coverLetter
      .replace(/^```[\w]*\n?/gm, '')
      .replace(/```$/gm, '')
      .trim();

    log.info(`Cover letter generated (${cleaned.length} chars)`);
    return cleaned;
  } catch (error) {
    log.error('Cover letter generation failed', error);
    return null;
  }
}
