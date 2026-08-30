/* ============================================================
   LinkedApply Pro — Hybrid Resume Tailor (Dynamic Sections)
   
   Step A (one-time): AI parses resume → ordered sections array (cached)
   Step B (per-job):  AI extracts JD keywords → rule-based reorder
   
   Sections are dynamic — whatever is in the resume gets captured.
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile } from '../../shared/types';
import { fillPrompt, JD_KEYWORDS_PROMPT, PARSE_RESUME_PROMPT } from './prompts';
import { getStorage, setStorage } from '../../shared/storage';
import { STORAGE_KEYS } from '../../shared/constants';

const log = createLogger('AI:Resume');

// ── Section types (dynamic) ──
export type SectionType = 'header' | 'summary' | 'skills' | 'experience' | 'projects' | 'education' | 'list';

export interface ResumeSection {
  name: string;
  type: SectionType;
  // Header fields:
  fullName?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  // Type-specific content:
  text?: string;                                     // summary
  categories?: Record<string, string>;               // skills
  items?: string[];                                   // skills flat list, list
  entries?: ExperienceEntry[] | ProjectEntry[] | EducationEntry[];  // experience, projects, education
}

export interface ExperienceEntry {
  company: string;
  location: string;
  title: string;
  duration: string;
  bullets: string[];
}

export interface ProjectEntry {
  name: string;
  techStack: string;
  duration: string;
  bullets: string[];
}

export interface EducationEntry {
  institution: string;
  location: string;
  degree: string;
  year: string;
}

// ── Output (passed to PDF generator) ──
export interface TailoredResume {
  sections: ResumeSection[];
  atsScore: number;
  keywordsAdded: string[];
  allSkills: string[];
}

// ── JD keywords ──
interface JDKeywords {
  hardSkills: string[];
  softSkills: string[];
  tools: string[];
  domain: string[];
  seniority: string[];
  jobTitle: string;
}

/**
 * Hybrid Resume Tailoring (Dynamic Sections):
 * Step A: AI parses resume → ordered sections array (cached)
 * Step B: AI extracts JD keywords (per-job, ~100 tokens)
 * Step C: Rule-based reorder within each section
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
    let sections = await getStorage<ResumeSection[]>(STORAGE_KEYS.RESUME_STRUCTURED);

    if (!sections && resumeText) {
      log.info('First-time resume parsing with AI (will be cached)...');
      const parsePrompt = fillPrompt(PARSE_RESUME_PROMPT, {
        resumeText: resumeText.substring(0, 8000),
      });

      const parsed = await client.completeJSON<ResumeSection[]>(parsePrompt, {
        temperature: 0.1,
        maxTokens: 8000,
      });

      // Normalize: ensure it's an array
      sections = (Array.isArray(parsed) ? parsed : []).map(s => ({
        ...s,
        type: s.type || 'list',
        entries: s.entries || undefined,
        items: s.items || undefined,
        text: s.text || undefined,
        categories: s.categories || undefined,
      }));

      // Cache
      await setStorage(STORAGE_KEYS.RESUME_STRUCTURED, sections);
      log.info(`Resume parsed and cached: ${sections.length} sections [${sections.map(s => s.name).join(', ')}]`);
    }

    if (!sections || sections.length === 0) {
      log.warn('No resume text available for parsing');
      return null;
    }

    // ── Step B: AI extracts keywords from JD ──
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

    // ── Step C: Rule-based reorder within each section ──
    const tailoredSections = sections.map(section => tailorSection(section, allJdKeywords));

    // Collect all skills for ATS scoring
    const allSkills = collectSkills(sections);
    const matchedSkills = allSkills.filter(s =>
      allJdKeywords.some(jk => fuzzyMatch(s, jk))
    );

    // Generate/replace summary
    const summaryIdx = tailoredSections.findIndex(s => s.type === 'summary');
    if (summaryIdx >= 0) {
      const title = jdKeywords.jobTitle || 'Software Engineer';
      const topSkills = matchedSkills.slice(0, 5).join(', ');
      const years = skillsMap
        ? Math.max(...Object.values(skillsMap), 1)
        : sections.some(s => s.type === 'experience') ? '3+' : '1+';

      tailoredSections[summaryIdx] = {
        ...tailoredSections[summaryIdx],
        text: topSkills
          ? `${title} with ${years} years of experience specializing in ${topSkills}. ` +
            `Skilled in ${jdKeywords.domain.slice(0, 3).join(', ') || 'building scalable applications'} with a track record of delivering production-grade solutions.`
          : `${title} with ${years} years of experience in software development. ` +
            `Experienced in ${allSkills.slice(0, 5).join(', ') || 'full-stack development'}.`,
      };
    }

    // ATS score
    const totalJd = allJdKeywords.length || 1;
    const atsScore = Math.min(98, Math.round((matchedSkills.length / totalJd) * 80 + 20));

    log.info(`Resume tailored — ATS: ${atsScore}/100, ${matchedSkills.length} keywords matched, ${tailoredSections.length} sections`);

    return {
      sections: tailoredSections,
      atsScore,
      keywordsAdded: matchedSkills,
      allSkills,
    };
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
// Per-Section Tailoring
// ──────────────────────────────────────────

function tailorSection(section: ResumeSection, jdKeywords: string[]): ResumeSection {
  switch (section.type) {
    case 'skills': {
      // Reorder: JD-matching skills first in each category
      const reorderedItems = section.items
        ? reorderItems(section.items, jdKeywords)
        : undefined;
      return { ...section, items: reorderedItems };
    }
    case 'experience': {
      const entries = (section.entries as ExperienceEntry[] || []).map(e => ({
        ...e,
        bullets: reorderBullets(e.bullets || [], jdKeywords),
      }));
      return { ...section, entries };
    }
    case 'projects': {
      const entries = (section.entries as ProjectEntry[] || []).map(p => ({
        ...p,
        bullets: reorderBullets(p.bullets || [], jdKeywords),
      }));
      return { ...section, entries };
    }
    default:
      return section; // summary, education, list — no reordering needed
  }
}

function collectSkills(sections: ResumeSection[]): string[] {
  const skills: string[] = [];
  sections.forEach(s => {
    if (s.type === 'skills') {
      if (s.items) skills.push(...s.items);
      if (s.categories) {
        Object.values(s.categories).forEach(v => {
          v.split(',').forEach(sk => {
            const t = sk.trim();
            if (t && !skills.includes(t)) skills.push(t);
          });
        });
      }
    }
  });
  return skills;
}

function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_\.]/g, '');
  return normalize(a) === normalize(b) ||
    normalize(a).includes(normalize(b)) ||
    normalize(b).includes(normalize(a));
}

function reorderItems(items: string[], jdKeywords: string[]): string[] {
  const matched = items.filter(s => jdKeywords.some(jk => fuzzyMatch(s, jk)));
  const unmatched = items.filter(s => !jdKeywords.some(jk => fuzzyMatch(s, jk)));
  return [...matched, ...unmatched];
}

function reorderBullets(bullets: string[], jdKeywords: string[]): string[] {
  const scored = bullets.map(bullet => {
    const lower = bullet.toLowerCase();
    const matchCount = jdKeywords.filter(kw => lower.includes(kw)).length;
    return { bullet, matchCount };
  });
  scored.sort((a, b) => b.matchCount - a.matchCount);
  return scored.map(s => s.bullet);
}
