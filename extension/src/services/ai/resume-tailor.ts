/* ============================================================
   LinkedApply Pro — [PREMIUM] Resume Tailor
   AI-powered resume optimization per job description
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile, ExtractedSkills } from '../../shared/types';
import { fillPrompt, RESUME_TAILOR_PROMPT } from './prompts';

const log = createLogger('AI:Resume');

export interface TailoredResume {
  summary: string;
  skills: string[];
  experience: TailoredExperience[];
  atsScore: number;
  keywordsAdded: string[];
}

export interface TailoredExperience {
  title: string;
  company: string;
  duration: string;
  bullets: string[];
}

/**
 * Tailor user's resume to match a specific job description.
 * Premium feature — requires Weekly plan or above.
 */
export async function aiTailorResume(
  client: AIProviderClient,
  profile: UserProfile,
  jobDescription: string,
  skills: ExtractedSkills | null
): Promise<TailoredResume | null> {
  try {
    log.info('Tailoring resume for job...');

    const userProfileStr = formatProfileForResume(profile);
    const requiredSkillsStr = skills
      ? [...skills.requiredSkills, ...skills.techStack].join(', ')
      : 'Not extracted';

    const prompt = fillPrompt(RESUME_TAILOR_PROMPT, {
      userProfile: userProfileStr,
      jobDescription,
      requiredSkills: requiredSkillsStr,
    });

    const result = await client.completeJSON<TailoredResume>(prompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Validate score
    result.atsScore = Math.max(0, Math.min(100, result.atsScore));

    log.info(`Resume tailored — ATS score: ${result.atsScore}/100, ${result.keywordsAdded.length} keywords added`);
    return result;
  } catch (error) {
    log.error('Resume tailoring failed', error);
    return null;
  }
}

function formatProfileForResume(profile: UserProfile): string {
  return [
    `Name: ${profile.firstName} ${profile.middleName || ''} ${profile.lastName}`.trim(),
    `Email: ${profile.email}`,
    `Phone: ${profile.phoneNumber}`,
    `Location: ${profile.currentCity}, ${profile.state}, ${profile.country}`,
  ].filter(Boolean).join('\n');
}
