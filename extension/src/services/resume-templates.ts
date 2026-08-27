import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import { createLogger } from '../shared/logger';

const log = createLogger('ResumeTemplates');

export interface ResumeTemplateSections {
  contactInfo: { name: string; email: string; phone: string; location: string; linkedin?: string };
  summary: string;
  skills: string[];
  experience: { company: string; title: string; dateRange: string; bullets: string[] }[];
  education: { institution: string; degree: string; year: string }[];
  certifications: string[];
}

export interface ResumeTemplate {
  id: string;
  name: string;
  isBuiltIn: boolean;
  pageCount: number;  // detected from original PDF
  baseResumeText: string;
  sections: ResumeTemplateSections;
  createdAt: number;
  lastUsed: number;
}

export const ATS_PRO_TEMPLATE: ResumeTemplate = {
  id: 'ats-pro',
  name: 'ATS Pro (Built-in)',
  isBuiltIn: true,
  pageCount: 1,
  baseResumeText: '',
  sections: {
    contactInfo: { name: '', email: '', phone: '', location: '' },
    summary: '',
    skills: [],
    experience: [],
    education: [],
    certifications: []
  },
  createdAt: Date.now(),
  lastUsed: Date.now()
};

/**
 * Gets all saved templates, including the built-in ATS Pro template.
 */
export async function getTemplates(): Promise<ResumeTemplate[]> {
  try {
    const data = await getStorage<ResumeTemplate[]>(STORAGE_KEYS.RESUME_TEMPLATES);
    return data ? [ATS_PRO_TEMPLATE, ...data] : [ATS_PRO_TEMPLATE];
  } catch (error) {
    log.error('Failed to get templates:', error);
    return [ATS_PRO_TEMPLATE];
  }
}

/**
 * Saves a new template or updates an existing one.
 * Built-in templates cannot be saved/overwritten.
 */
export async function saveTemplate(template: ResumeTemplate): Promise<void> {
  if (template.isBuiltIn) {
    log.warn('Attempted to save built-in template:', template.id);
    return;
  }
  
  try {
    const data = await getStorage<ResumeTemplate[]>(STORAGE_KEYS.RESUME_TEMPLATES) || [];
    const existingIndex = data.findIndex(t => t.id === template.id);
    
    if (existingIndex >= 0) {
      data[existingIndex] = template;
    } else {
      data.push(template);
    }
    
    await setStorage(STORAGE_KEYS.RESUME_TEMPLATES, data);
    log.info(`Template ${template.id} saved successfully.`);
  } catch (error) {
    log.error('Failed to save template:', error);
    throw error;
  }
}

/**
 * Deletes a user template by id.
 */
export async function deleteTemplate(id: string): Promise<void> {
  if (id === ATS_PRO_TEMPLATE.id) {
    log.warn('Attempted to delete built-in template:', id);
    return;
  }

  try {
    const data = await getStorage<ResumeTemplate[]>(STORAGE_KEYS.RESUME_TEMPLATES) || [];
    const filteredData = data.filter(t => t.id !== id);
    await setStorage(STORAGE_KEYS.RESUME_TEMPLATES, filteredData);
    
    const defaultId = await getStorage<string>(STORAGE_KEYS.DEFAULT_TEMPLATE_ID);
    if (defaultId === id) {
      await setStorage(STORAGE_KEYS.DEFAULT_TEMPLATE_ID, ATS_PRO_TEMPLATE.id);
    }
    
    log.info(`Template ${id} deleted successfully.`);
  } catch (error) {
    log.error('Failed to delete template:', error);
    throw error;
  }
}

/**
 * Gets the currently selected default template.
 */
export async function getDefaultTemplate(): Promise<ResumeTemplate> {
  try {
    const defaultId = await getStorage<string>(STORAGE_KEYS.DEFAULT_TEMPLATE_ID);
    if (!defaultId || defaultId === ATS_PRO_TEMPLATE.id) {
      return ATS_PRO_TEMPLATE;
    }
    
    const templates = await getTemplates();
    const defaultTemplate = templates.find(t => t.id === defaultId);
    return defaultTemplate || ATS_PRO_TEMPLATE;
  } catch (error) {
    log.error('Failed to get default template:', error);
    return ATS_PRO_TEMPLATE;
  }
}

/**
 * Sets the default template ID.
 */
export async function setDefaultTemplateId(id: string): Promise<void> {
  try {
    await setStorage(STORAGE_KEYS.DEFAULT_TEMPLATE_ID, id);
    log.info(`Default template set to ${id}`);
  } catch (error) {
    log.error('Failed to set default template ID:', error);
    throw error;
  }
}

/**
 * Parses raw PDF text into a ResumeTemplate object.
 * Does basic text extraction to identify common sections.
 */
export async function parseResumeToTemplate(
  pdfText: string,
  pageCount: number,
  fileName: string
): Promise<ResumeTemplate> {
  log.info(`Parsing resume text to template from ${fileName}`);
  
  const sections: ResumeTemplateSections = {
    contactInfo: { name: fileName.replace('.pdf', ''), email: '', phone: '', location: '' },
    summary: '',
    skills: [],
    experience: [],
    education: [],
    certifications: []
  };

  const lines = pdfText.split(/\r?\n/);
  let currentSection = 'contactInfo';
  
  for (const line of lines) {
    const upperLine = line.trim().toUpperCase();
    
    if (upperLine === 'SUMMARY' || upperLine === 'PROFESSIONAL SUMMARY') {
      currentSection = 'summary';
      continue;
    } else if (upperLine === 'SKILLS' || upperLine === 'CORE COMPETENCIES') {
      currentSection = 'skills';
      continue;
    } else if (upperLine === 'EXPERIENCE' || upperLine === 'WORK EXPERIENCE') {
      currentSection = 'experience';
      continue;
    } else if (upperLine === 'EDUCATION') {
      currentSection = 'education';
      continue;
    } else if (upperLine === 'CERTIFICATIONS') {
      currentSection = 'certifications';
      continue;
    }
    
    if (!line.trim()) continue;

    switch (currentSection) {
      case 'summary':
        sections.summary += (sections.summary ? ' ' : '') + line.trim();
        break;
      case 'skills':
        sections.skills.push(...line.split(',').map(s => s.trim()).filter(s => s));
        break;
    }
  }

  const newTemplate: ResumeTemplate = {
    id: `user-template-${Date.now()}`,
    name: fileName.replace('.pdf', ''),
    isBuiltIn: false,
    pageCount,
    baseResumeText: pdfText,
    sections,
    createdAt: Date.now(),
    lastUsed: Date.now()
  };

  return newTemplate;
}

/**
 * Returns an AI prompt instruction based on the page budget.
 */
export function getPageBudgetPrompt(pageCount: number): string {
  if (pageCount <= 1) {
    return "Be concise. Max 3 bullets per role, 2-sentence summary, top 10 skills. Keep total content under 500 words.";
  } else if (pageCount === 2) {
    return "Include full detail. 5+ bullets per role, 3-sentence summary, all relevant skills. Target 800-1000 words.";
  } else {
    return "Comprehensive detail. Full bullet points, complete history, publications, projects. Target 1200+ words.";
  }
}
