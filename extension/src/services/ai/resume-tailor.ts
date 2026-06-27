/* ============================================================
   LinkedApply Pro — Resume Tailor
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
 * Uses resume text + skills for accurate tailoring.
 */
export async function aiTailorResume(
  client: AIProviderClient,
  profile: UserProfile,
  jobDescription: string,
  skills: ExtractedSkills | null,
  resumeText?: string,
  skillsMap?: Record<string, number>
): Promise<TailoredResume | null> {
  try {
    log.info('Tailoring resume for job...');

    const userProfileStr = formatProfileForResume(profile, resumeText, skillsMap);
    const requiredSkillsStr = skills
      ? [...skills.requiredSkills, ...skills.techStack].join(', ')
      : 'Not extracted';

    const prompt = fillPrompt(RESUME_TAILOR_PROMPT, {
      userProfile: userProfileStr,
      jobDescription: jobDescription.substring(0, 3000),
      requiredSkills: requiredSkillsStr,
    });

    const result = await client.completeJSON<TailoredResume>(prompt, {
      temperature: 0.3,
      maxTokens: 4000,
    });

    // Validate score
    result.atsScore = Math.max(0, Math.min(100, result.atsScore || 0));

    // Ensure arrays exist (truncated responses may omit them)
    result.keywordsAdded = result.keywordsAdded || [];
    result.skills = result.skills || [];
    result.experience = result.experience || [];
    result.summary = result.summary || '';

    log.info(`Resume tailored — ATS score: ${result.atsScore}/100, ${result.keywordsAdded.length} keywords added`);
    return result;
  } catch (error) {
    log.error('Resume tailoring failed', error);
    return null;
  }
}

function formatProfileForResume(
  profile: UserProfile,
  resumeText?: string,
  skillsMap?: Record<string, number>
): string {
  const parts: string[] = [
    `Name: ${profile.firstName} ${profile.middleName || ''} ${profile.lastName}`.trim(),
    `Email: ${profile.email}`,
    `Phone: ${profile.phoneNumber}`,
    `Location: ${profile.currentCity}, ${profile.state}, ${profile.country}`,
  ];

  if (skillsMap && Object.keys(skillsMap).length > 0) {
    const skillsList = Object.entries(skillsMap)
      .sort((a, b) => b[1] - a[1])
      .map(([skill, years]) => `${skill} (${years} years)`)
      .join(', ');
    parts.push(`Skills: ${skillsList}`);
  }

  if (resumeText) {
    parts.push(`\nRESUME CONTENT:\n${resumeText.substring(0, 2500)}`);
  }

  return parts.filter(Boolean).join('\n');
}
