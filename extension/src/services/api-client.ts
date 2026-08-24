/* ============================================================
   LinkedApply Pro — Backend API Client (Extension Side)
   Typed client for all extension ↔ backend communication.
   Used by service-worker.ts and sidepanel.ts.
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Job } from '../shared/types';

const log = createLogger('API');

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// ================================================
//  AUTH HELPERS
// ================================================

async function getAuthToken(): Promise<string | null> {
  return getStorage<string>(STORAGE_KEYS.AUTH_TOKEN);
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
  try {
    const headers = await authHeaders();
    const response = await fetch(`${API_BASE}/api/extension${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = data?.error || `HTTP ${response.status}`;
      log.error(`API error: ${endpoint} → ${errMsg}`);
      return { data: null, error: errMsg, status: response.status };
    }

    return { data: data as T, error: null, status: response.status };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`API request failed: ${endpoint} → ${errMsg}`);
    return { data: null, error: errMsg, status: 0 };
  }
}

// ================================================
//  USAGE TRACKING
// ================================================

export interface RecordUsageResponse {
  success: boolean;
  usage: {
    applicationsToday: number;
    externalToday: number;
    skippedToday: number;
    failedToday: number;
  };
}

/**
 * Record an application action (applied, external, skipped, failed).
 */
export async function recordUsage(
  action: 'applied' | 'external' | 'skipped' | 'failed',
  jobId?: string,
  metadata?: Record<string, any>
): Promise<RecordUsageResponse | null> {
  const { data } = await apiRequest<RecordUsageResponse>(
    '/record-usage',
    {
      method: 'POST',
      body: JSON.stringify({ action, jobId, metadata }),
    }
  );
  return data;
}

export interface UsageHistoryResponse {
  history: Array<{
    date: string;
    applications_count: number;
    external_count: number;
    skipped_count: number;
    failed_count: number;
  }>;
  totals: {
    totalApplied: number;
    totalExternal: number;
    totalSkipped: number;
    totalFailed: number;
  };
  days: number;
}

/**
 * Get usage history for analytics (last N days).
 */
export async function getUsageHistory(days = 30): Promise<UsageHistoryResponse | null> {
  const { data } = await apiRequest<UsageHistoryResponse>(
    `/record-usage?days=${days}`,
    { method: 'GET' }
  );
  return data;
}

// ================================================
//  JOB SYNC
// ================================================

export interface SyncJobsResponse {
  success: boolean;
  synced: number;
  message: string;
}

/**
 * Push local jobs to cloud storage.
 */
export async function pushJobsToCloud(jobs: Job[]): Promise<SyncJobsResponse | null> {
  if (jobs.length === 0) return null;

  const { data } = await apiRequest<SyncJobsResponse>(
    '/sync-jobs',
    {
      method: 'POST',
      body: JSON.stringify({ jobs }),
    }
  );

  if (data?.success) {
    log.info(`${data.synced} jobs synced to cloud`);
  }
  return data;
}

export interface PullJobsResponse {
  jobs: Job[];
  total: number;
  hasMore: boolean;
}

/**
 * Pull jobs from cloud to extension (for cross-device sync).
 */
export async function pullJobsFromCloud(since?: string): Promise<PullJobsResponse | null> {
  const params = since ? `?since=${encodeURIComponent(since)}` : '';
  const { data } = await apiRequest<PullJobsResponse>(
    `/sync-jobs${params}`,
    { method: 'GET' }
  );

  if (data?.jobs) {
    log.info(`Pulled ${data.jobs.length} jobs from cloud`);
  }
  return data;
}

/**
 * Delete a job from cloud storage.
 */
export async function deleteJobFromCloud(jobId: string): Promise<boolean> {
  const { error } = await apiRequest(
    '/sync-jobs',
    {
      method: 'DELETE',
      body: JSON.stringify({ jobId }),
    }
  );
  return !error;
}

// ================================================
//  HEALTH CHECK
// ================================================

/**
 * Quick check if the backend is reachable.
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/auth/session`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
