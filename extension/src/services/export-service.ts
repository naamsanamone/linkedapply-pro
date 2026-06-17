/* ============================================================
   LinkedApply Pro — Enhanced Data Export Service
   Multi-format export: CSV, JSON, PDF report, and Markdown
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Job, SessionSummary } from '../shared/types';

const log = createLogger('Export');

// ================================================
//  CSV EXPORT
// ================================================

/**
 * Export applied jobs as CSV with full column set.
 */
export async function exportJobsCSV(): Promise<string> {
  const jobs = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS) || [];

  const headers = [
    'Job ID', 'Title', 'Company', 'Location', 'Work Style',
    'Status', 'Match Score', 'Date Applied', 'Date Listed',
    'Experience Required', 'Resume Used', 'HR Name',
    'Job Link', 'External Link', 'Notes',
    'Questions Count', 'Skills Count',
  ];

  const rows = jobs.map((job) => [
    job.id,
    csvEscape(job.title),
    csvEscape(job.company),
    csvEscape(job.location),
    job.workStyle,
    job.status,
    job.matchScore ?? '',
    job.dateApplied,
    job.dateListed,
    csvEscape(job.experienceRequired),
    job.resumeUsed,
    csvEscape(job.hrName),
    job.jobLink,
    job.externalLink,
    csvEscape(job.notes),
    job.questionsAnswered?.length || 0,
    job.skillsExtracted?.requiredSkills?.length || 0,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// ================================================
//  JSON EXPORT
// ================================================

/**
 * Export all jobs as formatted JSON.
 */
export async function exportJobsJSON(): Promise<string> {
  const jobs = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS) || [];
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    totalJobs: jobs.length,
    jobs,
  }, null, 2);
}

// ================================================
//  MARKDOWN REPORT
// ================================================

/**
 * Generate a Markdown application report for a date range.
 */
export async function exportMarkdownReport(
  startDate?: string,
  endDate?: string
): Promise<string> {
  const jobs = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS) || [];
  const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY);

  // Filter by date range
  let filtered = jobs;
  if (startDate) {
    filtered = filtered.filter((j) => j.dateApplied >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter((j) => j.dateApplied <= endDate);
  }

  const applied = filtered.filter((j) => j.status === 'applied');
  const interviews = filtered.filter((j) => j.status === 'interview');
  const offers = filtered.filter((j) => j.status === 'offer');
  const rejected = filtered.filter((j) => j.status === 'rejected');

  const dateRange = startDate && endDate
    ? `${startDate} to ${endDate}`
    : 'All Time';

  let md = `# LinkedApply Pro — Application Report\n\n`;
  md += `**Period:** ${dateRange}  \n`;
  md += `**Generated:** ${new Date().toLocaleDateString()}  \n\n`;

  md += `## Summary\n\n`;
  md += `| Metric | Count |\n|---|---|\n`;
  md += `| Total Applications | ${filtered.length} |\n`;
  md += `| Easy Apply | ${applied.length} |\n`;
  md += `| Interviews | ${interviews.length} |\n`;
  md += `| Offers | ${offers.length} |\n`;
  md += `| Rejected | ${rejected.length} |\n`;

  if (session) {
    const minutes = Math.round(session.estimatedTimeSaved / 60);
    md += `| Time Saved | ~${minutes} min |\n`;
  }

  md += `\n## Conversion Rates\n\n`;
  if (filtered.length > 0) {
    md += `- Application → Interview: **${((interviews.length / filtered.length) * 100).toFixed(1)}%**\n`;
    md += `- Interview → Offer: **${interviews.length > 0 ? ((offers.length / interviews.length) * 100).toFixed(1) : '0.0'}%**\n`;
    md += `- Overall Success: **${((offers.length / filtered.length) * 100).toFixed(1)}%**\n`;
  }

  // Top companies
  const companyCounts = new Map<string, number>();
  filtered.forEach((j) => {
    companyCounts.set(j.company, (companyCounts.get(j.company) || 0) + 1);
  });
  const topCompanies = [...companyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (topCompanies.length > 0) {
    md += `\n## Top Companies Applied\n\n`;
    md += `| Company | Applications |\n|---|---|\n`;
    topCompanies.forEach(([company, count]) => {
      md += `| ${company} | ${count} |\n`;
    });
  }

  // Interview details
  if (interviews.length > 0) {
    md += `\n## Interviews\n\n`;
    interviews.forEach((j) => {
      md += `- **${j.title}** at ${j.company} — Applied: ${j.dateApplied}\n`;
    });
  }

  // Offers
  if (offers.length > 0) {
    md += `\n## Offers 🎉\n\n`;
    offers.forEach((j) => {
      md += `- **${j.title}** at ${j.company}\n`;
    });
  }

  md += `\n---\n*Generated by LinkedApply Pro*\n`;

  return md;
}

// ================================================
//  HTML REPORT (printable / PDF-ready)
// ================================================

/**
 * Generate an HTML report suitable for printing or saving as PDF.
 */
export async function exportHTMLReport(): Promise<string> {
  const jobs = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS) || [];

  const statusCounts = {
    applied: 0, interview: 0, offer: 0, rejected: 0, bookmarked: 0, external: 0,
  };
  jobs.forEach((j) => {
    if (j.status in statusCounts) (statusCounts as any)[j.status]++;
  });

  const topCompanies = getTopN(jobs.map((j) => j.company), 8);
  const topLocations = getTopN(jobs.map((j) => j.location).filter(Boolean), 5);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>LinkedApply Pro — Report</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; color: #1a1a2e; background: #f8f9fa; padding: 32px; }
  .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 48px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  h1 { font-size: 28px; color: #6366f1; margin-bottom: 4px; }
  .subtitle { color: #9ca3af; margin-bottom: 32px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
  .stat-card { background: #f0f0ff; border-radius: 12px; padding: 20px; text-align: center; }
  .stat-card .number { font-size: 32px; font-weight: 700; color: #6366f1; }
  .stat-card .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  h2 { font-size: 18px; margin: 32px 0 16px; color: #1a1a2e; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
  th { font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge-applied { background: #dbeafe; color: #2563eb; }
  .badge-interview { background: #fef3c7; color: #d97706; }
  .badge-offer { background: #d1fae5; color: #059669; }
  .badge-rejected { background: #fee2e2; color: #dc2626; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
  @media print { body { background: #fff; padding: 0; } .container { box-shadow: none; } }
</style>
</head>
<body>
<div class="container">
  <h1>⚡ LinkedApply Pro Report</h1>
  <p class="subtitle">Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <div class="stats">
    <div class="stat-card"><div class="number">${jobs.length}</div><div class="label">Total Applied</div></div>
    <div class="stat-card"><div class="number">${statusCounts.interview}</div><div class="label">Interviews</div></div>
    <div class="stat-card"><div class="number">${statusCounts.offer}</div><div class="label">Offers</div></div>
    <div class="stat-card"><div class="number">${jobs.length > 0 ? ((statusCounts.interview / jobs.length) * 100).toFixed(1) : 0}%</div><div class="label">Response Rate</div></div>
  </div>

  <h2>Top Companies</h2>
  <table>
    <tr><th>Company</th><th>Applications</th></tr>
    ${topCompanies.map(([name, count]) => `<tr><td>${name}</td><td>${count}</td></tr>`).join('')}
  </table>

  <h2>Top Locations</h2>
  <table>
    <tr><th>Location</th><th>Applications</th></tr>
    ${topLocations.map(([name, count]) => `<tr><td>${name}</td><td>${count}</td></tr>`).join('')}
  </table>

  <h2>Recent Applications</h2>
  <table>
    <tr><th>Title</th><th>Company</th><th>Status</th><th>Date</th></tr>
    ${jobs.slice(0, 25).map((j) => `
      <tr>
        <td>${escapeHtml(j.title)}</td>
        <td>${escapeHtml(j.company)}</td>
        <td><span class="badge badge-${j.status}">${j.status}</span></td>
        <td>${j.dateApplied || '—'}</td>
      </tr>
    `).join('')}
  </table>

  <div class="footer">LinkedApply Pro — AI-Powered LinkedIn Job Automation</div>
</div>
</body>
</html>`;
}

// ================================================
//  DOWNLOAD TRIGGER
// ================================================

/**
 * Trigger a browser download with the given content.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain'
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  log.info(`Downloaded: ${filename}`);
}

/**
 * Export and download in the specified format.
 */
export async function exportAndDownload(
  format: 'csv' | 'json' | 'markdown' | 'html'
): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 10);
  const prefix = `linkedapply-pro-report-${timestamp}`;

  switch (format) {
    case 'csv': {
      const csv = await exportJobsCSV();
      downloadFile(csv, `${prefix}.csv`, 'text/csv');
      break;
    }
    case 'json': {
      const json = await exportJobsJSON();
      downloadFile(json, `${prefix}.json`, 'application/json');
      break;
    }
    case 'markdown': {
      const md = await exportMarkdownReport();
      downloadFile(md, `${prefix}.md`, 'text/markdown');
      break;
    }
    case 'html': {
      const html = await exportHTMLReport();
      downloadFile(html, `${prefix}.html`, 'text/html');
      break;
    }
  }
}

// ---- Helpers ----

function csvEscape(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getTopN(items: string[], n: number): [string, number][] {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    if (item) counts.set(item, (counts.get(item) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
