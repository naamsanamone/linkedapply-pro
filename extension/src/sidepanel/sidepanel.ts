/* ============================================================
   LinkedApply Pro — Side Panel Controller (Phase 4)
   Full dashboard with interactive Kanban, analytics charts,
   job detail modal, search/filter, and data export
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Job, JobStatus, SessionSummary, BotStatus, ExtensionMessage } from '../shared/types';

const log = createLogger('SidePanel');

let allJobs: Job[] = [];
let currentJobId: string | null = null;

// ================================================
//  INITIALIZATION
// ================================================
document.addEventListener('DOMContentLoaded', () => {
  log.info('Dashboard opened');
  initTabs();
  initThemeToggle();
  initBotControls();
  initJobSearch();
  initExport();
  initModalControls();
  initDailyGoal();
  loadDashboardData();
});

// ---- Tab Navigation ----
function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLElement>('.sidepanel__tab');
  const contents: Record<string, HTMLElement | null> = {
    overview: document.getElementById('tab-overview'),
    jobs: document.getElementById('tab-jobs'),
    analytics: document.getElementById('tab-analytics'),
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      if (!target) return;
      tabs.forEach((t) => t.classList.remove('sidepanel__tab--active'));
      tab.classList.add('sidepanel__tab--active');
      Object.entries(contents).forEach(([key, el]) => {
        if (el) el.style.display = key === target ? 'flex' : 'none';
      });
    });
  });

  // "View All" button switches to Jobs tab
  document.getElementById('sp-view-all-btn')?.addEventListener('click', () => {
    const jobsTab = document.querySelector<HTMLElement>('[data-tab="jobs"]');
    jobsTab?.click();
  });
}

// ---- Theme Toggle ----
function initThemeToggle(): void {
  const btn = document.getElementById('theme-toggle');
  btn?.addEventListener('click', () => {
    const root = document.documentElement;
    const isLight = root.getAttribute('data-theme') === 'light';
    root.setAttribute('data-theme', isLight ? '' : 'light');
    if (btn) btn.textContent = isLight ? '🌙' : '☀️';
  });
}

// ---- Settings Link ----
document.getElementById('settings-link')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ================================================
//  DATA LOADING
// ================================================
async function loadDashboardData(): Promise<void> {
  const [jobs, session, status] = await Promise.all([
    getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS),
    getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY),
    getStorage<BotStatus>(STORAGE_KEYS.BOT_STATUS),
  ]);

  allJobs = jobs || [];

  if (session) {
    updateOverviewStats(session);
    updateDailyGoal(session);
  }
  if (status) updateBotStatus(status, session);
  if (allJobs.length > 0) {
    renderRecentJobs(allJobs.slice(-8).reverse());
    renderKanban(allJobs);
    renderSparkline(allJobs);
    renderAnalytics(allJobs, session);
  }
}

// ================================================
//  OVERVIEW TAB
// ================================================
function updateOverviewStats(session: SessionSummary): void {
  setText('sp-total-applied', String(session.easyApplied + session.externalCollected));
  setText('sp-today-applied', String(session.easyApplied));

  // Time saved display
  const mins = Math.round(session.estimatedTimeSaved / 60);
  setText('sp-time-saved', mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`);

  // Avg match score
  const matched = allJobs.filter((j) => j.matchScore !== null);
  if (matched.length > 0) {
    const avg = Math.round(matched.reduce((s, j) => s + (j.matchScore || 0), 0) / matched.length);
    setText('sp-match-avg', `${avg}%`);
  }
}

function updateBotStatus(status: BotStatus, session?: SessionSummary | null): void {
  const dot = document.getElementById('sp-status-dot');
  const text = document.getElementById('sp-status-text');
  const startBtn = document.getElementById('sp-start-btn') as HTMLButtonElement;
  const pauseBtn = document.getElementById('sp-pause-btn') as HTMLButtonElement;
  const progress = document.getElementById('sp-progress');
  const sessionStats = document.getElementById('sp-session-stats');

  const statusLabels: Record<BotStatus, string> = {
    idle: 'Idle — Ready to start',
    searching: '🔍 Searching for jobs...',
    filtering: '🎯 Applying filters...',
    applying: '📝 Applying to jobs...',
    paused: '⏸ Paused',
    stopped: '⏹ Stopped',
    error: '⚠️ Error occurred',
  };

  if (dot) { dot.className = `status-dot status-dot--${status}`; }
  if (text) text.textContent = statusLabels[status] || status;

  const isRunning = ['searching', 'filtering', 'applying'].includes(status);
  if (startBtn) {
    startBtn.textContent = isRunning ? '⏹ Stop' : '▶ Start';
    startBtn.className = isRunning ? 'btn btn-error btn-sm' : 'btn btn-primary btn-sm';
  }
  if (pauseBtn) pauseBtn.style.display = isRunning ? 'inline-flex' : 'none';
  if (progress) progress.style.display = isRunning ? 'block' : 'none';
  if (sessionStats) {
    sessionStats.style.display = isRunning || status === 'stopped' ? 'flex' : 'none';
    if (session) {
      setText('sp-sess-applied', String(session.easyApplied));
      setText('sp-sess-skipped', String(session.skipped));
      setText('sp-sess-failed', String(session.failed));
    }
  }
}

// ---- Bot Controls ----
function initBotControls(): void {
  document.getElementById('sp-start-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('sp-start-btn');
    const isRunning = btn?.textContent?.includes('Stop');
    chrome.runtime.sendMessage({
      type: isRunning ? 'STOP_BOT' : 'START_BOT',
      timestamp: Date.now(),
    } as ExtensionMessage);
  });

  document.getElementById('sp-pause-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PAUSE_BOT', timestamp: Date.now() } as ExtensionMessage);
  });
}

// ---- Sparkline (7-day activity) ----
function renderSparkline(jobs: Job[]): void {
  const container = document.getElementById('sp-sparkline');
  if (!container) return;

  const days = getLast7Days();
  const counts = days.map((day) =>
    jobs.filter((j) => j.dateApplied?.startsWith(day.iso)).length
  );
  const max = Math.max(...counts, 1);

  container.innerHTML = days.map((day, i) => `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;">
      <div class="sparkline-bar" style="height:${Math.max(4, (counts[i] / max) * 52)}px;" data-tooltip="${day.label}: ${counts[i]} applied"></div>
      <div class="sparkline-label">${day.short}</div>
    </div>
  `).join('');
}

// ---- Recent Jobs ----
function renderRecentJobs(jobs: Job[]): void {
  const container = document.getElementById('sp-recent-jobs');
  if (!container) return;

  if (jobs.length === 0) {
    container.innerHTML = '<p class="sidepanel__empty-state">No applications yet. Start the bot to begin!</p>';
    return;
  }

  container.innerHTML = jobs.map((job) => `
    <div class="job-card" data-job-id="${job.id}">
      <div class="job-card__title">${esc(job.title)}</div>
      <div class="job-card__company">${esc(job.company)}</div>
      <div class="job-card__meta">
        <span class="badge ${statusBadge(job.status)}">${job.status}</span>
        ${job.matchScore !== null ? `<span class="badge badge-primary">${job.matchScore}%</span>` : ''}
        <span class="job-card__date">${formatDate(job.dateApplied)}</span>
      </div>
    </div>
  `).join('');

  // Click handler for job cards
  container.querySelectorAll('.job-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = (card as HTMLElement).dataset.jobId;
      if (id) openJobModal(id);
    });
  });
}

// ================================================
//  JOBS TAB (KANBAN)
// ================================================
function renderKanban(jobs: Job[], searchTerm = '', filterStatus = 'all'): void {
  let filtered = jobs;

  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    filtered = filtered.filter((j) =>
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q)
    );
  }

  if (filterStatus !== 'all') {
    filtered = filtered.filter((j) => j.status === filterStatus);
  }

  const statuses: JobStatus[] = ['bookmarked', 'applied', 'interview', 'offer', 'rejected'];

  statuses.forEach((status) => {
    const column = document.querySelector(`.kanban__cards[data-status="${status}"]`);
    const countEl = document.querySelector(`.kanban__column[data-status="${status}"] .kanban__count`);
    if (!column) return;

    const statusJobs = filtered.filter((j) => j.status === status);
    if (countEl) countEl.textContent = String(statusJobs.length);

    if (statusJobs.length === 0) {
      column.innerHTML = '<div class="kanban__empty">No jobs</div>';
      return;
    }

    column.innerHTML = statusJobs.slice(0, 30).map((job) => `
      <div class="job-card" data-job-id="${job.id}">
        <div class="job-card__title">${esc(job.title)}</div>
        <div class="job-card__company">${esc(job.company)}</div>
        <div class="job-card__meta">
          ${job.matchScore !== null ? `<span class="badge badge-primary">${job.matchScore}%</span>` : ''}
          <span class="job-card__date">${formatDate(job.dateApplied)}</span>
        </div>
      </div>
    `).join('');

    // Click handlers
    column.querySelectorAll('.job-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.jobId;
        if (id) openJobModal(id);
      });
    });
  });
}

function initJobSearch(): void {
  const searchInput = document.getElementById('job-search-input') as HTMLInputElement;
  const filterSelect = document.getElementById('job-filter-select') as HTMLSelectElement;

  const refresh = () => renderKanban(allJobs, searchInput?.value || '', filterSelect?.value || 'all');

  searchInput?.addEventListener('input', debounce(refresh, 250));
  filterSelect?.addEventListener('change', refresh);
}

// ================================================
//  ANALYTICS TAB
// ================================================
function renderAnalytics(jobs: Job[], session?: SessionSummary | null): void {
  // Summary stats
  const interviews = jobs.filter((j) => j.status === 'interview').length;
  const total = jobs.length;
  const responseRate = total > 0 ? Math.round((interviews / total) * 100) : 0;
  const totalTimeSaved = session?.estimatedTimeSaved || 0;

  setText('an-total', String(total));
  setText('an-interviews', String(interviews));
  setText('an-response-rate', `${responseRate}%`);
  setText('an-total-time', totalTimeSaved >= 3600 ? `${Math.round(totalTimeSaved / 3600)}h` : `${Math.round(totalTimeSaved / 60)}m`);

  renderActivityChart(jobs);
  renderCompaniesChart(jobs);
  renderWorkStyleChart(jobs);
  renderPipeline(jobs);
  renderLocationsChart(jobs);
}

// ---- Activity Over Time (vertical bar chart) ----
function renderActivityChart(jobs: Job[]): void {
  const container = document.getElementById('activity-chart');
  if (!container) return;

  const days = getLast30Days();
  const counts = days.map((day) =>
    jobs.filter((j) => j.dateApplied?.startsWith(day.iso)).length
  );
  const max = Math.max(...counts, 1);

  container.innerHTML = days.map((day, i) => `
    <div class="chart-bar" style="height:${Math.max(2, (counts[i] / max) * 130)}px;" data-tooltip="${day.label}: ${counts[i]}"></div>
  `).join('');
}

// ---- Top Companies (horizontal bar chart) ----
function renderCompaniesChart(jobs: Job[]): void {
  const container = document.getElementById('companies-chart');
  if (!container) return;

  const freq: Record<string, number> = {};
  jobs.forEach((j) => { freq[j.company] = (freq[j.company] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = sorted[0]?.[1] || 1;

  container.innerHTML = sorted.map(([company, count]) => `
    <div class="bar-chart__row">
      <span class="bar-chart__label" title="${esc(company)}">${esc(company)}</span>
      <div class="bar-chart__track">
        <div class="bar-chart__fill" style="width:${(count / max) * 100}%"></div>
      </div>
      <span class="bar-chart__value">${count}</span>
    </div>
  `).join('');
}

// ---- Work Style Donut ----
function renderWorkStyleChart(jobs: Job[]): void {
  const container = document.getElementById('workstyle-chart');
  if (!container) return;

  const styleMap: Record<string, { count: number; color: string }> = {
    Remote: { count: 0, color: '#6366f1' },
    Hybrid: { count: 0, color: '#a78bfa' },
    'On-site': { count: 0, color: '#f59e0b' },
    '': { count: 0, color: '#64748b' },
  };

  jobs.forEach((j) => {
    const style = j.workStyle || '';
    if (styleMap[style]) styleMap[style].count++;
    else styleMap[''].count++;
  });

  const total = jobs.length || 1;
  const entries = Object.entries(styleMap).filter(([, v]) => v.count > 0);

  // Build conic-gradient for donut ring
  let gradientParts: string[] = [];
  let cumPercent = 0;
  entries.forEach(([, v]) => {
    const pct = (v.count / total) * 100;
    gradientParts.push(`${v.color} ${cumPercent}% ${cumPercent + pct}%`);
    cumPercent += pct;
  });

  const donutGradient = `conic-gradient(${gradientParts.join(', ')})`;

  const legend = entries.map(([label, v]) => `
    <div class="donut-legend__item">
      <span class="donut-legend__dot" style="background:${v.color}"></span>
      <span>${label || 'Unknown'}</span>
      <span class="donut-legend__value">${v.count}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="donut-ring" style="background:${donutGradient};-webkit-mask:radial-gradient(circle at center,transparent 35px,#000 36px);mask:radial-gradient(circle at center,transparent 35px,#000 36px);"></div>
    <div class="donut-legend">${legend}</div>
  `;
}

// ---- Pipeline Funnel ----
function renderPipeline(jobs: Job[]): void {
  const container = document.getElementById('pipeline-chart');
  if (!container) return;

  const stages: { label: string; status: JobStatus[]; color: string }[] = [
    { label: 'Applied', status: ['applied', 'external'], color: '#6366f1' },
    { label: 'Interview', status: ['interview'], color: '#8b5cf6' },
    { label: 'Offer', status: ['offer'], color: '#10b981' },
    { label: 'Rejected', status: ['rejected'], color: '#ef4444' },
  ];

  container.innerHTML = stages.map((stage) => {
    const count = jobs.filter((j) => stage.status.includes(j.status)).length;
    return `
      <div class="pipeline__stage" style="background:${stage.color}">
        <span class="pipeline__stage-value">${count}</span>
        <span>${stage.label}</span>
      </div>
    `;
  }).join('');
}

// ---- Top Locations ----
function renderLocationsChart(jobs: Job[]): void {
  const container = document.getElementById('locations-chart');
  if (!container) return;

  const freq: Record<string, number> = {};
  jobs.forEach((j) => {
    const loc = j.location || 'Unknown';
    freq[loc] = (freq[loc] || 0) + 1;
  });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted[0]?.[1] || 1;

  container.innerHTML = sorted.map(([loc, count]) => `
    <div class="bar-chart__row">
      <span class="bar-chart__label" title="${esc(loc)}">${esc(loc)}</span>
      <div class="bar-chart__track">
        <div class="bar-chart__fill" style="width:${(count / max) * 100}%;background:linear-gradient(90deg,#a78bfa,#6366f1)"></div>
      </div>
      <span class="bar-chart__value">${count}</span>
    </div>
  `).join('');
}

// ================================================
//  JOB DETAIL MODAL
// ================================================
function openJobModal(jobId: string): void {
  const job = allJobs.find((j) => j.id === jobId);
  if (!job) return;
  currentJobId = jobId;

  setText('modal-title', job.title);
  setText('modal-company', job.company);
  setText('modal-location', job.location);

  const statusBadgeEl = document.getElementById('modal-status');
  if (statusBadgeEl) {
    statusBadgeEl.textContent = job.status;
    statusBadgeEl.className = `badge ${statusBadge(job.status)}`;
  }

  setText('modal-workstyle', job.workStyle || '—');
  setText('modal-experience', job.experienceRequired || '—');
  setText('modal-date-applied', formatDate(job.dateApplied));
  setText('modal-date-listed', formatDate(job.dateListed));

  const hrLink = document.getElementById('modal-hr-link') as HTMLAnchorElement;
  if (hrLink) {
    hrLink.textContent = job.hrName || '—';
    hrLink.href = job.hrLink || '#';
  }

  // Match score
  const matchRow = document.getElementById('modal-match-row');
  if (matchRow) {
    matchRow.style.display = job.matchScore !== null ? 'flex' : 'none';
    setText('modal-match-score', job.matchScore !== null ? `${job.matchScore}%` : '—');
  }

  // Status changer buttons
  const statusBtns = document.getElementById('modal-status-btns');
  statusBtns?.querySelectorAll('.btn').forEach((btn) => {
    const btnStatus = (btn as HTMLElement).dataset.status;
    btn.classList.toggle('btn--active', btnStatus === job.status);
    (btn as HTMLElement).onclick = () => {
      if (btnStatus) changeJobStatus(jobId, btnStatus as JobStatus);
    };
  });

  // Notes
  const notesEl = document.getElementById('modal-notes') as HTMLTextAreaElement;
  if (notesEl) notesEl.value = job.notes || '';

  // Questions
  const questionsSection = document.getElementById('modal-questions-section');
  const questionsList = document.getElementById('modal-questions');
  const qCount = document.getElementById('modal-q-count');
  if (questionsSection && questionsList && qCount) {
    const qa = job.questionsAnswered || [];
    qCount.textContent = String(qa.length);
    questionsSection.style.display = qa.length > 0 ? 'block' : 'none';
    questionsList.innerHTML = qa.map((q) => `
      <div class="question-item">
        <div class="question-item__q">Q: ${esc(q.question)}</div>
        <div class="question-item__a">A: ${esc(q.answer)}</div>
        <div class="question-item__method badge ${q.answeredBy === 'ai' ? 'badge-primary' : q.answeredBy === 'random' ? 'badge-warning' : 'badge-success'}">${q.answeredBy}</div>
      </div>
    `).join('');
  }

  // Job link
  const jobLink = document.getElementById('modal-job-link') as HTMLAnchorElement;
  if (jobLink) jobLink.href = job.jobLink || '#';

  // Show modal
  const modal = document.getElementById('job-modal');
  if (modal) modal.style.display = 'flex';
}

function initModalControls(): void {
  // Close job modal
  document.getElementById('modal-close')?.addEventListener('click', closeJobModal);
  document.getElementById('job-modal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'job-modal') closeJobModal();
  });

  // Save notes
  document.getElementById('modal-save-btn')?.addEventListener('click', async () => {
    if (!currentJobId) return;
    const notesEl = document.getElementById('modal-notes') as HTMLTextAreaElement;
    const job = allJobs.find((j) => j.id === currentJobId);
    if (job && notesEl) {
      job.notes = notesEl.value;
      await setStorage(STORAGE_KEYS.APPLIED_JOBS, allJobs);
      log.info(`Notes saved for job ${currentJobId}`);
    }
  });

  // Close export modal
  document.getElementById('export-modal-close')?.addEventListener('click', () => {
    const modal = document.getElementById('export-modal');
    if (modal) modal.style.display = 'none';
  });
}

function closeJobModal(): void {
  const modal = document.getElementById('job-modal');
  if (modal) modal.style.display = 'none';
  currentJobId = null;
}

async function changeJobStatus(jobId: string, newStatus: JobStatus): Promise<void> {
  const job = allJobs.find((j) => j.id === jobId);
  if (!job) return;

  job.status = newStatus;
  await setStorage(STORAGE_KEYS.APPLIED_JOBS, allJobs);
  log.info(`Status changed: ${jobId} → ${newStatus}`);

  // Refresh UI
  openJobModal(jobId);
  renderKanban(allJobs);
  renderAnalytics(allJobs);
}

// ================================================
//  DATA EXPORT
// ================================================
function initExport(): void {
  document.getElementById('export-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('export-modal');
    if (modal) modal.style.display = 'flex';
  });

  document.getElementById('export-csv-btn')?.addEventListener('click', () => exportCSV());
  document.getElementById('export-json-btn')?.addEventListener('click', () => exportJSON());
}

function exportCSV(): void {
  if (allJobs.length === 0) return;

  const headers = ['Job ID', 'Title', 'Company', 'Location', 'Work Style', 'Status', 'Date Applied', 'Date Listed', 'Experience Required', 'Job Link', 'Match Score', 'HR Name', 'Notes'];
  const rows = allJobs.map((j) => [
    j.id, j.title, j.company, j.location, j.workStyle, j.status,
    j.dateApplied, j.dateListed, j.experienceRequired, j.jobLink,
    j.matchScore ?? '', j.hrName, j.notes,
  ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  downloadFile(csv, `linkedapply-pro-jobs-${dateSlug()}.csv`, 'text/csv');
  log.info(`Exported ${allJobs.length} jobs as CSV`);
}

function exportJSON(): void {
  if (allJobs.length === 0) return;
  const json = JSON.stringify(allJobs, null, 2);
  downloadFile(json, `linkedapply-pro-jobs-${dateSlug()}.json`, 'application/json');
  log.info(`Exported ${allJobs.length} jobs as JSON`);
}

function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ================================================
//  REAL-TIME UPDATES
// ================================================
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (['JOB_APPLIED', 'JOB_FAILED', 'JOB_SKIPPED', 'STATUS_UPDATE'].includes(message.type)) {
    loadDashboardData();
  }
});

// ================================================
//  HELPERS
// ================================================
function esc(text: string): string {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    applied: 'badge-success', interview: 'badge-warning', offer: 'badge-success',
    rejected: 'badge-error', bookmarked: 'badge-primary', external: 'badge-primary',
    skipped: 'badge-error', failed: 'badge-error',
  };
  return map[status] || 'badge-primary';
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr === 'Unknown' || dateStr === 'Pending') return dateStr || '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function dateSlug(): string {
  return new Date().toISOString().slice(0, 10);
}

function getLast7Days(): { iso: string; short: string; label: string }[] {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({
      iso: d.toISOString().slice(0, 10),
      short: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return days;
}

function getLast30Days(): { iso: string; label: string }[] {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({
      iso: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return days;
}

function debounce(fn: Function, delay: number): (...args: any[]) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ================================================
//  DAILY GOAL
// ================================================
function initDailyGoal(): void {
  const saveBtn = document.getElementById('daily-goal-save');
  const input = document.getElementById('daily-goal-input') as HTMLInputElement;

  saveBtn?.addEventListener('click', async () => {
    const goal = parseInt(input?.value || '25', 10);
    if (isNaN(goal) || goal < 0) return;

    const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY);
    if (session) {
      session.dailyGoal = goal;
      await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);
      updateDailyGoal(session);
      log.info(`Daily goal set to ${goal}`);
    }
  });
}

function updateDailyGoal(session: SessionSummary): void {
  const goal = session.dailyGoal || 25;
  const applied = session.easyApplied || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((applied / goal) * 100)) : 0;

  setText('daily-goal-text', `${applied} / ${goal}`);

  const fill = document.getElementById('daily-goal-fill');
  if (fill) {
    fill.style.width = `${pct}%`;
    if (pct >= 100) {
      fill.classList.add('daily-goal__fill--complete');
    } else {
      fill.classList.remove('daily-goal__fill--complete');
    }
  }

  const input = document.getElementById('daily-goal-input') as HTMLInputElement;
  if (input && !input.matches(':focus')) {
    input.value = String(goal);
  }
}
