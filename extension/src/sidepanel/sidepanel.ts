/* ============================================================
   LinkedApply Pro — Side Panel Controller (Phase 4)
   Full dashboard with interactive Kanban, analytics charts,
   job detail modal, search/filter, and data export
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Job, JobStatus, SessionSummary, BotStatus, FailedJob, ExtensionMessage, CoverLetterData, PreApplyReviewData, PreApplyDecision } from '../shared/types';
import { generateCoverLetterPDF, generateCoverLetterDOCX, downloadBlob } from '../services/export/pdf-generator';

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
  initPauseControls();
  initFailedLogToggle();
  initTailorTab();
  loadDashboardData();
  checkPendingReview();
});

// ---- Tab Navigation ----
function initTabs(): void {
  const tabs = document.querySelectorAll<HTMLElement>('.sidepanel__tab');
  const contents: Record<string, HTMLElement | null> = {
    overview: document.getElementById('tab-overview'),
    jobs: document.getElementById('tab-jobs'),
    tailor: document.getElementById('tab-tailor'),
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
  const [jobs, session, status, failedJobs] = await Promise.all([
    getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS),
    getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY),
    getStorage<BotStatus>(STORAGE_KEYS.BOT_STATUS),
    getStorage<FailedJob[]>(STORAGE_KEYS.FAILED_JOBS),
  ]);

  allJobs = jobs || [];

  if (session) {
    updateOverviewStats(session);
    updateDailyGoal(session);
  }
  if (status) updateBotStatus(status, session);
  renderSparkline(allJobs);
  renderAnalytics(allJobs, session);
  if (allJobs.length > 0) {
    renderRecentJobs(allJobs.slice(-8).reverse());
    renderKanban(allJobs);
  }
  renderFailedJobs(failedJobs || []);
}

// ================================================
//  OVERVIEW TAB
// ================================================
function updateOverviewStats(session: SessionSummary): void {
  // Total applied from persistent job records (survives session resets)
  setText('sp-total-applied', String(allJobs.length));

  // Today count: derive from actual job records
  const today = new Date().toISOString().slice(0, 10); // "2026-06-23"
  const todayJobs = allJobs.filter((j) => j.dateApplied && j.dateApplied.startsWith(today));
  setText('sp-today-applied', String(todayJobs.length));

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
    reviewing: '🔍 Reviewing job...',
    paused: '⏸ Paused',
    stopped: '⏹ Stopped',
    error: '⚠️ Error occurred',
  };

  if (dot) { dot.className = `status-dot status-dot--${status}`; }
  if (text) text.textContent = statusLabels[status] || status;

  const isRunning = ['searching', 'filtering', 'applying', 'reviewing'].includes(status);
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
  let isToggling = false;
  document.getElementById('sp-start-btn')?.addEventListener('click', async () => {
    if (isToggling) return;
    isToggling = true;
    const btn = document.getElementById('sp-start-btn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    try {
      const isRunning = btn?.textContent?.includes('Stop');
      await chrome.runtime.sendMessage({
        type: isRunning ? 'STOP_BOT' : 'START_BOT',
        timestamp: Date.now(),
      } as ExtensionMessage);
    } catch (err) {
      log.error('Failed to toggle bot from sidepanel', err);
    } finally {
      setTimeout(() => {
        if (btn) btn.disabled = false;
        isToggling = false;
      }, 600);
    }
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
  const emptyEl = document.getElementById('overview-empty');
  if (!container) return;

  if (jobs.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    container.querySelectorAll('.job-card').forEach(c => c.remove());
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  container.innerHTML = jobs.map((job) => `
    <div class="job-card" data-job-id="${job.id}">
      <div class="job-card__header">
        <div class="job-card__info">
          <div class="job-card__title">${esc(job.title)}</div>
          <div class="job-card__company">${esc(job.company)}</div>
          ${job.location ? `<div class="job-card__location">📍 ${esc(job.location)}</div>` : ''}
        </div>
        ${job.matchScore !== null ? `
          <div class="match-ring match-ring--${matchCategory(job.matchScore)}" title="JD Match: ${job.matchScore}%">
            <svg viewBox="0 0 36 36" class="match-ring__svg">
              <circle cx="18" cy="18" r="15.91" class="match-ring__bg"></circle>
              <circle cx="18" cy="18" r="15.91" class="match-ring__fill" style="stroke-dasharray: ${job.matchScore}, 100;"></circle>
            </svg>
            <span class="match-ring__value">${job.matchScore}%</span>
          </div>
        ` : ''}
      </div>
      <div class="job-card__meta">
        <span class="badge ${statusBadge(job.status)}">${statusLabel(job.status)}</span>
        ${job.workStyle ? `<span class="badge badge-ghost">${workStyleIcon(job.workStyle)} ${job.workStyle}</span>` : ''}
        ${job.tailoredResume ? '<span class="badge badge-accent" title="AI-tailored resume available">📝 Tailored</span>' : ''}
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
  const jobsEmpty = document.getElementById('jobs-empty');
  const kanbanEl = document.getElementById('kanban-board');
  if (jobsEmpty) jobsEmpty.style.display = jobs.length === 0 ? 'flex' : 'none';
  if (kanbanEl) kanbanEl.style.display = jobs.length === 0 ? 'none' : '';
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
        <div class="job-card__header">
          <div class="job-card__info">
            <div class="job-card__title">${esc(job.title)}</div>
            <div class="job-card__company">${esc(job.company)}</div>
          </div>
          ${job.matchScore !== null ? `
            <div class="match-ring match-ring--sm match-ring--${matchCategory(job.matchScore)}" title="${job.matchScore}%">
              <svg viewBox="0 0 36 36" class="match-ring__svg">
                <circle cx="18" cy="18" r="15.91" class="match-ring__bg"></circle>
                <circle cx="18" cy="18" r="15.91" class="match-ring__fill" style="stroke-dasharray: ${job.matchScore}, 100;"></circle>
              </svg>
              <span class="match-ring__value">${job.matchScore}%</span>
            </div>
          ` : ''}
        </div>
        <div class="job-card__meta">
          ${job.tailoredResume ? '<span class="badge badge-accent">📝</span>' : ''}
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
  const analyticsEmpty = document.getElementById('analytics-empty');
  const analyticsContent = document.getElementById('analytics-content');
  const chartCards = document.querySelectorAll('#tab-analytics .sidepanel__chart-card');
  const hasData = jobs.length > 0;
  if (analyticsEmpty) analyticsEmpty.style.display = hasData ? 'none' : 'flex';
  if (analyticsContent) analyticsContent.style.display = hasData ? '' : 'none';
  chartCards.forEach(c => (c as HTMLElement).style.display = hasData ? '' : 'none');

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

  // Match Score Hero
  const matchHero = document.getElementById('modal-match-hero');
  if (matchHero) {
    if (job.matchScore !== null) {
      matchHero.style.display = 'flex';
      const score = job.matchScore;
      const cat = matchCategory(score);
      const catLabels: Record<string, string> = {
        top: '🟢 Top Match', high: '🔵 High Match',
        medium: '🟡 Medium Match', low: '🔴 Low Match',
      };

      // Use AI-generated headline/recommendation if available
      const md = job.matchDetails;
      const headline = md?.headline || catLabels[cat] || cat;
      const recommendation = md?.recommendation || {
        top: 'Excellent fit — strongly recommended to apply',
        high: 'Good match — your skills align well',
        medium: 'Partial match — some gaps in requirements',
        low: 'Weak match — consider skipping this role',
      }[cat] || '';

      setText('modal-match-value', `${score}%`);
      setText('modal-match-category', headline);
      setText('modal-match-recommendation', recommendation);

      // Update ring fill
      const fillEl = document.getElementById('modal-match-fill');
      if (fillEl) {
        fillEl.style.strokeDasharray = `${score}, 100`;
      }

      // Set ring color class
      const ringEl = document.getElementById('modal-match-ring');
      if (ringEl) {
        ringEl.className = `match-hero__ring match-hero__ring--${cat}`;
      }
    } else {
      matchHero.style.display = 'none';
    }
  }

  // Qualification Breakdown
  const qualsSection = document.getElementById('modal-quals-section');
  if (qualsSection) {
    const md = job.matchDetails;
    if (md && (md.requiredQualifications.length > 0 || md.preferredQualifications.length > 0)) {
      qualsSection.style.display = 'block';

      // Header: "Matches X of Y required qualifications:"
      const reqMatched = md.requiredQualifications.filter(q => q.matched).length;
      const reqTotal = md.requiredQualifications.length;
      const headerEl = document.getElementById('modal-quals-header');
      if (headerEl) {
        headerEl.textContent = reqTotal > 0
          ? `Matches ${reqMatched} of ${reqTotal} required qualification${reqTotal !== 1 ? 's' : ''}:`
          : '';
      }

      // Required qualifications list
      const reqList = document.getElementById('modal-required-quals');
      if (reqList) {
        reqList.innerHTML = md.requiredQualifications.map(q => `
          <div class="quals__item">
            <span class="quals__icon ${q.matched ? 'quals__icon--matched' : 'quals__icon--missed'}">
              ${q.matched ? '✓' : '?'}
            </span>
            <span class="quals__text">
              ${esc(q.description)}
              ${q.note ? `<span class="quals__note">(${esc(q.note)})</span>` : ''}
            </span>
          </div>
        `).join('');
      }

      // Preferred qualifications
      const prefDetails = document.getElementById('modal-preferred-details') as HTMLDetailsElement;
      const prefList = document.getElementById('modal-preferred-quals');
      if (prefDetails && prefList) {
        if (md.preferredQualifications.length > 0) {
          prefDetails.style.display = 'block';
          const prefMatched = md.preferredQualifications.filter(q => q.matched).length;
          const prefTotal = md.preferredQualifications.length;
          const summaryEl = prefDetails.querySelector('.quals__preferred-summary');
          if (summaryEl) {
            summaryEl.textContent = `Matches ${prefMatched} of ${prefTotal} preferred qualification${prefTotal !== 1 ? 's' : ''}`;
          }
          prefList.innerHTML = md.preferredQualifications.map(q => `
            <div class="quals__item">
              <span class="quals__icon ${q.matched ? 'quals__icon--matched' : 'quals__icon--missed'}">
                ${q.matched ? '✓' : '?'}
              </span>
              <span class="quals__text">
                ${esc(q.description)}
                ${q.note ? `<span class="quals__note">(${esc(q.note)})</span>` : ''}
              </span>
            </div>
          `).join('');
        } else {
          prefDetails.style.display = 'none';
        }
      }

      // Strengths & Gaps tags
      const sgSection = document.getElementById('modal-strengths-gaps');
      if (sgSection) {
        const hasData = (md.strengths.length > 0 || md.gaps.length > 0);
        sgSection.style.display = hasData ? 'flex' : 'none';
        const strengthsEl = document.getElementById('modal-strengths');
        const gapsEl = document.getElementById('modal-gaps');
        if (strengthsEl) {
          strengthsEl.innerHTML = md.strengths.map(s =>
            `<span class="badge badge-success">${esc(s)}</span>`
          ).join('');
        }
        if (gapsEl) {
          gapsEl.innerHTML = md.gaps.map(g =>
            `<span class="badge badge-warning">${esc(g)}</span>`
          ).join('');
        }
      }
    } else {
      qualsSection.style.display = 'none';
    }
  }

  // Keep old hidden row for backward compat
  const matchRow = document.getElementById('modal-match-row');
  if (matchRow) {
    matchRow.style.display = 'none';
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

  // ========== 4-TAB SETUP ==========
  // Tab switching
  document.querySelectorAll('.modal-tab').forEach(tab => {
    (tab as HTMLElement).onclick = () => {
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelId = (tab as HTMLElement).dataset.tab;
      if (panelId) document.getElementById(panelId)?.classList.add('active');
    };
  });
  // Reset to Match tab
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.modal-tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.modal-tab[data-tab="tab-match"]')?.classList.add('active');
  document.getElementById('tab-match')?.classList.add('active');

  // Helper: show one of content/generate/loading
  const showTabState = (prefix: string, state: 'content' | 'generate' | 'loading') => {
    ['content', 'generate', 'loading'].forEach(s => {
      const el = document.getElementById(`${prefix}-${s}`);
      if (el) el.style.display = s === state ? (s === 'content' ? 'block' : (s === 'loading' ? 'flex' : 'block')) : 'none';
    });
  };

  // ---- TAB 1: Match ----
  const md = job.matchDetails;
  if (md && job.matchScore !== null) {
    showTabState('tab-match', 'content');
    const matchCard = document.getElementById('modal-match-card-inner');
    if (matchCard) matchCard.style.display = 'block';
    setText('modal-match-score-tab', `${job.matchScore}%`);
    setText('modal-match-headline-tab', md.headline || '—');
    setText('modal-match-rec-tab', md.recommendation || '—');

    // Qualifications list ✓/?
    const allQuals = [...(md.requiredQualifications || []), ...(md.preferredQualifications || [])];
    const matched = allQuals.filter(q => q.matched).length;
    setText('modal-quals-matched-tab', String(matched));
    setText('modal-quals-total-tab', String(allQuals.length));
    const qualsListEl = document.getElementById('modal-quals-list-tab');
    if (qualsListEl) {
      qualsListEl.innerHTML = allQuals.map(q => `
        <div class="qual-item ${q.matched ? 'qual-item--matched' : 'qual-item--missed'}">
          <span class="qual-icon">${q.matched ? '✓' : '?'}</span>
          <span>${esc(q.description)}${q.note ? ` <em style="opacity:0.7">(${esc(q.note)})</em>` : ''}</span>
        </div>
      `).join('');
    }

    // Strengths/Gaps
    const strengthsEl = document.getElementById('modal-strengths-tab');
    if (strengthsEl) strengthsEl.innerHTML = (md.strengths || []).map(s => `<span class="badge badge-success">${esc(s)}</span>`).join('');
    const gapsEl = document.getElementById('modal-gaps-tab');
    if (gapsEl) gapsEl.innerHTML = (md.gaps || []).map(g => `<span class="badge badge-warning">${esc(g)}</span>`).join('');
  } else {
    showTabState('tab-match', 'generate');
    const matchCard = document.getElementById('modal-match-card-inner');
    if (matchCard) matchCard.style.display = 'none';
  }

  // ---- TAB 2: Resume ----
  const tr = job.tailoredResume;
  if (tr) {
    showTabState('tab-resume', 'content');
    setText('modal-ats-score', String(tr.atsScore));
    const summaryEl = document.getElementById('modal-tailored-summary');
    if (summaryEl) summaryEl.textContent = tr.summary;
    const skillsEl = document.getElementById('modal-tailored-skills');
    if (skillsEl) skillsEl.innerHTML = tr.skills.map(s => `<span class="badge badge-primary">${esc(s)}</span>`).join('');
    const expEl = document.getElementById('modal-tailored-experience');
    if (expEl) {
      expEl.innerHTML = tr.experience.map(exp => `
        <div class="tailored-exp">
          <div class="tailored-exp__header">
            <span class="tailored-exp__title">${esc(exp.title)}</span>
            <span class="tailored-exp__company">${esc(exp.company)}</span>
          </div>
          <div class="tailored-exp__duration">${esc(exp.duration)}</div>
          <ul class="tailored-exp__bullets">${exp.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>
        </div>
      `).join('');
    }
    const kwEl = document.getElementById('modal-tailored-keywords');
    if (kwEl) kwEl.innerHTML = tr.keywordsAdded.map(kw => `<span class="badge badge-success">+ ${esc(kw)}</span>`).join('');
    const copyBtn = document.getElementById('modal-copy-tailored');
    if (copyBtn) {
      copyBtn.onclick = () => {
        const text = formatTailoredResumeText(tr);
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
        });
      };
    }
  } else {
    showTabState('tab-resume', 'generate');
  }

  // ---- TAB 3: Cover Letter ----
  const cl = job.coverLetter;
  if (cl) {
    showTabState('tab-cl', 'content');
    setText('modal-cl-subject', cl.subject);
    const previewEl = document.getElementById('modal-cl-preview');
    if (previewEl) previewEl.textContent = cl.plainText;
    const copyCl = document.getElementById('modal-copy-cl');
    if (copyCl) {
      copyCl.onclick = () => {
        navigator.clipboard.writeText(cl.plainText).then(() => {
          copyCl.textContent = '✓ Copied!';
          setTimeout(() => { copyCl.textContent = '📋 Copy'; }, 2000);
        });
      };
    }
    const dlPdf = document.getElementById('modal-dl-pdf');
    if (dlPdf) {
      dlPdf.onclick = () => {
        try {
          const blob = generateCoverLetterPDF(cl);
          downloadBlob(blob, `CoverLetter_${cl.company.replace(/\s+/g, '_')}.pdf`);
          dlPdf.textContent = '✓ Downloaded!';
          setTimeout(() => { dlPdf.textContent = '📄 Download PDF'; }, 2000);
        } catch (e) { log.error('PDF failed', e); }
      };
    }
    const dlDocx = document.getElementById('modal-dl-docx');
    if (dlDocx) {
      dlDocx.onclick = async () => {
        try {
          const blob = await generateCoverLetterDOCX(cl);
          downloadBlob(blob, `CoverLetter_${cl.company.replace(/\s+/g, '_')}.docx`);
          dlDocx.textContent = '✓ Downloaded!';
          setTimeout(() => { dlDocx.textContent = '📝 Download DOCX'; }, 2000);
        } catch (e) { log.error('DOCX failed', e); }
      };
    }
  } else {
    showTabState('tab-cl', 'generate');
  }

  // ---- TAB 4: Stand Out ----
  const tips = job.standOutTips;
  if (tips) {
    showTabState('tab-standout', 'content');
    const renderTips = (id: string, items: string[]) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = items.map(t => `<div class="standout-tip">${esc(t)}</div>`).join('');
    };
    renderTips('modal-so-skills', tips.highlightSkills || []);
    renderTips('modal-so-achievements', tips.highlightAchievements || []);
    renderTips('modal-so-improvements', tips.profileImprovements || []);
  } else {
    showTabState('tab-standout', 'generate');
  }

  // ---- On-demand Generate Buttons ----
  const setupGenerateBtn = (btnId: string, tabPrefix: string, msgType: string) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.onclick = async () => {
        showTabState(tabPrefix, 'loading');
        try {
          const resp = await chrome.runtime.sendMessage({
            type: msgType,
            payload: { jobTitle: job.title, company: job.company, jobDescription: job.description || '' },
            timestamp: Date.now(),
          });
          if (resp?.result) {
            // Refresh job data and reopen modal
            const jobs = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS) || [];
            const idx = jobs.findIndex(j => j.jobId === jobId);
            if (idx >= 0) {
              if (msgType === 'AI_MATCH_JOB') { jobs[idx].matchScore = resp.result.score; jobs[idx].matchDetails = resp.result; }
              if (msgType === 'AI_TAILOR_RESUME') { jobs[idx].tailoredResume = resp.result; }
              if (msgType === 'AI_COVER_LETTER') { jobs[idx].coverLetter = resp.result; }
              if (msgType === 'AI_STANDOUT_TIPS') { jobs[idx].standOutTips = resp.result; }
              await setStorage(STORAGE_KEYS.APPLIED_JOBS, jobs);
              allJobs = jobs;
              openJobModal(jobId); // re-open with new data
            }
          } else {
            showTabState(tabPrefix, 'generate');
            log.warn(`Generate failed: ${resp?.error}`);
          }
        } catch (e) {
          showTabState(tabPrefix, 'generate');
          log.error('On-demand generate failed', e);
        }
      };
    }
  };

  setupGenerateBtn('btn-generate-match', 'tab-match', 'AI_MATCH_JOB');
  setupGenerateBtn('btn-generate-resume', 'tab-resume', 'AI_TAILOR_RESUME');
  setupGenerateBtn('btn-generate-cl', 'tab-cl', 'AI_COVER_LETTER');
  setupGenerateBtn('btn-generate-standout', 'tab-standout', 'AI_STANDOUT_TIPS');

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

function formatTailoredResumeText(tr: { summary: string; skills: string[]; experience: { title: string; company: string; duration: string; bullets: string[] }[]; keywordsAdded: string[] }): string {
  const lines: string[] = [
    'PROFESSIONAL SUMMARY',
    tr.summary,
    '',
    'KEY SKILLS',
    tr.skills.join(', '),
    '',
    'EXPERIENCE',
  ];
  for (const exp of tr.experience) {
    lines.push(`${exp.title} — ${exp.company} (${exp.duration})`);
    for (const bullet of exp.bullets) {
      lines.push(`  • ${bullet}`);
    }
    lines.push('');
  }
  lines.push('KEYWORDS OPTIMIZED');
  lines.push(tr.keywordsAdded.join(', '));
  return lines.join('\n');
}

// ================================================
//  REAL-TIME UPDATES
// ================================================
chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (['JOB_APPLIED', 'JOB_FAILED', 'JOB_SKIPPED', 'STATUS_UPDATE'].includes(message.type)) {
    loadDashboardData();
  }
  if (message.type === 'PAUSE_BEFORE_SUBMIT') {
    showPauseBanner(message.payload?.message);
  }
  if (message.type === 'PRE_APPLY_REVIEW') {
    showPreApplyReview(message.payload as PreApplyReviewData);
  }
});

// ================================================
//  PRE-APPLY REVIEW PANEL
// ================================================
let reviewCountdownTimer: ReturnType<typeof setInterval> | null = null;
let currentReviewData: PreApplyReviewData | null = null;

/** Check if there's a pending pre-apply review in storage (e.g. sidepanel opened after review started) */
async function checkPendingReview(): Promise<void> {
  const reviewData = await getStorage<PreApplyReviewData>(STORAGE_KEYS.PRE_APPLY_REVIEW);
  if (reviewData && reviewData.jobId) {
    log.info('📋 Found pending pre-apply review in storage, showing overlay');
    showPreApplyReview(reviewData);
  }
}

function showPreApplyReview(data: PreApplyReviewData): void {
  currentReviewData = data;
  const panel = document.getElementById('pre-apply-review');
  if (!panel) return;

  log.info(`🔍 Showing pre-apply review for "${data.title}" at ${data.company} | Match: ${data.matchScore ?? 'N/A'}% | ATS: ${data.tailoredResume?.atsScore ?? 'N/A'} | Type: ${data.isEasyApply ? 'Easy Apply' : 'External'}`);
  panel.style.display = 'flex';

  // Populate header
  setText('review-title', data.title);
  setText('review-company', data.company);
  const typeBadge = document.getElementById('review-apply-type');
  if (typeBadge) typeBadge.textContent = data.isEasyApply ? 'Easy Apply' : 'External';

  // Match score
  if (data.matchScore !== null) {
    setText('review-match-score', `${data.matchScore}%`);
    const scoreEl = document.getElementById('review-match-score');
    if (scoreEl) {
      scoreEl.style.color = data.matchScore >= 80 ? '#10b981' : data.matchScore >= 60 ? '#6366f1' : data.matchScore >= 40 ? '#f59e0b' : '#ef4444';
    }
    if (data.matchDetails) {
      setText('review-match-headline', data.matchDetails.headline);
      const reqMatched = data.matchDetails.requiredQualifications.filter(q => q.matched).length;
      const reqTotal = data.matchDetails.requiredQualifications.length;
      setText('review-match-quals', `✅ ${reqMatched}/${reqTotal} required qualifications met`);

      // Strengths
      const strengthsEl = document.getElementById('review-strengths');
      if (strengthsEl) {
        strengthsEl.innerHTML = data.matchDetails.strengths.map(s => `<span class="badge">${esc(s)}</span>`).join('');
      }
      // Gaps
      const gapsEl = document.getElementById('review-gaps');
      if (gapsEl) {
        gapsEl.innerHTML = data.matchDetails.gaps.length > 0
          ? data.matchDetails.gaps.map(g => `<span class="badge">${esc(g)}</span>`).join('')
          : '<span class="badge">No gaps identified ✅</span>';
      }
    }
  } else {
    const matchCard = document.getElementById('review-match-card');
    if (matchCard) matchCard.style.display = 'none';
  }

  // Tailored resume
  if (data.tailoredResume) {
    setText('review-ats-score', String(data.tailoredResume.atsScore));
    const kwEl = document.getElementById('review-keywords');
    if (kwEl) {
      kwEl.innerHTML = data.tailoredResume.keywordsAdded.map(k => `<span class="badge">${esc(k)}</span>`).join('');
    }
  } else {
    const resumeCard = document.getElementById('review-resume-card');
    if (resumeCard) resumeCard.style.display = 'none';
  }

  // Reset on-demand sections
  const clContent = document.getElementById('review-cl-content');
  if (clContent) clContent.innerHTML = '<button class="btn btn-outline btn-sm" id="review-gen-cl">🔄 Generate Cover Letter</button>';
  const soContent = document.getElementById('review-so-content');
  if (soContent) soContent.innerHTML = '<button class="btn btn-outline btn-sm" id="review-gen-so">🔄 Generate Stand-Out Tips</button>';

  // Wire up on-demand buttons
  document.getElementById('review-gen-cl')?.addEventListener('click', generateCoverLetterOnDemand);
  document.getElementById('review-gen-so')?.addEventListener('click', generateStandOutOnDemand);

  // Wire up action buttons
  document.getElementById('review-apply-tailored')?.addEventListener('click', () => submitReviewDecision('apply_tailored'));
  document.getElementById('review-apply-default')?.addEventListener('click', () => submitReviewDecision('apply_default'));
  document.getElementById('review-skip')?.addEventListener('click', () => submitReviewDecision('skip'));

  // Wire up download/copy buttons
  document.getElementById('review-download-resume')?.addEventListener('click', downloadTailoredResume);
  document.getElementById('review-copy-resume')?.addEventListener('click', copyTailoredResume);

  // Start countdown timer
  log.info(`⏱ Pre-apply countdown started: ${30}s`);
  startReviewCountdown(30);
}

function hidePreApplyReview(): void {
  const panel = document.getElementById('pre-apply-review');
  if (panel) panel.style.display = 'none';
  if (reviewCountdownTimer) {
    clearInterval(reviewCountdownTimer);
    reviewCountdownTimer = null;
  }
  currentReviewData = null;
}

function startReviewCountdown(seconds: number): void {
  if (reviewCountdownTimer) clearInterval(reviewCountdownTimer);

  let remaining = seconds;
  const secondsEl = document.getElementById('review-seconds');
  const fillEl = document.getElementById('review-timer-fill');

  if (secondsEl) secondsEl.textContent = String(remaining);
  if (fillEl) fillEl.style.width = '100%';

  reviewCountdownTimer = setInterval(() => {
    remaining--;
    if (secondsEl) secondsEl.textContent = String(Math.max(0, remaining));
    if (fillEl) fillEl.style.width = `${(remaining / seconds) * 100}%`;

    if (remaining <= 0) {
      // Timeout — auto-apply with tailored resume
      submitReviewDecision('apply_tailored');
    }
  }, 1000);
}

async function submitReviewDecision(action: 'apply_tailored' | 'apply_default' | 'skip'): Promise<void> {
  if (!currentReviewData) return;

  const decision: PreApplyDecision = {
    action,
    jobId: currentReviewData.jobId,
    timestamp: Date.now(),
  };

  log.info(`✅ Pre-apply decision: ${action} for "${currentReviewData.title}" — writing to storage`);
  await setStorage(STORAGE_KEYS.PRE_APPLY_DECISION, decision);
  log.info(`📝 Decision written to storage: ${JSON.stringify(decision)}`);
  hidePreApplyReview();
}

async function generateCoverLetterOnDemand(): Promise<void> {
  if (!currentReviewData) return;
  const btn = document.getElementById('review-gen-cl');
  if (btn) btn.textContent = '⏳ Generating...';
  log.info(`📧 On-demand: Generating cover letter for "${currentReviewData.title}"...`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_COVER_LETTER',
      payload: {
        jobTitle: currentReviewData.title,
        company: currentReviewData.company,
        jobDescription: currentReviewData.jobDescription,
      },
      timestamp: Date.now(),
    });

    if (response?.result) {
      const cl = response.result as CoverLetterData;
      log.info(`📧 Cover letter generated successfully (${cl.plainText.length} chars)`);
      const clContent = document.getElementById('review-cl-content');
      if (clContent) {
        clContent.innerHTML = `
          <div class="review-cl__text">${esc(cl.plainText).replace(/\n/g, '<br>')}</div>
          <div class="review-resume__actions" style="margin-top:0.5rem">
            <button class="btn btn-ghost btn-sm" id="review-copy-cl">📋 Copy</button>
          </div>
        `;
        document.getElementById('review-copy-cl')?.addEventListener('click', () => {
          navigator.clipboard.writeText(cl.plainText);
        });
      }
    } else {
      if (btn) btn.textContent = '❌ Failed — Try Again';
    }
  } catch (e) {
    if (btn) btn.textContent = '❌ Failed — Try Again';
  }
}

async function generateStandOutOnDemand(): Promise<void> {
  if (!currentReviewData) return;
  const btn = document.getElementById('review-gen-so');
  if (btn) btn.textContent = '⏳ Generating...';
  log.info(`💡 On-demand: Generating stand-out tips for "${currentReviewData.title}"...`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_STANDOUT_TIPS',
      payload: {
        jobTitle: currentReviewData.title,
        company: currentReviewData.company,
        jobDescription: currentReviewData.jobDescription,
      },
      timestamp: Date.now(),
    });

    if (response?.result) {
      const tips = response.result;
      log.info(`💡 Stand-out tips generated: ${tips.highlightSkills?.length || 0} skills, ${tips.highlightAchievements?.length || 0} achievements`);
      const soContent = document.getElementById('review-so-content');
      if (soContent) {
        const items = [
          ...tips.highlightSkills.map((s: string) => `<li>🎯 ${esc(s)}</li>`),
          ...tips.highlightAchievements.map((a: string) => `<li>🏆 ${esc(a)}</li>`),
          ...tips.profileImprovements.map((p: string) => `<li>📈 ${esc(p)}</li>`),
        ];
        soContent.innerHTML = `<ul class="review-so__list">${items.join('')}</ul>`;
      }
    } else {
      if (btn) btn.textContent = '❌ Failed — Try Again';
    }
  } catch (e) {
    if (btn) btn.textContent = '❌ Failed — Try Again';
  }
}

async function downloadTailoredResume(): Promise<void> {
  if (!currentReviewData?.tailoredResume) return;
  try {
    const { generateTailoredResumePDF } = await import('../services/resume-pdf-generator');
    const resume = currentReviewData.tailoredResume;
    const blob = generateTailoredResumePDF(resume.sections || [], 1);
    downloadBlob(blob, `tailored-resume-${currentReviewData.company}.pdf`);
    log.info(`📥 Tailored resume PDF downloaded for ${currentReviewData.company}`);
  } catch (e) {
    log.warn('Failed to generate resume PDF', e);
  }
}

function copyTailoredResume(): void {
  if (!currentReviewData?.tailoredResume) return;
  const resume = currentReviewData.tailoredResume;
  const lines: string[] = [];
  (resume.sections || []).forEach((s: any) => {
    lines.push(s.name.toUpperCase());
    if (s.type === 'summary' && s.text) lines.push(s.text);
    if (s.type === 'skills' && s.categories) {
      Object.entries(s.categories).forEach(([cat, val]) => lines.push(`${cat}: ${val}`));
    }
    if (s.type === 'experience' || s.type === 'projects') {
      (s.entries || []).forEach((e: any) => {
        lines.push(`${e.company || e.name} — ${e.title || e.techStack || ''} (${e.duration})`);
        (e.bullets || []).forEach((b: string) => lines.push(`• ${b}`));
      });
    }
    if (s.type === 'education') {
      (s.entries || []).forEach((e: any) => lines.push(`${e.institution} — ${e.degree} (${e.year})`));
    }
    if (s.type === 'list') {
      (s.items || []).forEach((item: string) => lines.push(`• ${item}`));
    }
    lines.push('');
  });
  navigator.clipboard.writeText(lines.join('\n'));
}

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

function matchBadge(score: number): string {
  if (score >= 80) return 'badge-success';   // 🟢 Top
  if (score >= 60) return 'badge-primary';   // 🔵 High
  if (score >= 40) return 'badge-warning';   // 🟡 Medium
  return 'badge-error';                       // 🔴 Low
}

function matchCategory(score: number): string {
  if (score >= 80) return 'top';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    applied: '✅ Applied', external: '🔗 External', interview: '🎯 Interview',
    offer: '🎉 Offer', rejected: '❌ Rejected', bookmarked: '📌 Saved',
    skipped: '⏭ Skipped', failed: '❌ Failed',
  };
  return labels[status] || status;
}

function workStyleIcon(style: string): string {
  const icons: Record<string, string> = { Remote: '🏠', Hybrid: '🏢', 'On-site': '🏛️' };
  return icons[style] || '';
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
  const resetBtn = document.getElementById('daily-goal-reset');
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

  resetBtn?.addEventListener('click', async () => {
    const session = await getStorage<SessionSummary>(STORAGE_KEYS.SESSION_SUMMARY);
    if (session) {
      session.easyApplied = 0;
      session.externalCollected = 0;
      session.failed = 0;
      session.skipped = 0;
      session.randomAnswers = 0;
      session.estimatedTimeSaved = 0;
      session.startTime = '';
      session.endTime = '';
      session.totalRuns = 0;
      await setStorage(STORAGE_KEYS.SESSION_SUMMARY, session);
      log.info('Session counters reset');
      loadDashboardData();
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

// ================================================
//  FAILED JOBS LOG
// ================================================
function initFailedLogToggle(): void {
  const toggle = document.getElementById('failed-log-toggle');
  const list = document.getElementById('failed-log-list');
  const clearBtn = document.getElementById('failed-log-clear');

  toggle?.addEventListener('click', (e) => {
    // Don't toggle if clicking the Clear button
    if ((e.target as HTMLElement).id === 'failed-log-clear') return;
    if (list) {
      list.style.display = list.style.display === 'none' ? '' : 'none';
    }
  });

  clearBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await setStorage(STORAGE_KEYS.FAILED_JOBS, []);
    renderFailedJobs([]);
    log.info('Failed jobs log cleared');
  });
}

function renderFailedJobs(failed: FailedJob[]): void {
  const countEl = document.getElementById('failed-count');
  const listEl = document.getElementById('failed-log-list');
  if (!listEl) return;

  if (countEl) countEl.textContent = String(failed.length);

  if (failed.length === 0) {
    listEl.innerHTML = '<div class="failed-log__empty">No failed applications yet 🎉</div>';
    return;
  }

  const items = failed.slice(-50).reverse();
  listEl.innerHTML = items.map((f) => `
    <div class="failed-log__item">
      <div class="failed-log__item-header">
        <span class="failed-log__job-title">${esc(f.title)}</span>
        <button class="btn btn-xs btn-outline btn-retry" data-url="${esc(f.jobLink || '')}">Retry</button>
      </div>
      <span class="failed-log__company">${esc(f.company)}</span>
      <span class="failed-log__error">⚠ ${esc(f.error)}</span>
      <span class="failed-log__time">${formatDate(f.timestamp)}</span>
    </div>
  `).join('');

  // Attach event listeners for Retry buttons
  listEl.querySelectorAll('.btn-retry').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = (e.currentTarget as HTMLElement).getAttribute('data-url');
      if (url) {
        log.info('Requesting retry for:', url);
        chrome.runtime.sendMessage({
          type: 'RETRY_JOB',
          payload: { jobLink: url },
          timestamp: Date.now()
        } as ExtensionMessage);
      }
    });
  });
}

// ================================================
//  PAUSE BEFORE SUBMIT
// ================================================
function initPauseControls(): void {
  const confirmBtn = document.getElementById('pause-confirm');
  const rejectBtn = document.getElementById('pause-reject');

  confirmBtn?.addEventListener('click', async () => {
    await chrome.storage.local.set({ submit_confirmed: true });
    hidePauseBanner();
    log.info('User confirmed submission');
  });

  rejectBtn?.addEventListener('click', async () => {
    await chrome.storage.local.set({ submit_confirmed: false });
    hidePauseBanner();
    log.info('User rejected submission');
  });
}

function showPauseBanner(message?: string): void {
  const banner = document.getElementById('pause-banner');
  if (banner) {
    banner.style.display = '';
    const textEl = document.getElementById('pause-banner-text');
    if (textEl && message) {
      textEl.textContent = message;
    }
  }
}

function hidePauseBanner(): void {
  const banner = document.getElementById('pause-banner');
  if (banner) banner.style.display = 'none';
}

// ---- On-Demand Resume Tailor Tab ----
let lastTailoredData: any = null;
let tailorResumeText: string | null = null;

function initTailorTab(): void {
  const generateBtn = document.getElementById('tailor-generate-btn');
  const downloadBtn = document.getElementById('tailor-download-btn');
  const copyBtn = document.getElementById('tailor-copy-btn');
  const uploadBtn = document.getElementById('tailor-resume-upload-btn');
  const fileInput = document.getElementById('tailor-resume-upload') as HTMLInputElement;

  generateBtn?.addEventListener('click', handleTailorGenerate);
  downloadBtn?.addEventListener('click', handleTailorDownload);
  copyBtn?.addEventListener('click', handleTailorCopy);
  uploadBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', handleTailorResumeUpload);
}

async function handleTailorResumeUpload(): Promise<void> {
  const fileInput = document.getElementById('tailor-resume-upload') as HTMLInputElement;
  const statusEl = document.getElementById('tailor-resume-status')!;
  const file = fileInput?.files?.[0];
  if (!file) return;

  try {
    statusEl.textContent = '⏳ Parsing...';

    if (file.name.endsWith('.txt')) {
      tailorResumeText = await file.text();
    } else if (file.name.endsWith('.pdf')) {
      const { extractTextFromPDF } = await import('../services/resume-parser');
      tailorResumeText = await extractTextFromPDF(file);
    } else {
      statusEl.textContent = '❌ Only PDF or TXT files';
      return;
    }

    const wordCount = tailorResumeText.split(/\s+/).filter(Boolean).length;
    statusEl.textContent = `✅ ${file.name} (${wordCount} words)`;
    statusEl.style.color = 'var(--color-success, #22c55e)';
    log.info(`Tailor tab: uploaded ${file.name} — ${wordCount} words`);
  } catch (err: any) {
    statusEl.textContent = `❌ Parse failed: ${err.message}`;
    statusEl.style.color = 'var(--color-danger, #ef4444)';
    tailorResumeText = null;
  }
}

async function handleTailorGenerate(): Promise<void> {
  const jdInput = document.getElementById('tailor-jd-input') as HTMLTextAreaElement;
  const statusEl = document.getElementById('tailor-status')!;
  const resultEl = document.getElementById('tailor-result')!;
  const generateBtn = document.getElementById('tailor-generate-btn') as HTMLButtonElement;

  const jd = jdInput?.value?.trim();
  if (!jd || jd.length < 50) {
    statusEl.style.display = 'block';
    statusEl.style.background = 'var(--color-bg-warning, #fff3cd)';
    statusEl.textContent = '⚠ Please paste a full job description (at least 50 characters)';
    return;
  }

  // Show loading
  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ Generating...';
  statusEl.style.display = 'block';
  statusEl.style.background = 'var(--color-bg-secondary)';
  statusEl.textContent = '🔄 Extracting JD keywords & matching resume... (2-5s)';
  resultEl.style.display = 'none';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_TAILOR_RESUME',
      payload: { 
        jobDescription: jd,
        resumeOverride: tailorResumeText || undefined,
      },
      timestamp: Date.now(),
    });

    if (response?.error) {
      statusEl.style.background = 'var(--color-bg-danger, #f8d7da)';
      statusEl.textContent = `❌ ${response.error}`;
      return;
    }

    if (!response?.result) {
      statusEl.textContent = '❌ No result returned from AI';
      return;
    }

    lastTailoredData = response.result;
    const r = response.result;

    // Show result
    statusEl.style.display = 'none';
    resultEl.style.display = 'block';

    // ATS Score
    const atsEl = document.getElementById('tailor-ats-score')!;
    atsEl.textContent = `ATS: ${r.atsScore}/100`;
    atsEl.style.color = r.atsScore >= 80 ? 'var(--color-success)' : 'var(--color-warning)';

    // Keywords
    const kwEl = document.getElementById('tailor-keywords')!;
    kwEl.textContent = `Keywords added: ${(r.keywordsAdded || []).join(', ')}`;

    // Skills preview (find skills section)
    const skillsEl = document.getElementById('tailor-skills-preview')!;
    const skillsSection = (r.sections || []).find((s: any) => s.type === 'skills');
    if (skillsSection?.categories && Object.keys(skillsSection.categories).length > 0) {
      skillsEl.innerHTML = Object.entries(skillsSection.categories)
        .map(([cat, skills]) => `<div><strong>${cat}:</strong> ${skills}</div>`)
        .join('');
    } else if (r.allSkills?.length > 0) {
      skillsEl.textContent = r.allSkills.join(', ');
    }

    // Experience preview (find experience section)
    const expEl = document.getElementById('tailor-experience-preview')!;
    const expSection = (r.sections || []).find((s: any) => s.type === 'experience');
    expEl.innerHTML = (expSection?.entries || []).map((e: any) =>
      `<div style="margin-bottom: 8px;"><strong>${e.company}</strong> — ${e.title}<br>` +
      `<em>${e.duration}</em><br>` +
      `<ul style="margin: 4px 0; padding-left: 16px;">${(e.bullets || []).map((b: string) => `<li>${b}</li>`).join('')}</ul></div>`
    ).join('');

    log.info(`✨ Resume tailored on-demand — ATS: ${r.atsScore}%, ${(r.keywordsAdded || []).length} keywords`);
  } catch (err: any) {
    statusEl.style.background = 'var(--color-bg-danger, #f8d7da)';
    statusEl.textContent = `❌ ${err.message || 'Failed to tailor resume'}`;
    log.error('On-demand tailoring failed', err);
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '🚀 Generate Tailored Resume';
  }
}

async function handleTailorDownload(): Promise<void> {
  if (!lastTailoredData) return;
  try {
    const { generateTailoredResumePDF } = await import('../services/resume-pdf-generator');
    const blob = generateTailoredResumePDF(lastTailoredData.sections || [], 1);
    downloadBlob(blob, 'tailored_resume.pdf');
    log.info('📥 On-demand tailored resume downloaded');
  } catch (e) {
    log.error('Failed to download tailored PDF', e);
  }
}

function handleTailorCopy(): void {
  if (!lastTailoredData) return;
  const r = lastTailoredData;
  const lines: string[] = [];
  (r.sections || []).forEach((s: any) => {
    lines.push(s.name.toUpperCase());
    if (s.type === 'summary' && s.text) lines.push(s.text);
    if (s.type === 'skills' && s.categories) {
      Object.entries(s.categories).forEach(([cat, val]) => lines.push(`${cat}: ${val}`));
    }
    if (s.type === 'experience' || s.type === 'projects') {
      (s.entries || []).forEach((e: any) => {
        lines.push(`${e.company || e.name} — ${e.title || e.techStack || ''} (${e.duration})`);
        (e.bullets || []).forEach((b: string) => lines.push(`• ${b}`));
      });
    }
    if (s.type === 'education') {
      (s.entries || []).forEach((e: any) => lines.push(`${e.institution} — ${e.degree} (${e.year})`));
    }
    if (s.type === 'list') {
      (s.items || []).forEach((item: string) => lines.push(`• ${item}`));
    }
    lines.push('');
  });
  navigator.clipboard.writeText(lines.join('\n'));
  log.info('📋 Tailored resume copied to clipboard');
}
