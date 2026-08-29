/* ============================================================
   LinkedApply Pro — Hybrid Resume Tailor
   
   Two-step approach:
   Step A (one-time): AI parses resume text → structured JSON (cached)
   Step B (per-job):  AI extracts JD keywords → rule-based reorder
   
   Result: Resume content stays 100% user-written, just reordered.
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile } from '../../shared/types';
import { fillPrompt, JD_KEYWORDS_PROMPT, PARSE_RESUME_PROMPT } from './prompts';
import { getStorage, setStorage } from '../../shared/storage';
import { STORAGE_KEYS } from '../../shared/constants';

const log = createLogger('AI:Resume');

// ---- Output interfaces (compatible with PDF generator) ----

export interface TailoredResume {
  summary: string;
  skillCategories: Record<string, string>;
  skills: string[];
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
  description?: string;
}

export interface TailoredExperience {
  company: string;
  location: string;
  title: string;
  duration: string;
  bullets: string[];
}

// ---- Structured resume (cached after first AI parse) ----
interface StructuredResume {
  skills: string[];
  experience: { company: string; location: string; title: string; duration: string; bullets: string[] }[];
  education: { institution: string; location: string; degree: string; year: string }[];
  projects: { name: string; techStack: string; duration: string; bullets: string[] }[];
  certifications: string[];
}

// ---- JD keywords (from AI per-job) ----
interface JDKeywords {
  hardSkills: string[];
  softSkills: string[];
  tools: string[];
  domain: string[];
  seniority: string[];
  jobTitle: string;
}

/**
 * Hybrid Resume Tailoring:
 * Step A: Get structured resume (AI parse once, then cached)
 * Step B: AI extracts JD keywords (per-job, ~100 tokens)
 * Step C: Rule-based reorder of structured resume using JD keywords
 */
export async function aiTailorResume(
  client: AIProviderClient,
  profile: UserProfile,
  jobDescription: string,
  _skills: any,
  resumeText?: string,
  skillsMap?: Record<string, number>
): Promise<TailoredResume | null> {
  try {
    // ── Step A: Get or create structured resume (one-time AI parse) ──
    let structured = await getStorage<StructuredResume>(STORAGE_KEYS.RESUME_STRUCTURED);

    if (!structured && resumeText) {
      log.info('First-time resume parsing with AI (will be cached)...');
      const parsePrompt = fillPrompt(PARSE_RESUME_PROMPT, {
        resumeText: resumeText.substring(0, 5000),
      });

      structured = await client.completeJSON<StructuredResume>(parsePrompt, {
        temperature: 0.1,
        maxTokens: 4000,
      });

      // Validate and normalize
      structured = {
        skills: structured.skills || [],
        experience: (structured.experience || []).map(e => ({
          ...e, location: e.location || '', bullets: e.bullets || [],
        })),
        education: (structured.education || []).map(e => ({
          ...e, location: e.location || '',
        })),
        projects: (structured.projects || []).map(p => ({
          ...p, techStack: p.techStack || '', duration: p.duration || '', bullets: p.bullets || [],
        })),
        certifications: structured.certifications || [],
      };

      // Cache it — won't parse again until user uploads a new resume
      await setStorage(STORAGE_KEYS.RESUME_STRUCTURED, structured);
      log.info(`Resume parsed and cached: ${structured.experience.length} jobs, ${structured.education.length} edu, ${structured.skills.length} skills, ${structured.projects.length} projects`);
    }

    if (!structured) {
      log.warn('No resume text available for parsing');
      return null;
    }

    // ── Step B: AI extracts keywords from JD (per-job, tiny call) ──
    log.info('Extracting JD keywords...');
    const jdPrompt = fillPrompt(JD_KEYWORDS_PROMPT, {
      jobDescription: jobDescription.substring(0, 2000),
    });

    const jdKeywords = await client.completeJSON<JDKeywords>(jdPrompt, {
      temperature: 0.1,
      maxTokens: 2000,
    });

    const allJdKeywords = [
      ...(jdKeywords.hardSkills || []),
      ...(jdKeywords.softSkills || []),
      ...(jdKeywords.tools || []),
      ...(jdKeywords.domain || []),
    ].map(k => k.toLowerCase());

    log.info(`JD keywords: ${allJdKeywords.length} total, title: "${jdKeywords.jobTitle}"`);

    // ── Step C: Rule-based reorder (zero AI) ──
    const result = buildTailoredResume(structured, jdKeywords, allJdKeywords, profile, skillsMap);

    log.info(`Resume tailored — ATS: ${result.atsScore}/100, ${result.keywordsAdded.length} keywords matched, ${result.experience.length} jobs, ${result.education.length} edu`);
    return result;
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.includes('quota') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('503')) {
      throw error;
    }
    log.error('Hybrid tailoring failed', error);
    return null;
  }
}

// ──────────────────────────────────────────
// Rule-Based Tailoring Engine
// ──────────────────────────────────────────

function buildTailoredResume(
  structured: StructuredResume,
  jdKeywords: JDKeywords,
  allJdKeywords: string[],
  profile: UserProfile,
  skillsMap?: Record<string, number>
): TailoredResume {
  // ── Match user's skills against JD keywords ──
  const matchedSkills = structured.skills.filter(s =>
    allJdKeywords.some(jk => fuzzyMatch(s, jk))
  );
  const unmatchedSkills = structured.skills.filter(s =>
    !allJdKeywords.some(jk => fuzzyMatch(s, jk))
  );

  // Reorder: matched skills first
  const orderedSkills = [...matchedSkills, ...unmatchedSkills];

  // ── Categorize skills (Jake's format) ──
  const skillCategories = categorizeSkills(orderedSkills);

  // ── Reorder experience bullets (JD-matching first) ──
  const reorderedExperience = structured.experience.map(exp => ({
    ...exp,
    bullets: reorderBullets(exp.bullets, allJdKeywords),
  }));

  // ── Reorder project bullets ──
  const reorderedProjects = structured.projects.map(proj => ({
    ...proj,
    bullets: reorderBullets(proj.bullets, allJdKeywords),
  }));

  // ── Generate summary from template (no AI) ──
  const title = jdKeywords.jobTitle || 'Software Engineer';
  const topSkills = matchedSkills.slice(0, 5).join(', ');
  const years = skillsMap
    ? Math.max(...Object.values(skillsMap), 1)
    : structured.experience.length > 0 ? '3+' : '1+';

  const summary = topSkills
    ? `${title} with ${years} years of experience specializing in ${topSkills}. ` +
      `Skilled in ${jdKeywords.domain.slice(0, 3).join(', ') || 'building scalable applications'} with a track record of delivering production-grade solutions.`
    : `${title} with ${years} years of experience in software development. ` +
      `Experienced in ${orderedSkills.slice(0, 5).join(', ') || 'full-stack development'}.`;

  // ── ATS score based on keyword match ──
  const totalJd = allJdKeywords.length || 1;
  const atsScore = Math.min(98, Math.round((matchedSkills.length / totalJd) * 80 + 20));

  return {
    summary,
    skillCategories,
    skills: orderedSkills,
    experience: reorderedExperience,
    education: structured.education.map(e => ({ ...e, location: e.location || '' })),
    certifications: structured.certifications,
    projects: reorderedProjects,
    atsScore,
    keywordsAdded: matchedSkills,
  };
}

/**
 * Fuzzy match: case-insensitive, handles variations
 */
function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_\.]/g, '');
  return normalize(a) === normalize(b) ||
    normalize(a).includes(normalize(b)) ||
    normalize(b).includes(normalize(a));
}

/**
 * Reorder bullets: JD-matching bullets first
 */
function reorderBullets(bullets: string[], jdKeywords: string[]): string[] {
  const scored = bullets.map(bullet => {
    const lower = bullet.toLowerCase();
    const matchCount = jdKeywords.filter(kw => lower.includes(kw)).length;
    return { bullet, matchCount };
  });
  scored.sort((a, b) => b.matchCount - a.matchCount);
  return scored.map(s => s.bullet);
}

/**
 * Categorize skills into Jake's Resume format
 */
function categorizeSkills(skills: string[]): Record<string, string> {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const devTools = new Set<string>();
  const libraries = new Set<string>();

  const langPatterns = /^(java|python|javascript|typescript|c\+\+|c#|ruby|go|golang|rust|swift|kotlin|scala|php|r|matlab|sql|html|css|bash|shell|perl)$/i;
  const fwPatterns = /^(spring\s*boot|react|angular|vue|django|flask|express|next\.?js|node\.?js|\.net|rails|laravel|fastapi|quarkus|hibernate|spring\s*mvc|spring\s*cloud|spring\s*batch|spring\s*security|spring\s*data\s*jpa|microservices)$/i;
  const toolPatterns = /^(git|github|docker|kubernetes|aws|azure|gcp|jenkins|ci\/cd|terraform|ansible|maven|gradle|jira|confluence|sonarqube|intellij|vs\s*code|postman|splunk|grafana|prometheus|linux|s3|ec2|rds|lambda|iam|zipkin|hikari\s*cp)$/i;

  skills.forEach(skill => {
    const s = skill.trim();
    if (!s) return;
    if (langPatterns.test(s)) languages.add(s);
    else if (fwPatterns.test(s)) frameworks.add(s);
    else if (toolPatterns.test(s)) devTools.add(s);
    else libraries.add(s);
  });

  const result: Record<string, string> = {};
  if (languages.size > 0) result['Languages'] = [...languages].join(', ');
  if (frameworks.size > 0) result['Frameworks'] = [...frameworks].join(', ');
  if (devTools.size > 0) result['Developer Tools'] = [...devTools].join(', ');
  if (libraries.size > 0) result['Libraries'] = [...libraries].join(', ');

  return result;
}
