import { jsPDF } from 'jspdf';
import { createLogger } from '../shared/logger';

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
  skills: string[];
  experience: {
    company: string;
    title: string;
    dateRange: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    year: string;
  }[];
  certifications: string[];
  projects: {
    name: string;
    description: string;
  }[];
}

/* ============================================================
   Jake's Resume Template — jsPDF Recreation
   
   The most popular tech resume template (90%+ of FAANG applicants).
   - Letter size, tight 0.5" margins
   - 11pt body, section headers in UPPERCASE BOLD with horizontal rule
   - Company name BOLD left-aligned, dates right-aligned
   - Job title in italic below company
   - Tight bullet spacing for maximum content density
   ============================================================ */

interface JakeConfig {
  // Page
  pageWidth: number;      // inches
  pageHeight: number;     // inches
  marginX: number;        // left/right margin
  marginTop: number;      // top margin
  marginBottom: number;   // bottom margin
  
  // Fonts (in points)
  nameSize: number;
  sectionSize: number;
  bodySize: number;
  
  // Spacing (in inches)
  lineSpacing: number;    // body text line height multiplier
  sectionGap: number;     // space before section heading
  subSectionGap: number;  // space between items within a section
  bulletIndent: number;   // indent for bullet text
}

const JAKE_CONFIG: JakeConfig = {
  pageWidth: 8.5,
  pageHeight: 11,
  marginX: 0.5,
  marginTop: 0.4,
  marginBottom: 0.4,
  nameSize: 18,
  sectionSize: 11,
  bodySize: 10.5,
  lineSpacing: 1.15,
  sectionGap: 0.15,
  subSectionGap: 0.08,
  bulletIndent: 0.2,
};

export function generateTailoredResumePDF(
  sections: ResumeSections,
  targetPageCount: number
): Blob {
  // Try with default config first
  let config = { ...JAKE_CONFIG };
  let doc = renderJakeResume(sections, config);
  let pages = (doc as any).internal.getNumberOfPages();

  if (pages > targetPageCount) {
    // Shrink: tighter margins, smaller font
    logger.info(`Page count ${pages} > target ${targetPageCount}, shrinking...`);
    config.marginX = 0.4;
    config.marginTop = 0.3;
    config.marginBottom = 0.3;
    config.bodySize = 10;
    config.lineSpacing = 1.05;
    config.sectionGap = 0.1;
    config.subSectionGap = 0.05;
    doc = renderJakeResume(sections, config);
    pages = (doc as any).internal.getNumberOfPages();

    if (pages > targetPageCount) {
      // Still too big — trim bullets from oldest jobs
      logger.info(`Still ${pages} pages, trimming bullets...`);
      const trimmed = {
        ...sections,
        experience: sections.experience.map((exp, i) => ({
          ...exp,
          bullets: i === 0 ? exp.bullets.slice(0, 6) : exp.bullets.slice(0, 3),
        })),
      };
      doc = renderJakeResume(trimmed, config);
    }
  } else if (pages < targetPageCount && targetPageCount > 1) {
    // Expand: looser margins
    config.marginX = 0.7;
    config.lineSpacing = 1.3;
    config.sectionGap = 0.2;
    doc = renderJakeResume(sections, config);
  }

  logger.info(`Jake's Resume PDF generated: ${(doc as any).internal.getNumberOfPages()} page(s)`);
  return doc.output('blob');
}


function renderJakeResume(sections: ResumeSections, cfg: JakeConfig): jsPDF {
  const doc = new jsPDF({ format: 'letter', unit: 'in' });
  const maxW = cfg.pageWidth - 2 * cfg.marginX;
  let y = cfg.marginTop;

  // Helper: line height for a given font size
  const lh = (fontSize: number) => (fontSize * cfg.lineSpacing) / 72;

  // Helper: check page break
  const pageBreak = (needed: number): void => {
    if (y + needed > cfg.pageHeight - cfg.marginBottom) {
      doc.addPage();
      y = cfg.marginTop;
    }
  };

  // Helper: wrapped text
  const wrappedText = (text: string, x: number, width: number): void => {
    const lines = doc.splitTextToSize(text, width);
    lines.forEach((line: string) => {
      pageBreak(lh(cfg.bodySize));
      doc.text(line, x, y);
      y += lh(cfg.bodySize);
    });
  };

  // Helper: section heading — UPPERCASE BOLD with full-width horizontal rule
  const sectionHeading = (title: string): void => {
    y += cfg.sectionGap;
    pageBreak(lh(cfg.sectionSize) + 0.05);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cfg.sectionSize);
    doc.text(title.toUpperCase(), cfg.marginX, y);
    
    // Full-width horizontal rule under heading
    const ruleY = y + 0.03;
    doc.setLineWidth(0.5 / 72);
    doc.setDrawColor(0, 0, 0);
    doc.line(cfg.marginX, ruleY, cfg.pageWidth - cfg.marginX, ruleY);
    
    y = ruleY + 0.08;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cfg.bodySize);
  };

  // ========================================
  // NAME — centered, large, bold
  // ========================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(cfg.nameSize);
  const name = sections.contactInfo.name;
  if (name) {
    const nameW = doc.getTextWidth(name);
    doc.text(name, (cfg.pageWidth - nameW) / 2, y);
    y += lh(cfg.nameSize);
  }

  // ========================================
  // CONTACT LINE — centered, separated by " | "
  // ========================================
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(cfg.bodySize);
  const contactParts = [
    sections.contactInfo.location,
    sections.contactInfo.phone,
    sections.contactInfo.email,
    sections.contactInfo.linkedin,
    sections.contactInfo.github,
    sections.contactInfo.portfolio,
  ].filter(Boolean);
  
  if (contactParts.length > 0) {
    // Use " · " as separator (Jake's style)
    const contactLine = contactParts.join('  ·  ');
    const contactW = doc.getTextWidth(contactLine);
    if (contactW <= maxW) {
      doc.text(contactLine, (cfg.pageWidth - contactW) / 2, y);
    } else {
      // Split into two lines if too long
      const mid = Math.ceil(contactParts.length / 2);
      const line1 = contactParts.slice(0, mid).join('  ·  ');
      const line2 = contactParts.slice(mid).join('  ·  ');
      doc.text(line1, (cfg.pageWidth - doc.getTextWidth(line1)) / 2, y);
      y += lh(cfg.bodySize);
      doc.text(line2, (cfg.pageWidth - doc.getTextWidth(line2)) / 2, y);
    }
    y += lh(cfg.bodySize) + 0.05;
  }

  // ========================================
  // PROFESSIONAL SUMMARY
  // ========================================
  if (sections.summary) {
    sectionHeading('Summary');
    doc.setFontSize(cfg.bodySize);
    wrappedText(sections.summary, cfg.marginX, maxW);
    y += cfg.subSectionGap;
  }

  // ========================================
  // EXPERIENCE — Company bold + date right-aligned, title italic, bullets
  // ========================================
  if (sections.experience && sections.experience.length > 0) {
    sectionHeading('Experience');
    
    sections.experience.forEach((exp, idx) => {
      pageBreak(lh(cfg.bodySize) * 3); // Need space for at least header + 1 bullet

      // Line 1: Company (bold left) — Date (right)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cfg.bodySize);
      doc.text(exp.company, cfg.marginX, y);
      
      doc.setFont('helvetica', 'normal');
      const dateW = doc.getTextWidth(exp.dateRange);
      doc.text(exp.dateRange, cfg.pageWidth - cfg.marginX - dateW, y);
      y += lh(cfg.bodySize);

      // Line 2: Title (italic)
      doc.setFont('helvetica', 'italic');
      doc.text(exp.title, cfg.marginX, y);
      doc.setFont('helvetica', 'normal');
      y += lh(cfg.bodySize);

      // Bullets
      exp.bullets.forEach(bullet => {
        pageBreak(lh(cfg.bodySize));
        const bulletText = `•  ${bullet}`;
        const lines = doc.splitTextToSize(bulletText, maxW - cfg.bulletIndent);
        lines.forEach((line: string, lineIdx: number) => {
          pageBreak(lh(cfg.bodySize));
          doc.text(line, cfg.marginX + (lineIdx === 0 ? 0 : cfg.bulletIndent), y);
          y += lh(cfg.bodySize);
        });
      });

      // Gap between jobs (smaller for last item)
      if (idx < sections.experience.length - 1) {
        y += cfg.subSectionGap;
      }
    });
  }

  // ========================================
  // EDUCATION — Institution bold + date right, degree below
  // ========================================
  if (sections.education && sections.education.length > 0) {
    sectionHeading('Education');
    
    sections.education.forEach(edu => {
      pageBreak(lh(cfg.bodySize) * 2);

      // Institution (bold) — Year (right)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cfg.bodySize);
      doc.text(edu.institution, cfg.marginX, y);
      
      doc.setFont('helvetica', 'normal');
      const yearW = doc.getTextWidth(edu.year);
      doc.text(edu.year, cfg.pageWidth - cfg.marginX - yearW, y);
      y += lh(cfg.bodySize);

      // Degree (italic)
      doc.setFont('helvetica', 'italic');
      doc.text(edu.degree, cfg.marginX, y);
      doc.setFont('helvetica', 'normal');
      y += lh(cfg.bodySize) + cfg.subSectionGap;
    });
  }

  // ========================================
  // SKILLS — "Category: skill1, skill2" format (Jake's style)
  // ========================================
  if (sections.skills && sections.skills.length > 0) {
    sectionHeading('Technical Skills');
    
    // Group skills into a comma-separated line (Jake's format)
    const skillLine = sections.skills.join(', ');
    doc.setFontSize(cfg.bodySize);
    
    // Bold "Technologies:" prefix
    doc.setFont('helvetica', 'bold');
    const prefix = 'Technologies: ';
    doc.text(prefix, cfg.marginX, y);
    const prefixW = doc.getTextWidth(prefix);
    
    doc.setFont('helvetica', 'normal');
    const remaining = doc.splitTextToSize(skillLine, maxW - prefixW);
    if (remaining.length > 0) {
      doc.text(remaining[0], cfg.marginX + prefixW, y);
      y += lh(cfg.bodySize);
      // Remaining lines without prefix
      for (let i = 1; i < remaining.length; i++) {
        pageBreak(lh(cfg.bodySize));
        doc.text(remaining[i], cfg.marginX, y);
        y += lh(cfg.bodySize);
      }
    }
    y += cfg.subSectionGap;
  }

  // ========================================
  // PROJECTS — Name bold, description as bullet
  // ========================================
  if (sections.projects && sections.projects.length > 0) {
    sectionHeading('Projects');
    
    sections.projects.forEach(proj => {
      pageBreak(lh(cfg.bodySize) * 2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cfg.bodySize);
      doc.text(proj.name, cfg.marginX, y);
      doc.setFont('helvetica', 'normal');
      y += lh(cfg.bodySize);

      const descLines = doc.splitTextToSize(`•  ${proj.description}`, maxW - cfg.bulletIndent);
      descLines.forEach((line: string, i: number) => {
        pageBreak(lh(cfg.bodySize));
        doc.text(line, cfg.marginX + (i === 0 ? 0 : cfg.bulletIndent), y);
        y += lh(cfg.bodySize);
      });
      y += cfg.subSectionGap;
    });
  }

  // ========================================
  // CERTIFICATIONS — bullet list
  // ========================================
  if (sections.certifications && sections.certifications.length > 0) {
    sectionHeading('Certifications');
    
    sections.certifications.forEach(cert => {
      pageBreak(lh(cfg.bodySize));
      doc.setFontSize(cfg.bodySize);
      doc.text(`•  ${cert}`, cfg.marginX, y);
      y += lh(cfg.bodySize);
    });
  }

  return doc;
}
