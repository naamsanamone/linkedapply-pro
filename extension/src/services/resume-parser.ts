/* ============================================================
   LinkedApply Pro — Resume Parser
   Extracts text from PDF resumes client-side using pdfjs-dist
   ============================================================ */

import { createLogger } from '../shared/logger';

const log = createLogger('ResumeParser');

/**
 * Extract text content from a PDF file entirely client-side.
 * Uses pdfjs-dist's getDocument + getTextContent APIs.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    log.info(`Parsing PDF: ${file.name} (${Math.round(file.size / 1024)}KB)`);

    // Dynamic import to avoid bundling pdfjs-dist in content scripts
    const pdfjsLib = await import('pdfjs-dist');
    
    // Configure worker — use bundled worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    const wordCount = fullText.split(/\s+/).filter(Boolean).length;
    log.info(`Resume parsed: ${pdf.numPages} pages, ${wordCount} words`);

    return fullText.trim();
  } catch (error) {
    log.error('Failed to parse PDF', error);
    throw new Error('Failed to parse PDF. Please ensure it is a valid PDF with selectable text.');
  }
}
