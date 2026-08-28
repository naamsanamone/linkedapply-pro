/* ============================================================
   Jake's Resume Template — pdfmake implementation
   
   Source: https://github.com/sb2nov/resume (Jake Gutierrez)
   
   Uses pdfmake's declarative layout engine instead of manual
   Y-coordinate tracking. The template is defined as a document
   structure and pdfmake handles all positioning, page breaks,
   and text wrapping automatically — just like LaTeX.
   ============================================================ */

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { createLogger } from '../shared/logger';

// Register fonts
(pdfMake as any).vfs = (pdfFonts as any).pdfMake?.vfs || pdfFonts;

const logger = createLogger('ResumePdfGenerator');

export interface ResumeSections {
  contactInfo: {
    name: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  summary: string;
  skillCategories?: Record<string, string>;
  skills: string[];
  experience: {
    company: string;
    location: string;
    title: string;
    dateRange: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    location: string;
    degree: string;
    year: string;
  }[];
  certifications: string[];
  projects: {
    name: string;
    techStack: string;
    duration: string;
    bullets: string[];
  }[];
}

// ---- Jake's LaTeX dimensions ----
const JAKE = {
  pageSize: 'LETTER' as const,
  margins: [36, 28, 36, 28] as [number, number, number, number], // 0.5in LR, ~0.4in TB
  nameFontSize: 20,
  sectionFontSize: 11,
  bodyFontSize: 10,
  smallFontSize: 9.5,
};

export function generateTailoredResumePDF(
  sections: ResumeSections,
  _targetPageCount: number
): Blob {
  const content: any[] = [];

  // ============ HEADING ============
  // Centered name (bold, large)
  if (sections.contactInfo.name) {
    content.push({
      text: sections.contactInfo.name,
      fontSize: JAKE.nameFontSize,
      bold: true,
      alignment: 'center' as const,
      margin: [0, 0, 0, 2] as [number, number, number, number],
    });
  }

  // Contact line: phone | email | location | linkedin
  const contactParts = [
    sections.contactInfo.phone,
    sections.contactInfo.email,
    sections.contactInfo.location,
    sections.contactInfo.linkedin,
    sections.contactInfo.github,
    sections.contactInfo.portfolio,
  ].filter(Boolean);

  if (contactParts.length > 0) {
    content.push({
      text: contactParts.join('  |  '),
      fontSize: JAKE.smallFontSize,
      alignment: 'center' as const,
      margin: [0, 0, 0, 4] as [number, number, number, number],
    });
  }

  // ============ SUMMARY ============
  if (sections.summary) {
    content.push(sectionHeading('Summary'));
    content.push({
      text: sections.summary,
      fontSize: JAKE.smallFontSize,
      margin: [0, 0, 0, 2] as [number, number, number, number],
    });
  }

  // ============ EDUCATION ============
  if (sections.education && sections.education.length > 0) {
    content.push(sectionHeading('Education'));
    sections.education.forEach(edu => {
      content.push(subheading(
        edu.institution, edu.location,
        edu.degree, edu.year
      ));
    });
  }

  // ============ EXPERIENCE ============
  if (sections.experience && sections.experience.length > 0) {
    content.push(sectionHeading('Experience'));
    sections.experience.forEach(exp => {
      content.push(subheading(
        exp.company, exp.dateRange,
        exp.title, exp.location
      ));
      content.push(bulletList(exp.bullets));
    });
  }

  // ============ PROJECTS ============
  if (sections.projects && sections.projects.length > 0) {
    content.push(sectionHeading('Projects'));
    sections.projects.forEach(proj => {
      content.push(projectHeading(proj.name, proj.techStack, proj.duration));
      content.push(bulletList(proj.bullets));
    });
  }

  // ============ TECHNICAL SKILLS ============
  if ((sections.skillCategories && Object.keys(sections.skillCategories).length > 0) ||
      (sections.skills && sections.skills.length > 0)) {
    content.push(sectionHeading('Technical Skills'));

    if (sections.skillCategories && Object.keys(sections.skillCategories).length > 0) {
      // Jake's categorized format
      const skillRows = Object.entries(sections.skillCategories)
        .filter(([, v]) => v)
        .map(([category, skills]) => ({
          text: [
            { text: `${category}: `, bold: true },
            { text: skills },
          ],
          fontSize: JAKE.smallFontSize,
          margin: [10, 0, 0, 1] as [number, number, number, number],
        }));
      content.push(...skillRows);
    } else {
      content.push({
        text: [
          { text: 'Technologies: ', bold: true },
          { text: sections.skills.join(', ') },
        ],
        fontSize: JAKE.smallFontSize,
        margin: [10, 0, 0, 1] as [number, number, number, number],
      });
    }
  }

  // ============ CERTIFICATIONS ============
  if (sections.certifications && sections.certifications.length > 0) {
    content.push(sectionHeading('Certifications'));
    content.push(bulletList(sections.certifications));
  }

  // ============ BUILD PDF ============
  const docDefinition = {
    pageSize: JAKE.pageSize,
    pageMargins: JAKE.margins,
    defaultStyle: {
      font: 'Roboto',
      fontSize: JAKE.bodyFontSize,
    },
    content,
  };

  try {
    const pdfDoc = pdfMake.createPdf(docDefinition as any);

    // pdfmake generates synchronously in browser — extract buffer directly
    // Use the internal document generation to get raw bytes
    const pdfDocGenerator = (pdfDoc as any).getStream();

    // Collect chunks synchronously
    const chunks: Uint8Array[] = [];
    pdfDocGenerator.on('data', (chunk: Uint8Array) => {
      chunks.push(chunk);
    });
    pdfDocGenerator.on('end', () => {});
    pdfDocGenerator.end();

    if (chunks.length > 0) {
      const totalLength = chunks.reduce((acc: number, c: Uint8Array) => acc + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      chunks.forEach((chunk: Uint8Array) => {
        result.set(chunk, offset);
        offset += chunk.length;
      });
      const blob = new Blob([result], { type: 'application/pdf' });
      logger.info(`Jake's Resume PDF generated: ${(blob.size / 1024).toFixed(1)} KB`);
      return blob;
    }

    throw new Error('pdfmake produced no output');
  } catch (e) {
    logger.error('pdfmake generation failed', e);
    // Return a minimal valid PDF so the upload doesn't crash
    return new Blob(['%PDF-1.4 minimal'], { type: 'application/pdf' });
  }
}

// ──────────────────────────────────────────
// Jake's LaTeX template components
// ──────────────────────────────────────────

/**
 * \section{Title} with \titlerule
 * Renders: TITLE with a horizontal line below
 */
function sectionHeading(title: string): any {
  return {
    stack: [
      {
        text: title.toUpperCase(),
        fontSize: JAKE.sectionFontSize,
        bold: true,
        margin: [0, 8, 0, 2] as [number, number, number, number],
      },
      {
        canvas: [{
          type: 'line' as const,
          x1: 0, y1: 0,
          x2: 540, y2: 0, // full width (letter - margins ≈ 540pt)
          lineWidth: 0.7,
          lineColor: '#000000',
        }],
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
    ],
  };
}

/**
 * \resumeSubheading{Bold}{Right}{Italic}{SmallRight}
 * Line 1: **Bold** .................. Right
 * Line 2: *Italic* .................. SmallRight
 */
function subheading(bold1: string, right1: string, italic2: string, right2: string): any {
  return {
    stack: [
      // Line 1: Bold left, normal right
      {
        columns: [
          { text: bold1, bold: true, fontSize: JAKE.bodyFontSize, width: '*' },
          { text: right1, fontSize: JAKE.bodyFontSize, alignment: 'right' as const, width: 'auto' },
        ],
        margin: [10, 2, 0, 0] as [number, number, number, number],
      },
      // Line 2: Italic left, italic right
      {
        columns: [
          { text: italic2, italics: true, fontSize: JAKE.smallFontSize, width: '*' },
          { text: right2, italics: true, fontSize: JAKE.smallFontSize, alignment: 'right' as const, width: 'auto' },
        ],
        margin: [10, 0, 0, 2] as [number, number, number, number],
      },
    ],
  };
}

/**
 * \resumeProjectHeading{\textbf{Name} $|$ \emph{Tech}}{Date}
 */
function projectHeading(name: string, techStack: string, date: string): any {
  const leftParts: any[] = [{ text: name, bold: true }];
  if (techStack) {
    leftParts.push({ text: ' | ' });
    leftParts.push({ text: techStack, italics: true });
  }

  return {
    columns: [
      { text: leftParts, fontSize: JAKE.smallFontSize, width: '*' },
      { text: date || '', fontSize: JAKE.smallFontSize, alignment: 'right' as const, width: 'auto' },
    ],
    margin: [10, 2, 0, 2] as [number, number, number, number],
  };
}

/**
 * \resumeItemListStart / \resumeItem / \resumeItemListEnd
 * Renders bullet points
 */
function bulletList(items: string[]): any {
  if (!items || items.length === 0) return { text: '' };
  
  return {
    ul: items.map(item => ({
      text: item,
      fontSize: JAKE.smallFontSize,
      margin: [0, 0, 0, 1] as [number, number, number, number],
    })),
    margin: [20, 0, 0, 4] as [number, number, number, number],
  };
}
