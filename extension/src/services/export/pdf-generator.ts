/* ============================================================
   LinkedApply Pro — PDF & DOCX Cover Letter Generator
   Export cover letters as downloadable files
   ============================================================ */

import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import type { CoverLetterData } from '../../shared/types';
import { createLogger } from '../../shared/logger';

const log = createLogger('Export');

/**
 * Generate a PDF Blob from cover letter data.
 */
export function generateCoverLetterPDF(data: CoverLetterData): Blob {
  const doc = new jsPDF();
  const margin = 25;
  const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  // Header — candidate name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.signature, margin, y);
  y += 10;

  // Date
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);
  doc.text(new Date(data.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }), margin, y);
  y += 8;

  // Subject line
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Re: ${data.subject}`, margin, y);
  y += 12;

  // Greeting
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(data.greeting, margin, y);
  y += 10;

  // Body paragraphs
  for (const para of data.bodyParagraphs) {
    const lines = doc.splitTextToSize(para, pageWidth);
    for (const line of lines) {
      if (y > 270) { // near bottom
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 6;
    }
    y += 4; // paragraph gap
  }

  // Closing
  y += 4;
  doc.text(data.closing, margin, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(data.signature, margin, y);

  log.info('PDF cover letter generated');
  return doc.output('blob');
}

/**
 * Generate a DOCX Blob from cover letter data.
 */
export async function generateCoverLetterDOCX(data: CoverLetterData): Promise<Blob> {
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 inch = 720 twips
        },
      },
      children: [
        // Signature / Name
        new Paragraph({
          children: [new TextRun({ text: data.signature, bold: true, size: 28, font: 'Calibri' })],
          spacing: { after: 200 },
        }),
        // Date
        new Paragraph({
          children: [new TextRun({
            text: new Date(data.generatedAt).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            }),
            size: 20,
            color: '888888',
            font: 'Calibri',
          })],
          spacing: { after: 200 },
        }),
        // Subject
        new Paragraph({
          children: [new TextRun({ text: `Re: ${data.subject}`, bold: true, size: 22, font: 'Calibri' })],
          spacing: { after: 300 },
        }),
        // Greeting
        new Paragraph({
          children: [new TextRun({ text: data.greeting, size: 22, font: 'Calibri' })],
          spacing: { after: 200 },
        }),
        // Body paragraphs
        ...data.bodyParagraphs.map(para =>
          new Paragraph({
            children: [new TextRun({ text: para, size: 22, font: 'Calibri' })],
            spacing: { after: 200 },
            alignment: AlignmentType.JUSTIFIED,
          })
        ),
        // Closing
        new Paragraph({
          children: [new TextRun({ text: data.closing, size: 22, font: 'Calibri' })],
          spacing: { before: 200, after: 100 },
        }),
        // Signature
        new Paragraph({
          children: [new TextRun({ text: data.signature, bold: true, size: 22, font: 'Calibri' })],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  log.info('DOCX cover letter generated');
  return blob;
}

/**
 * Trigger a file download in the browser.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  log.info(`Downloaded: ${filename}`);
}
