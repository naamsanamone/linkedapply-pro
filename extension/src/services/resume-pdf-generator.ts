/* ============================================================
   Jake's Resume Template — Dynamic Section PDF Generator
   
   Renders any resume section dynamically based on type.
   Section order follows the uploaded resume's structure.
   ============================================================ */

import { jsPDF } from 'jspdf';
import { createLogger } from '../shared/logger';
import type { ResumeSection, ExperienceEntry, ProjectEntry, EducationEntry } from './ai/resume-tailor';

const logger = createLogger('ResumePdfGenerator');

// Jake's LaTeX dimensions
const J = {
  W: 8.5,             // letter width
  H: 11,              // letter height
  MX: 0.5,            // left/right margin
  MT: 0.35,           // top margin
  MB: 0.35,           // bottom margin
  NAME: 16,           // name font size
  HEAD: 10,           // section heading
  BODY: 9.5,          // body text
  SM: 9,              // small items
  LH: 1.25,           // line height multiplier
  INDENT: 0.15,       // bullet indent
};

export function generateTailoredResumePDF(
  sections: ResumeSection[],
  targetPageCount: number
): Blob {
  const doc = new jsPDF({ format: 'letter', unit: 'in' });
  const contentW = J.W - 2 * J.MX;
  let y = J.MT;

  const lineH = (pt: number) => (pt * J.LH) / 72;

  const checkPage = (need: number) => {
    if (y + need > J.H - J.MB) {
      doc.addPage();
      y = J.MT;
    }
  };

  // ─── SECTION HEADING (bold, uppercase) ───
  const sectionHead = (title: string) => {
    y += 0.10;
    checkPage(lineH(J.HEAD) + 0.04);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(J.HEAD);
    doc.text(title.toUpperCase(), J.MX, y);
    y += lineH(J.HEAD);
    y += 0.03;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(J.BODY);
  };

  // ─── RENDER HEADER (name + contact line) ───
  const renderHeader = (section: ResumeSection) => {
    // Name (centered, bold, large)
    if (section.fullName) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(J.NAME);
      const nw = doc.getTextWidth(section.fullName);
      doc.text(section.fullName, (J.W - nw) / 2, y);
      y += lineH(J.NAME);
    }

    // Contact line (centered, | separated)
    const contact = [
      section.phone,
      section.email,
      section.location,
      section.linkedin,
      section.github,
      section.portfolio,
    ].filter(Boolean);

    if (contact.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(J.SM);
      const str = contact.join('  |  ');
      const sw = doc.getTextWidth(str);
      if (sw <= contentW) {
        doc.text(str, (J.W - sw) / 2, y);
      } else {
        const mid = Math.ceil(contact.length / 2);
        const l1 = contact.slice(0, mid).join('  |  ');
        doc.text(l1, (J.W - doc.getTextWidth(l1)) / 2, y);
        y += lineH(J.SM);
        const l2 = contact.slice(mid).join('  |  ');
        doc.text(l2, (J.W - doc.getTextWidth(l2)) / 2, y);
      }
      y += lineH(J.SM);
    }
  };

  // ─── SUBHEADING: Bold Left + Right / Italic Left + Right ───
  const subheading = (b1: string, r1: string, i2: string, r2: string) => {
    checkPage(lineH(J.BODY) * 2 + 0.05);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(J.BODY);
    doc.text(b1, J.MX + J.INDENT, y);
    doc.setFont('helvetica', 'normal');
    if (r1) {
      const rw = doc.getTextWidth(r1);
      doc.text(r1, J.W - J.MX - rw, y);
    }
    y += lineH(J.BODY);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(J.SM);
    doc.text(i2, J.MX + J.INDENT, y);
    if (r2) {
      const rw = doc.getTextWidth(r2);
      doc.text(r2, J.W - J.MX - rw, y);
    }
    doc.setFont('helvetica', 'normal');
    y += lineH(J.SM);
  };

  // ─── PROJECT HEADING ───
  const projHead = (name: string, tech: string, date: string) => {
    checkPage(lineH(J.SM) + 0.02);
    doc.setFontSize(J.SM);
    let x = J.MX + J.INDENT;
    doc.setFont('helvetica', 'bold');
    doc.text(name, x, y);
    x += doc.getTextWidth(name);
    if (tech) {
      doc.setFont('helvetica', 'normal');
      doc.text(' | ', x, y);
      x += doc.getTextWidth(' | ');
      doc.setFont('helvetica', 'italic');
      doc.text(tech, x, y);
    }
    if (date) {
      doc.setFont('helvetica', 'normal');
      const dw = doc.getTextWidth(date);
      doc.text(date, J.W - J.MX - dw, y);
    }
    doc.setFont('helvetica', 'normal');
    y += lineH(J.SM);
  };

  // ─── BULLET ITEM ───
  const bullet = (text: string) => {
    doc.setFontSize(J.SM);
    doc.setFont('helvetica', 'normal');
    const bx = J.MX + J.INDENT + 0.12;
    const tx = bx + 0.1;
    const tw = J.W - J.MX - tx;
    const lines = doc.splitTextToSize(text, tw);
    lines.forEach((line: string, i: number) => {
      checkPage(lineH(J.SM));
      if (i === 0) doc.text('\u2022', bx, y);
      doc.text(line, tx, y);
      y += lineH(J.SM);
    });
  };

  // ─── WRAPPED TEXT ───
  const wrapText = (text: string, x: number, w: number) => {
    doc.setFontSize(J.SM);
    const lines = doc.splitTextToSize(text, w);
    lines.forEach((line: string) => {
      checkPage(lineH(J.SM));
      doc.text(line, x, y);
      y += lineH(J.SM);
    });
  };

  // ═══════════════════════════════════════════
  // RENDER DYNAMIC SECTIONS
  // ═══════════════════════════════════════════
  sections.forEach(section => {
    switch (section.type) {
      case 'header':
        renderHeader(section);
        break;

      case 'summary':
        if (section.text) {
          sectionHead(section.name);
          wrapText(section.text, J.MX, contentW);
        }
        break;

      case 'skills':
        if ((section.categories && Object.keys(section.categories).length > 0) ||
            (section.items && section.items.length > 0)) {
          sectionHead(section.name);
          doc.setFontSize(J.SM);

          if (section.categories && Object.keys(section.categories).length > 0) {
            Object.entries(section.categories).forEach(([cat, skills]) => {
              if (!skills) return;
              checkPage(lineH(J.SM));
              const x = J.MX + J.INDENT;
              doc.setFont('helvetica', 'bold');
              const label = `${cat}: `;
              doc.text(label, x, y);
              const lw = doc.getTextWidth(label);
              doc.setFont('helvetica', 'normal');
              let valW = J.W - J.MX - x - lw;
              valW = Math.max(1.5, valW);
              const lines = doc.splitTextToSize(skills, valW);
              lines.forEach((line: string, i: number) => {
                checkPage(lineH(J.SM));
                doc.text(line, x + (i === 0 ? lw : 0), y);
                y += lineH(J.SM);
              });
            });
          } else if (section.items) {
            const x = J.MX + J.INDENT;
            doc.setFont('helvetica', 'bold');
            doc.text('Technologies: ', x, y);
            const lw = doc.getTextWidth('Technologies: ');
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(section.items.join(', '), contentW - J.INDENT - lw);
            lines.forEach((line: string, i: number) => {
              checkPage(lineH(J.SM));
              doc.text(line, x + (i === 0 ? lw : 0), y);
              y += lineH(J.SM);
            });
          }
        }
        break;

      case 'experience': {
        const entries = section.entries as ExperienceEntry[] || [];
        if (entries.length > 0) {
          sectionHead(section.name);
          entries.forEach((exp, i) => {
            subheading(exp.company, exp.duration, exp.title, exp.location);
            (exp.bullets || []).forEach(b => bullet(b));
            if (i < entries.length - 1) y += 0.03;
          });
        }
        break;
      }

      case 'projects': {
        const entries = section.entries as ProjectEntry[] || [];
        if (entries.length > 0) {
          sectionHead(section.name);
          entries.forEach((p, i) => {
            projHead(p.name, p.techStack || '', p.duration || '');
            (p.bullets || []).forEach(b => bullet(b));
            if (i < entries.length - 1) y += 0.03;
          });
        }
        break;
      }

      case 'education': {
        const entries = section.entries as EducationEntry[] || [];
        if (entries.length > 0) {
          sectionHead(section.name);
          entries.forEach(edu => {
            subheading(edu.institution, edu.location, edu.degree, edu.year);
            y += 0.02;
          });
        }
        break;
      }

      case 'list':
        if (section.items && section.items.length > 0) {
          sectionHead(section.name);
          section.items.forEach(item => {
            checkPage(lineH(J.SM));
            doc.setFontSize(J.SM);
            // Use bullet + wrapped text for long items
            const bx = J.MX + J.INDENT + 0.12;
            const tx = bx + 0.1;
            const tw = J.W - J.MX - tx;
            const lines = doc.splitTextToSize(item, tw);
            lines.forEach((line: string, i: number) => {
              checkPage(lineH(J.SM));
              if (i === 0) doc.text('\u2022', bx, y);
              doc.text(line, tx, y);
              y += lineH(J.SM);
            });
          });
        }
        break;
    }
  });

  const pages = (doc as any).internal.getNumberOfPages();
  if (pages > targetPageCount) {
    logger.info(`${pages} pages > target ${targetPageCount}, would need shrinking`);
  }

  logger.info(`Dynamic Resume PDF: ${pages} page(s), ${sections.length} sections`);
  return doc.output('blob');
}
