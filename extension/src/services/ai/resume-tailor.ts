/* ============================================================
   LinkedApply Pro — Resume Tailor
   AI-powered resume optimization per job description
   Output format: Jake's Resume template
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile, ExtractedSkills } from '../../shared/types';
import { fillPrompt, RESUME_TAILOR_PROMPT } from './prompts';

const log = createLogger('AI:Resume');

// ---- Jake's Resume output format ----

export interface TailoredResume {
  summary: string;
  skillCategories: Record<string, string>;  // { "Languages": "Java, Python", "Frameworks": "..." }
  skills: string[];                          // Fallback flat list
  experience: TailoredExperience[];
  education: TailoredEducation[];
  certifications: string[];
  projects: TailoredProject[];
  atsScore: number;
  keywordsAdded: string[];
}

export interface TailoredEducation {
  institution: string;
  location: string;
  degree: string;
  year: string;
}

export interface TailoredProject {
  name: string;
  techStack: string;
  duration: string;
  bullets: string[];
  // Legacy fallback
  description?: string;
}

export interface TailoredExperience {
  company: string;
  location: string;
  title: string;
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
      maxTokens: 6000,
    });

    // Validate score
    result.atsScore = Math.max(0, Math.min(100, result.atsScore || 0));

    // Ensure all fields exist (truncated responses may omit them)
    result.keywordsAdded = result.keywordsAdded || [];
    result.skillCategories = result.skillCategories || {};
    result.skills = result.skills || [];
    result.experience = result.experience || [];
    result.education = result.education || [];
    result.certifications = result.certifications || [];
    result.projects = result.projects || [];
    result.summary = result.summary || '';

    // Normalize experience: ensure location field exists
    result.experience = result.experience.map(e => ({
      ...e,
      location: e.location || '',
    }));

    // Normalize education: ensure location field exists
    result.education = result.education.map(e => ({
      ...e,
      location: e.location || '',
    }));

    // Normalize projects: ensure bullets/techStack exist
    result.projects = result.projects.map(p => ({
      ...p,
      techStack: p.techStack || '',
      duration: p.duration || '',
      bullets: p.bullets || (p.description ? [p.description] : []),
    }));

    log.info(`Resume tailored — ATS score: ${result.atsScore}/100, ${result.keywordsAdded.length} keywords added`);
    return result;
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.includes('quota') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503')) {
      throw error;
    }
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
    parts.push(`\nRESUME CONTENT:\n${resumeText.substring(0, 4000)}`);
  }

  return parts.filter(Boolean).join('\n');
}
