import { jsPDF } from 'jspdf';
import { createLogger } from '../shared/logger';

const logger = createLogger('ResumePdfGenerator');

/* ============================================================
   Jake's Resume Template — Exact jsPDF recreation
   Source: https://github.com/sb2nov/resume (Jake Gutierrez fork)
   
   LaTeX specs reproduced here:
   - letterpaper, 11pt, 0.5in margins
   - \scshape\large section headers with \titlerule
   - \resumeSubheading: {Company}{Date} / {Title}{Location}
   - \resumeItem: \item\small bullet points
   - leftmargin=0.15in for subheading lists
   ============================================================ */

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
  // Jake's categorized skills: { "Languages": "Java, Python", "Frameworks": "React, Spring Boot" }
  skillCategories?: Record<string, string>;
  // Fallback flat skills list
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

interface JakeLayout {
  pageW: number;
  pageH: number;
  mX: number;      // left/right margin (0.5in from LaTeX)
  mTop: number;
  mBot: number;
  bodyPt: number;   // 10.5pt body (LaTeX 11pt \small ≈ 10.5)
  headPt: number;   // 11.5pt section heading (\large)
  namePt: number;   // 20pt name (\Huge)
  subPt: number;    // 10pt for subheading items
  lineH: number;    // line height multiplier
  itemIndent: number; // leftmargin=0.15in
}

const JAKE: JakeLayout = {
  pageW: 8.5,
  pageH: 11,
  mX: 0.5,
  mTop: 0.35,
  mBot: 0.35,
  bodyPt: 10.5,
  headPt: 11.5,
  namePt: 20,
  subPt: 10,
  lineH: 1.15,
  itemIndent: 0.15,
};

export function generateTailoredResumePDF(
  sections: ResumeSections,
  targetPageCount: number
): Blob {
  let cfg = { ...JAKE };
  let doc = renderJake(sections, cfg);
  let pages = (doc as any).internal.getNumberOfPages();

  if (pages > targetPageCount) {
    logger.info(`${pages} pages > target ${targetPageCount}, shrinking...`);
    cfg.mX = 0.4;
    cfg.mTop = 0.25;
    cfg.mBot = 0.25;
    cfg.bodyPt = 9.5;
    cfg.subPt = 9;
    cfg.lineH = 1.05;
    doc = renderJake(sections, cfg);
    pages = (doc as any).internal.getNumberOfPages();

    if (pages > targetPageCount) {
      // Trim bullets from older jobs
      const trimmed = {
        ...sections,
        experience: sections.experience.map((exp, i) => ({
          ...exp,
          bullets: i === 0 ? exp.bullets.slice(0, 6) : exp.bullets.slice(0, 3),
        })),
        projects: sections.projects.map(p => ({
          ...p,
          bullets: p.bullets.slice(0, 2),
        })),
      };
      doc = renderJake(trimmed, cfg);
    }
  }

  logger.info(`Jake's Resume PDF: ${(doc as any).internal.getNumberOfPages()} page(s)`);
  return doc.output('blob');
}

// ──────────────────────────────────────────────────────
// Core renderer — mirrors Jake's LaTeX commands
// ──────────────────────────────────────────────────────

function renderJake(s: ResumeSections, c: JakeLayout): jsPDF {
  const doc = new jsPDF({ format: 'letter', unit: 'in' });
  const maxW = c.pageW - 2 * c.mX;
  let y = c.mTop;

  const lh = (pt: number) => (pt * c.lineH) / 72;

  const needSpace = (inches: number): void => {
    if (y + inches > c.pageH - c.mBot) {
      doc.addPage();
      y = c.mTop;
    }
  };

  // ---- \section{Title} with \titlerule ----
  const sectionHead = (title: string): void => {
    y += 0.12;
    needSpace(lh(c.headPt) + 0.1);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(c.headPt);
    doc.text(title.toUpperCase(), c.mX, y);

    // \titlerule — full width line BELOW heading (not through it)
    const ruleY = y + 0.07; // enough clearance below text baseline
    doc.setLineWidth(0.7 / 72);
    doc.setDrawColor(0, 0, 0);
    doc.line(c.mX, ruleY, c.pageW - c.mX, ruleY);

    y = ruleY + 0.06;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(c.bodyPt);
  };

  // ---- \resumeSubheading{#1}{#2}{#3}{#4} ----
  //   Line 1: \textbf{#1} (left)    #2 (right)
  //   Line 2: \textit{\small#3} (left)    \textit{\small#4} (right)
  const subheading = (bold1: string, right1: string, italic2: string, right2: string): void => {
    needSpace(lh(c.bodyPt) * 2 + 0.05);

    // Line 1
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(c.bodyPt);
    doc.text(bold1, c.mX + c.itemIndent, y);
    doc.setFont('helvetica', 'normal');
    const r1W = doc.getTextWidth(right1);
    doc.text(right1, c.pageW - c.mX - r1W, y);
    y += lh(c.bodyPt);

    // Line 2
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(c.subPt);
    doc.text(italic2, c.mX + c.itemIndent, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(c.subPt);
    const r2W = doc.getTextWidth(right2);
    doc.text(right2, c.pageW - c.mX - r2W, y);
    y += lh(c.subPt) - 0.02; // \vspace{-7pt}
    doc.setFontSize(c.bodyPt);
  };

  // ---- \resumeProjectHeading{\textbf{Name} $|$ \emph{Tech}}{Date} ----
  const projectHeading = (name: string, techStack: string, date: string): void => {
    needSpace(lh(c.bodyPt) + 0.05);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(c.subPt);
    doc.text(name, c.mX + c.itemIndent, y);
    const nameW = doc.getTextWidth(name);

    if (techStack) {
      doc.setFont('helvetica', 'normal');
      doc.text(' | ', c.mX + c.itemIndent + nameW, y);
      const sepW = doc.getTextWidth(' | ');
      doc.setFont('helvetica', 'italic');
      doc.text(techStack, c.mX + c.itemIndent + nameW + sepW, y);
    }

    if (date) {
      doc.setFont('helvetica', 'normal');
      const dW = doc.getTextWidth(date);
      doc.text(date, c.pageW - c.mX - dW, y);
    }

    y += lh(c.subPt) - 0.02; // \vspace{-7pt}
    doc.setFontSize(c.bodyPt);
    doc.setFont('helvetica', 'normal');
  };

  // ---- \resumeItem{text} — bullet point ----
  const bulletItem = (text: string): void => {
    doc.setFontSize(c.subPt);
    doc.setFont('helvetica', 'normal');
    const bulletX = c.mX + c.itemIndent + 0.15;
    const textX = bulletX + 0.12;
    const textW = c.pageW - c.mX - textX;

    const lines = doc.splitTextToSize(text, textW);
    lines.forEach((line: string, i: number) => {
      needSpace(lh(c.subPt));
      if (i === 0) {
        doc.text('\u2022', bulletX, y); // bullet character
      }
      doc.text(line, textX, y);
      y += lh(c.subPt);
    });
    y -= 0.02; // \vspace{-2pt}
  };

  // ============================================
  // HEADING — centered name + contact line
  // ============================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(c.namePt);
  const name = s.contactInfo.name;
  if (name) {
    const nW = doc.getTextWidth(name);
    doc.text(name, (c.pageW - nW) / 2, y);
    y += lh(c.namePt) - 0.05;
  }

  // Contact line: phone | email | linkedin | github
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(c.subPt);
  const parts = [
    s.contactInfo.phone,
    s.contactInfo.email,
    s.contactInfo.location,
    s.contactInfo.linkedin,
    s.contactInfo.github,
    s.contactInfo.portfolio,
  ].filter(Boolean);

  if (parts.length > 0) {
    const contactStr = parts.join(' | ');
    const cW = doc.getTextWidth(contactStr);
    if (cW <= maxW) {
      doc.text(contactStr, (c.pageW - cW) / 2, y);
    } else {
      // Split into 2 lines
      const mid = Math.ceil(parts.length / 2);
      const l1 = parts.slice(0, mid).join(' | ');
      const l2 = parts.slice(mid).join(' | ');
      doc.text(l1, (c.pageW - doc.getTextWidth(l1)) / 2, y);
      y += lh(c.subPt);
      doc.text(l2, (c.pageW - doc.getTextWidth(l2)) / 2, y);
    }
    y += lh(c.subPt);
  }

  // ============================================
  // SUMMARY (not in original Jake's but useful for ATS)
  // ============================================
  if (s.summary) {
    sectionHead('Summary');
    doc.setFontSize(c.subPt);
    const sumLines = doc.splitTextToSize(s.summary, maxW);
    sumLines.forEach((line: string) => {
      needSpace(lh(c.subPt));
      doc.text(line, c.mX, y);
      y += lh(c.subPt);
    });
  }

  // ============================================
  // EDUCATION — \resumeSubheading format
  // Jake's order: Education first
  // ============================================
  if (s.education && s.education.length > 0) {
    sectionHead('Education');
    s.education.forEach(edu => {
      // {Institution}{Location} / {Degree}{Dates}
      subheading(
        edu.institution,
        edu.location || '',
        edu.degree,
        edu.year
      );
      y += 0.03;
    });
  }

  // ============================================
  // EXPERIENCE — \resumeSubheading + \resumeItemList
  // ============================================
  if (s.experience && s.experience.length > 0) {
    sectionHead('Experience');
    s.experience.forEach((exp, idx) => {
      // {Title}{Date} / {Company}{Location}  — Jake's format
      subheading(
        exp.company,
        exp.dateRange,
        exp.title,
        exp.location || ''
      );

      // Bullets
      exp.bullets.forEach(b => bulletItem(b));
      y += 0.03; // \vspace{-5pt} after itemlist

      if (idx < s.experience.length - 1) {
        y += 0.02;
      }
    });
  }

  // ============================================
  // PROJECTS — \resumeProjectHeading + bullets
  // ============================================
  if (s.projects && s.projects.length > 0) {
    sectionHead('Projects');
    s.projects.forEach((proj, idx) => {
      projectHeading(proj.name, proj.techStack, proj.duration);

      proj.bullets.forEach(b => bulletItem(b));
      y += 0.03;

      if (idx < s.projects.length - 1) {
        y += 0.02;
      }
    });
  }

  // ============================================
  // TECHNICAL SKILLS — categorized (Jake's format)
  //   \textbf{Languages}{: Java, Python, ...}
  //   \textbf{Frameworks}{: React, Spring Boot, ...}
  // ============================================
  if ((s.skillCategories && Object.keys(s.skillCategories).length > 0) || (s.skills && s.skills.length > 0)) {
    sectionHead('Technical Skills');

    doc.setFontSize(c.subPt);

    if (s.skillCategories && Object.keys(s.skillCategories).length > 0) {
      // Jake's categorized format
      Object.entries(s.skillCategories).forEach(([category, skillList]) => {
        if (!skillList) return;
        needSpace(lh(c.subPt));

        const indent = c.mX + c.itemIndent;

        doc.setFont('helvetica', 'bold');
        const label = `${category}: `;
        doc.text(label, indent, y);
        const labelW = doc.getTextWidth(label);

        doc.setFont('helvetica', 'normal');
        const valueW = c.pageW - c.mX - indent - labelW;
        const lines = doc.splitTextToSize(skillList, valueW);
        lines.forEach((line: string, i: number) => {
          needSpace(lh(c.subPt));
          doc.text(line, indent + (i === 0 ? labelW : 0), y);
          y += lh(c.subPt);
        });
      });
    } else {
      // Fallback: flat list as single "Technologies:" line
      const skillLine = s.skills.join(', ');
      doc.setFont('helvetica', 'bold');
      const prefix = 'Technologies: ';
      doc.text(prefix, c.mX + c.itemIndent, y);
      const pW = doc.getTextWidth(prefix);

      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(skillLine, maxW - c.itemIndent - pW);
      lines.forEach((line: string, i: number) => {
        needSpace(lh(c.subPt));
        doc.text(line, c.mX + c.itemIndent + (i === 0 ? pW : 0), y);
        y += lh(c.subPt);
      });
    }
  }

  // ============================================
  // CERTIFICATIONS
  // ============================================
  if (s.certifications && s.certifications.length > 0) {
    sectionHead('Certifications');
    doc.setFontSize(c.subPt);
    s.certifications.forEach(cert => {
      needSpace(lh(c.subPt));
      doc.text(`\u2022  ${cert}`, c.mX + c.itemIndent + 0.15, y);
      y += lh(c.subPt);
    });
  }

  return doc;
}
