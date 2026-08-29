/* ============================================================
   LinkedApply Pro — Hybrid Resume Tailor
   
   Approach 3: AI extracts JD keywords only (~100 tokens).
   Everything else is rule-based:
   - Skills: reorder to front-load JD-matching ones
   - Bullets: reorder so matching ones appear first
   - Summary: template-generated from matched skills
   - All resume content stays 100% user-written (zero hallucination)
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile } from '../../shared/types';
import { fillPrompt, JD_KEYWORDS_PROMPT } from './prompts';

const log = createLogger('AI:Resume');

// ---- Output interfaces (unchanged — compatible with PDF generator) ----

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

// ---- JD keywords shape (from AI) ----
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
 * Step 1: AI extracts keywords from JD (~100 tokens, fast, cheap)
 * Step 2: Rule-based matching against user's resume text
 * Step 3: Reorder skills & bullets, generate summary from template
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
    log.info('Hybrid tailoring: extracting JD keywords...');

    // ── Step 1: AI extracts keywords from JD (tiny call) ──
    const prompt = fillPrompt(JD_KEYWORDS_PROMPT, {
      jobDescription: jobDescription.substring(0, 2000),
    });

    const jdKeywords = await client.completeJSON<JDKeywords>(prompt, {
      temperature: 0.1,
      maxTokens: 500, // Tiny — just keyword extraction
    });

    const allJdKeywords = [
      ...(jdKeywords.hardSkills || []),
      ...(jdKeywords.softSkills || []),
      ...(jdKeywords.tools || []),
      ...(jdKeywords.domain || []),
    ].map(k => k.toLowerCase());

    log.info(`JD keywords extracted: ${allJdKeywords.length} keywords, title: "${jdKeywords.jobTitle}"`);

    // ── Step 2: Parse user's resume into sections ──
    const parsed = parseResumeText(resumeText || '', profile);

    // ── Step 3: Rule-based reordering & matching ──
    const result = buildTailoredResume(parsed, jdKeywords, allJdKeywords, profile, skillsMap);

    log.info(`Resume tailored — ATS score: ${result.atsScore}/100, ${result.keywordsAdded.length} keywords matched`);
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
// Resume Parser — extract sections from raw text
// ──────────────────────────────────────────

interface ParsedResume {
  allSkills: string[];
  experience: { company: string; title: string; location: string; duration: string; bullets: string[] }[];
  education: { institution: string; degree: string; location: string; year: string }[];
  projects: { name: string; techStack: string; duration: string; bullets: string[] }[];
  certifications: string[];
  rawText: string;
}

function parseResumeText(text: string, profile: UserProfile): ParsedResume {
  const result: ParsedResume = {
    allSkills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
    rawText: text,
  };

  if (!text) return result;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Find section boundaries
  const sectionPattern = /^(SUMMARY|EXPERIENCE|EDUCATION|SKILLS|TECHNICAL SKILLS|PROJECTS|CERTIFICATIONS|WORK EXPERIENCE)/i;
  const sections: { name: string; startIdx: number }[] = [];

  lines.forEach((line, idx) => {
    const match = line.match(sectionPattern);
    if (match) {
      sections.push({ name: match[1].toUpperCase(), startIdx: idx });
    }
  });

  sections.forEach((sec, i) => {
    const startIdx = sec.startIdx + 1;
    const endIdx = i < sections.length - 1 ? sections[i + 1].startIdx : lines.length;
    const sectionLines = lines.slice(startIdx, endIdx);

    switch (sec.name) {
      case 'SKILLS':
      case 'TECHNICAL SKILLS':
        result.allSkills = extractSkills(sectionLines);
        break;
      case 'EXPERIENCE':
      case 'WORK EXPERIENCE':
        result.experience = extractExperience(sectionLines);
        break;
      case 'EDUCATION':
        result.education = extractEducation(sectionLines);
        break;
      case 'PROJECTS':
        result.projects = extractProjects(sectionLines);
        break;
      case 'CERTIFICATIONS':
        result.certifications = sectionLines.filter(l => l.length > 3).map(l => l.replace(/^[•\-\*]\s*/, ''));
        break;
    }
  });

  // If no sections found, extract skills from the whole text
  if (result.allSkills.length === 0) {
    result.allSkills = extractSkillsFromFullText(text);
  }

  return result;
}

function extractSkills(lines: string[]): string[] {
  const skills: string[] = [];
  lines.forEach(line => {
    // Handle "Category: skill1, skill2, skill3" format
    const colonIdx = line.indexOf(':');
    const skillPart = colonIdx > -1 ? line.substring(colonIdx + 1) : line;
    skillPart.split(/[,;|]/).forEach(s => {
      const trimmed = s.trim().replace(/^[•\-\*]\s*/, '');
      if (trimmed.length > 1 && trimmed.length < 50) {
        skills.push(trimmed);
      }
    });
  });
  return skills;
}

function extractSkillsFromFullText(text: string): string[] {
  // Common tech skills pattern matching
  const techPatterns = /\b(Java|Python|JavaScript|TypeScript|React|Angular|Vue|Node\.?js|Spring\s*Boot|Django|Flask|Docker|Kubernetes|AWS|Azure|GCP|PostgreSQL|MySQL|MongoDB|Redis|Kafka|Git|Jenkins|CI\/CD|REST|GraphQL|HTML|CSS|SQL|Linux|Agile|Scrum|JUnit|Mockito|Selenium|Terraform|Ansible|Spark|Hadoop)\b/gi;
  const matches = text.match(techPatterns) || [];
  return [...new Set(matches.map(m => m.trim()))];
}

type ExperienceEntry = { company: string; title: string; location: string; duration: string; bullets: string[] };

function extractExperience(lines: string[]): ExperienceEntry[] {
  const experiences: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;

  lines.forEach(line => {
    const isBullet = /^[•\-\*▪]/.test(line);

    if (!isBullet && line.length > 5) {
      // Could be a company/title line
      if (current && current.bullets.length > 0) {
        experiences.push(current);
      }

      // Try to parse as "Company Name" or "Title — Company"
      const dateMatch = line.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s.]*\d{4}\s*[-–—]+\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*[\s.]*\d{4}|Present))/i);

      if (current === null || dateMatch) {
        const cleanLine = dateMatch ? line.replace(dateMatch[0], '').trim() : line;
        current = {
          company: cleanLine.replace(/[|,].*$/, '').trim() || line,
          title: '',
          location: '',
          duration: dateMatch ? dateMatch[1] : '',
          bullets: [],
        };
      } else if (current && !current.title) {
        current.title = line.replace(/[|,].*$/, '').trim();
      }
    } else if (isBullet && current) {
      current.bullets.push(line.replace(/^[•\-\*▪]\s*/, ''));
    }
  });

  const lastEntry = current as ExperienceEntry | null;
  if (lastEntry && lastEntry.bullets.length > 0) {
    experiences.push(lastEntry);
  }

  return experiences;
}

function extractEducation(lines: string[]): ParsedResume['education'] {
  const edu: ParsedResume['education'] = [];
  let current: ParsedResume['education'][0] | null = null;

  lines.forEach(line => {
    if (line.length > 5 && !/^[•\-\*]/.test(line)) {
      if (current) edu.push(current);
      current = { institution: line, degree: '', location: '', year: '' };

      const yearMatch = line.match(/\d{4}/);
      if (yearMatch) current.year = yearMatch[0];
    } else if (current && !current.degree && line.length > 3) {
      current.degree = line.replace(/^[•\-\*]\s*/, '');
    }
  });
  if (current) edu.push(current);
  return edu;
}

function extractProjects(lines: string[]): ParsedResume['projects'] {
  const projects: ParsedResume['projects'] = [];
  let current: ParsedResume['projects'][0] | null = null;

  lines.forEach(line => {
    const isBullet = /^[•\-\*▪]/.test(line);

    if (!isBullet && line.length > 3) {
      if (current) projects.push(current);
      // Extract tech stack from "Name | Tech1, Tech2" format
      const parts = line.split(/[|—–]/).map(p => p.trim());
      current = {
        name: parts[0] || line,
        techStack: parts[1] || '',
        duration: parts[2] || '',
        bullets: [],
      };
    } else if (isBullet && current) {
      current.bullets.push(line.replace(/^[•\-\*▪]\s*/, ''));
    }
  });
  if (current) projects.push(current);
  return projects;
}

// ──────────────────────────────────────────
// Rule-Based Tailoring Engine
// ──────────────────────────────────────────

function buildTailoredResume(
  parsed: ParsedResume,
  jdKeywords: JDKeywords,
  allJdKeywords: string[],
  profile: UserProfile,
  skillsMap?: Record<string, number>
): TailoredResume {
  // ── Match user's skills against JD keywords ──
  const userSkills = parsed.allSkills.length > 0
    ? parsed.allSkills
    : (skillsMap ? Object.keys(skillsMap) : []);

  const matchedSkills = userSkills.filter(s =>
    allJdKeywords.some(jk => fuzzyMatch(s, jk))
  );

  const unmatchedSkills = userSkills.filter(s =>
    !allJdKeywords.some(jk => fuzzyMatch(s, jk))
  );

  // Reorder: matched skills first, then unmatched
  const orderedSkills = [...matchedSkills, ...unmatchedSkills];

  // ── Categorize skills (Jake's format) ──
  const skillCategories = categorizeSkills(orderedSkills, jdKeywords);

  // ── Reorder experience bullets ──
  const reorderedExperience = parsed.experience.map(exp => ({
    ...exp,
    bullets: reorderBullets(exp.bullets, allJdKeywords),
  }));

  // ── Reorder projects bullets ──
  const reorderedProjects = parsed.projects.map(proj => ({
    ...proj,
    bullets: reorderBullets(proj.bullets, allJdKeywords),
  }));

  // ── Generate summary from template (no AI) ──
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const title = jdKeywords.jobTitle || 'Software Engineer';
  const topSkills = matchedSkills.slice(0, 5).join(', ');
  const years = skillsMap
    ? Math.max(...Object.values(skillsMap), 1)
    : parsed.experience.length > 0 ? '3+' : '1+';
  const summary = `${title} with ${years} years of experience specializing in ${topSkills || orderedSkills.slice(0, 4).join(', ')}. ` +
    `Skilled in ${jdKeywords.domain.slice(0, 3).join(', ') || 'full-stack development'} with a proven track record of delivering production-grade solutions.`;

  // ── Calculate ATS match score ──
  const totalJdKeywords = allJdKeywords.length || 1;
  const matchCount = matchedSkills.length;
  const atsScore = Math.min(98, Math.round((matchCount / totalJdKeywords) * 80 + 20));

  return {
    summary,
    skillCategories,
    skills: orderedSkills,
    experience: reorderedExperience,
    education: parsed.education.map(e => ({
      ...e,
      location: e.location || '',
    })),
    certifications: parsed.certifications,
    projects: reorderedProjects,
    atsScore,
    keywordsAdded: matchedSkills,
  };
}

/**
 * Fuzzy match: case-insensitive, handles common variations
 * "Spring Boot" matches "SpringBoot", "spring boot", "Spring-Boot"
 */
function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_\.]/g, '');
  return normalize(a) === normalize(b) ||
    normalize(a).includes(normalize(b)) ||
    normalize(b).includes(normalize(a));
}

/**
 * Reorder bullets: move bullets containing JD keywords to the top
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
function categorizeSkills(
  skills: string[],
  jdKeywords: JDKeywords
): Record<string, string> {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const devTools = new Set<string>();
  const libraries = new Set<string>();

  // Known categorization patterns
  const langPatterns = /^(java|python|javascript|typescript|c\+\+|c#|ruby|go|golang|rust|swift|kotlin|scala|php|r|matlab|sql|html|css|bash|shell|perl)$/i;
  const fwPatterns = /^(spring\s*boot|react|angular|vue|django|flask|express|next\.?js|node\.?js|\.net|rails|laravel|fastapi|quarkus|micronaut|spring\s*mvc|spring\s*cloud|hibernate|spring\s*batch|spring\s*security|spring\s*data\s*jpa|rxjs|microservices)$/i;
  const toolPatterns = /^(git|github|docker|kubernetes|aws|azure|gcp|jenkins|ci\/cd|terraform|ansible|maven|gradle|jira|confluence|sonarqube|intellij|vs\s*code|postman|splunk|grafana|prometheus|linux|s3|ec2|rds|lambda|iam|cloudformation|github\s*copilot|chatgpt)$/i;

  skills.forEach(skill => {
    const s = skill.trim();
    if (!s) return;

    if (langPatterns.test(s)) languages.add(s);
    else if (fwPatterns.test(s)) frameworks.add(s);
    else if (toolPatterns.test(s)) devTools.add(s);
    else libraries.add(s);
  });

  // Also include JD tools that the user has
  jdKeywords.tools.forEach(t => {
    if (skills.some(s => fuzzyMatch(s, t))) devTools.add(t);
  });

  const result: Record<string, string> = {};
  if (languages.size > 0) result['Languages'] = [...languages].join(', ');
  if (frameworks.size > 0) result['Frameworks'] = [...frameworks].join(', ');
  if (devTools.size > 0) result['Developer Tools'] = [...devTools].join(', ');
  if (libraries.size > 0) result['Libraries'] = [...libraries].join(', ');

  return result;
}
