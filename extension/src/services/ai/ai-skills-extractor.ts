/* ============================================================
   LinkedApply Pro — AI Skills Extractor
   Port of Python's ai_extract_skills / gemini_extract_skills /
   deepseek_extract_skills into unified provider-agnostic service
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { ExtractedSkills } from '../../shared/types';
import { fillPrompt, EXTRACT_SKILLS_PROMPT } from './prompts';

const log = createLogger('AI:Skills');

/**
 * Extract and classify skills from a job description using AI.
 * Returns structured skill categories (tech_stack, technical, other, required, nice_to_have).
 */
export async function aiExtractSkills(
  client: AIProviderClient,
  jobDescription: string
): Promise<ExtractedSkills | null> {
  try {
    log.info('Extracting skills from job description...');

    const prompt = fillPrompt(EXTRACT_SKILLS_PROMPT, { jobDescription });

    const result = await client.completeJSON<RawSkillsResponse>(prompt, {
      temperature: 0,
    });

    // Map snake_case (AI response) to camelCase (our types)
    const skills: ExtractedSkills = {
      techStack: result.tech_stack || [],
      technicalSkills: result.technical_skills || [],
      otherSkills: result.other_skills || [],
      requiredSkills: result.required_skills || [],
      niceToHave: result.nice_to_have || [],
    };

    log.info(`Extracted ${totalSkills(skills)} skills across 5 categories`);
    return skills;
  } catch (error) {
    log.error('Skill extraction failed', error);
    return null;
  }
}

// ---- Types ----

interface RawSkillsResponse {
  tech_stack: string[];
  technical_skills: string[];
  other_skills: string[];
  required_skills: string[];
  nice_to_have: string[];
}

function totalSkills(skills: ExtractedSkills): number {
  return (
    skills.techStack.length +
    skills.technicalSkills.length +
    skills.otherSkills.length +
    skills.requiredSkills.length +
    skills.niceToHave.length
  );
}
