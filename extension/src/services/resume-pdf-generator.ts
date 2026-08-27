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
}

interface LayoutConfig {
  margin: number;
  lineHeight: number;
  fontSizeBody: number;
  fontSizeHeading: number;
  fontSizeName: number;
}

export function generateTailoredResumePDF(
  sections: ResumeSections,
  targetPageCount: number
): Blob {
  let doc = new jsPDF({ format: 'letter', unit: 'in' });

  let config: LayoutConfig = {
    margin: 0.6,
    lineHeight: 1.1,
    fontSizeBody: 10,
    fontSizeHeading: 11,
    fontSizeName: 14,
  };

  let maxIterations = 3;
  let currentIteration = 0;
  let finalDoc = doc;

  // Deep copy experience to allow modification (trimming bullets)
  const modifiedSections = {
    ...sections,
    experience: sections.experience.map(exp => ({ ...exp, bullets: [...exp.bullets] }))
  };

  while (currentIteration < maxIterations) {
    logger.info(`Generating PDF - Iteration ${currentIteration + 1}`);
    finalDoc = new jsPDF({ format: 'letter', unit: 'in' });
    const pageCount = renderResumeContent(finalDoc, modifiedSections, config);

    if (pageCount === targetPageCount) {
      logger.info(`Target page count ${targetPageCount} reached.`);
      break;
    } else if (pageCount > targetPageCount) {
      logger.info(`Page count ${pageCount} exceeds target ${targetPageCount}. Attempting to shrink.`);
      if (currentIteration === 0) {
        config.margin = 0.5;
        config.fontSizeBody = 9.5;
        config.lineHeight = 1.0;
      } else {
        let trimCount = 0;
        for (let i = modifiedSections.experience.length - 1; i >= 0; i--) {
          if (modifiedSections.experience[i].bullets.length > 2) {
            modifiedSections.experience[i].bullets.pop();
            trimCount++;
          }
        }
        if (trimCount === 0) {
          logger.info(`Cannot shrink further. Final page count: ${pageCount}`);
          break; 
        }
      }
    } else {
      logger.info(`Page count ${pageCount} under target ${targetPageCount}. Attempting to expand.`);
      config.margin = 0.8;
      config.lineHeight = 1.2;
      // Only try to expand once
      if (currentIteration > 0) {
         break;
      }
    }

    currentIteration++;
  }

  return finalDoc.output('blob');
}

function renderResumeContent(doc: jsPDF, sections: ResumeSections, config: LayoutConfig): number {
  let currentY = config.margin;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxContentWidth = pageWidth - 2 * config.margin;

  doc.setFont('helvetica');

  const addWrappedText = (text: string, x: number, y: number, maxWidth: number): number => {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * config.fontSizeBody * config.lineHeight) / 72;
  };

  const checkPageBreak = (y: number, needed: number): number => {
    if (y + needed > doc.internal.pageSize.getHeight() - config.margin) {
      doc.addPage();
      return config.margin + needed; // Start slightly below margin to accommodate the needed space if it was a heading
    }
    return y;
  };

  const addSectionHeading = (title: string, y: number): number => {
    y = checkPageBreak(y, (config.fontSizeHeading * 2) / 72 + 0.1);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(config.fontSizeHeading);
    doc.text(title, config.margin, y);

    const textWidth = doc.getTextWidth(title);
    y += 0.05; // Gap before underline
    doc.setLineWidth(0.5 / 72); 
    doc.line(config.margin, y, pageWidth - config.margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(config.fontSizeBody);
    return y + (config.fontSizeBody * config.lineHeight) / 72 + 0.05;
  };

  // Contact Info
  doc.setFontSize(config.fontSizeName);
  doc.setFont('helvetica', 'bold');
  const nameWidth = doc.getTextWidth(sections.contactInfo.name);
  doc.text(sections.contactInfo.name, (pageWidth - nameWidth) / 2, currentY);
  currentY += (config.fontSizeName * config.lineHeight) / 72 + 0.05;

  doc.setFontSize(config.fontSizeBody);
  doc.setFont('helvetica', 'normal');
  const contactParts = [
    sections.contactInfo.email,
    sections.contactInfo.phone,
    sections.contactInfo.location,
  ];
  if (sections.contactInfo.linkedin) {
    contactParts.push(sections.contactInfo.linkedin);
  }
  const contactLine = contactParts.filter(Boolean).join(' | ');
  const contactWidth = doc.getTextWidth(contactLine);
  doc.text(contactLine, (pageWidth - contactWidth) / 2, currentY);
  currentY += (config.fontSizeBody * config.lineHeight) / 72 + 0.2;

  // Professional Summary
  if (sections.summary) {
    currentY = addSectionHeading('PROFESSIONAL SUMMARY', currentY);
    currentY = addWrappedText(sections.summary, config.margin, currentY, maxContentWidth);
    currentY += 0.1;
  }

  // Skills
  if (sections.skills && sections.skills.length > 0) {
    currentY = addSectionHeading('SKILLS', currentY);
    currentY = addWrappedText(sections.skills.join(', '), config.margin, currentY, maxContentWidth);
    currentY += 0.1;
  }

  // Experience
  if (sections.experience && sections.experience.length > 0) {
    currentY = addSectionHeading('EXPERIENCE', currentY);
    sections.experience.forEach(exp => {
      currentY = checkPageBreak(currentY, 0.3);

      doc.setFont('helvetica', 'bold');
      doc.text(exp.company, config.margin, currentY);

      doc.setFont('helvetica', 'normal');
      const dateWidth = doc.getTextWidth(exp.dateRange);
      doc.text(exp.dateRange, pageWidth - config.margin - dateWidth, currentY);

      currentY += (config.fontSizeBody * config.lineHeight) / 72;

      doc.setFont('helvetica', 'italic');
      doc.text(exp.title, config.margin, currentY);
      doc.setFont('helvetica', 'normal');

      currentY += (config.fontSizeBody * config.lineHeight) / 72 + 0.05;

      exp.bullets.forEach(bullet => {
        currentY = checkPageBreak(currentY, (config.fontSizeBody * config.lineHeight) / 72);
        doc.text('•', config.margin + 0.1, currentY);
        const bulletIndent = 0.25;
        const lines = doc.splitTextToSize(bullet, maxContentWidth - bulletIndent);
        doc.text(lines, config.margin + bulletIndent, currentY);
        currentY += (lines.length * config.fontSizeBody * config.lineHeight) / 72 + 0.02;
      });

      currentY += 0.1;
    });
  }

  // Education
  if (sections.education && sections.education.length > 0) {
    currentY = addSectionHeading('EDUCATION', currentY);
    sections.education.forEach(edu => {
      currentY = checkPageBreak(currentY, (config.fontSizeBody * config.lineHeight * 2) / 72 + 0.1);

      doc.setFont('helvetica', 'bold');
      doc.text(edu.institution, config.margin, currentY);

      doc.setFont('helvetica', 'normal');
      const yearWidth = doc.getTextWidth(edu.year);
      doc.text(edu.year, pageWidth - config.margin - yearWidth, currentY);

      currentY += (config.fontSizeBody * config.lineHeight) / 72;

      doc.text(edu.degree, config.margin, currentY);
      currentY += (config.fontSizeBody * config.lineHeight) / 72 + 0.05;
    });
    currentY += 0.05;
  }

  // Certifications
  if (sections.certifications && sections.certifications.length > 0) {
    currentY = addSectionHeading('CERTIFICATIONS', currentY);
    sections.certifications.forEach(cert => {
      currentY = checkPageBreak(currentY, (config.fontSizeBody * config.lineHeight) / 72);
      doc.text(cert, config.margin, currentY);
      currentY += (config.fontSizeBody * config.lineHeight) / 72 + 0.02;
    });
  }

  return (doc as any).internal.getNumberOfPages();
}
