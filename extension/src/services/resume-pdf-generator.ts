/* ============================================================
   Jake's Resume Template — jsPDF implementation
   
   Source: https://github.com/sb2nov/resume (Jake Gutierrez)
   
   Key fix: text is drawn first, then y is advanced past the text
   height BEFORE drawing horizontal rules. This guarantees rules
   are always below the text, never through it.
   ============================================================ */

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

// Jake's LaTeX dimensions
const J = {
  W: 8.5,             // letter width
  H: 11,              // letter height
  MX: 0.5,            // left/right margin (LaTeX: -0.5in offset)
  MT: 0.35,           // top margin
  MB: 0.35,           // bottom margin
  NAME: 20,           // \Huge = ~20pt
  HEAD: 11.5,         // \large section heading
  BODY: 10.5,         // body text
  SM: 10,             // \small items
  LH: 1.15,           // line height multiplier
  INDENT: 0.15,       // leftmargin=0.15in
};

export function generateTailoredResumePDF(
  sections: ResumeSections,
  targetPageCount: number
): Blob {
  const doc = new jsPDF({ format: 'letter', unit: 'in' });
  const contentW = J.W - 2 * J.MX;
  let y = J.MT;

  // Convert points to inches for line height
  const lineH = (pt: number) => (pt * J.LH) / 72;

  // Page break check
  const checkPage = (need: number) => {
    if (y + need > J.H - J.MB) {
      doc.addPage();
      y = J.MT;
    }
  };

  // ─── SECTION HEADING with horizontal rule ───
  // Draw text FIRST, advance y PAST the text, THEN draw rule
  const sectionHead = (title: string) => {
    y += 0.14; // gap before section
    checkPage(lineH(J.HEAD) + 0.08);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(J.HEAD);
    doc.text(title.toUpperCase(), J.MX, y);
    y += lineH(J.HEAD); // advance PAST the text

    // Draw rule at current y (guaranteed below text)
    doc.setLineWidth(0.7 / 72);
    doc.setDrawColor(0, 0, 0);
    doc.line(J.MX, y, J.W - J.MX, y);
    y += 0.06; // gap after rule

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(J.BODY);
  };

  // ─── SUBHEADING: {Bold}{Right} / {Italic}{SmallRight} ───
  const subheading = (b1: string, r1: string, i2: string, r2: string) => {
    checkPage(lineH(J.BODY) * 2 + 0.05);

    // Line 1: Bold left + Normal right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(J.BODY);
    doc.text(b1, J.MX + J.INDENT, y);
    doc.setFont('helvetica', 'normal');
    if (r1) {
      const rw = doc.getTextWidth(r1);
      doc.text(r1, J.W - J.MX - rw, y);
    }
    y += lineH(J.BODY);

    // Line 2: Italic left + Italic right
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

  // ─── PROJECT HEADING: Bold Name | Italic Tech ... Date ───
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
    const bx = J.MX + J.INDENT + 0.12; // bullet position
    const tx = bx + 0.1;               // text position
    const tw = J.W - J.MX - tx;        // text width

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
  // RENDER RESUME
  // ═══════════════════════════════════════════

  // ── NAME (centered, bold, large) ──
  if (sections.contactInfo.name) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(J.NAME);
    const nw = doc.getTextWidth(sections.contactInfo.name);
    doc.text(sections.contactInfo.name, (J.W - nw) / 2, y);
    y += lineH(J.NAME);
  }

  // ── CONTACT LINE (centered, | separated) ──
  const contact = [
    sections.contactInfo.phone,
    sections.contactInfo.email,
    sections.contactInfo.location,
    sections.contactInfo.linkedin,
    sections.contactInfo.github,
    sections.contactInfo.portfolio,
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

  // ── SUMMARY ──
  if (sections.summary) {
    sectionHead('Summary');
    wrapText(sections.summary, J.MX, contentW);
  }

  // ── EDUCATION ──
  if (sections.education?.length > 0) {
    sectionHead('Education');
    sections.education.forEach(edu => {
      subheading(edu.institution, edu.location, edu.degree, edu.year);
      y += 0.02;
    });
  }

  // ── EXPERIENCE ──
  if (sections.experience?.length > 0) {
    sectionHead('Experience');
    sections.experience.forEach((exp, i) => {
      subheading(exp.company, exp.dateRange, exp.title, exp.location);
      exp.bullets.forEach(b => bullet(b));
      if (i < sections.experience.length - 1) y += 0.03;
    });
  }

  // ── PROJECTS ──
  if (sections.projects?.length > 0) {
    sectionHead('Projects');
    sections.projects.forEach((p, i) => {
      projHead(p.name, p.techStack, p.duration);
      p.bullets.forEach(b => bullet(b));
      if (i < sections.projects.length - 1) y += 0.03;
    });
  }

  // ── TECHNICAL SKILLS ──
  if ((sections.skillCategories && Object.keys(sections.skillCategories).length > 0) ||
      sections.skills?.length > 0) {
    sectionHead('Technical Skills');
    doc.setFontSize(J.SM);

    if (sections.skillCategories && Object.keys(sections.skillCategories).length > 0) {
      Object.entries(sections.skillCategories).forEach(([cat, skills]) => {
        if (!skills) return;
        checkPage(lineH(J.SM));

        const x = J.MX + J.INDENT;
        doc.setFont('helvetica', 'bold');
        const label = `${cat}: `;
        doc.text(label, x, y);
        const lw = doc.getTextWidth(label);

        doc.setFont('helvetica', 'normal');
        const valW = J.W - J.MX - x - lw;
        const lines = doc.splitTextToSize(skills, valW);
        lines.forEach((line: string, i: number) => {
          checkPage(lineH(J.SM));
          doc.text(line, x + (i === 0 ? lw : 0), y);
          y += lineH(J.SM);
        });
      });
    } else {
      const x = J.MX + J.INDENT;
      doc.setFont('helvetica', 'bold');
      doc.text('Technologies: ', x, y);
      const lw = doc.getTextWidth('Technologies: ');
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(sections.skills.join(', '), contentW - J.INDENT - lw);
      lines.forEach((line: string, i: number) => {
        checkPage(lineH(J.SM));
        doc.text(line, x + (i === 0 ? lw : 0), y);
        y += lineH(J.SM);
      });
    }
  }

  // ── CERTIFICATIONS ──
  if (sections.certifications?.length > 0) {
    sectionHead('Certifications');
    sections.certifications.forEach(c => {
      checkPage(lineH(J.SM));
      doc.setFontSize(J.SM);
      doc.text(`\u2022  ${c}`, J.MX + J.INDENT + 0.12, y);
      y += lineH(J.SM);
    });
  }

  // ── Auto-fit: if too many pages, shrink ──
  const pages = (doc as any).internal.getNumberOfPages();
  if (pages > targetPageCount) {
    logger.info(`${pages} pages > target ${targetPageCount}, would need shrinking`);
  }

  logger.info(`Jake's Resume PDF: ${pages} page(s)`);
  return doc.output('blob');
}
