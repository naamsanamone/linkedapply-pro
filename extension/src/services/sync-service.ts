/* ============================================================
   LinkedApply Pro — Cloud Sync Service
   Manages background job syncing between extension and cloud
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { Job } from '../shared/types';
import { pushJobsToCloud, pullJobsFromCloud } from './api-client';
import { hasFeature } from './subscription-service';

const log = createLogger('Sync');

const SYNC_TIMESTAMP_KEY = STORAGE_KEYS.LAST_SYNC_TIMESTAMP;

/**
 * Push all local jobs to the cloud.
 * Called after each application and periodically via alarm.
 */
export async function syncToCloud(): Promise<boolean> {
  // Check if user has cloud_sync feature
  const canSync = await hasFeature('cloud_sync');
  if (!canSync) {
    log.debug('Cloud sync not available on current plan');
    return false;
  }

  try {
    const jobs = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS);
    if (!jobs || jobs.length === 0) {
      log.debug('No jobs to sync');
      return true;
    }

    // Only sync jobs modified since last sync
    const lastSync = await getStorage<string>(SYNC_TIMESTAMP_KEY);
    let jobsToSync: Job[];

    if (lastSync) {
      jobsToSync = jobs.filter((j) => {
        const dateApplied = j.dateApplied ? new Date(j.dateApplied).getTime() : 0;
        return dateApplied > new Date(lastSync).getTime();
      });
    } else {
      jobsToSync = jobs; // First sync — push everything
    }

    if (jobsToSync.length === 0) {
      log.debug('No new jobs to sync');
      return true;
    }

    const result = await pushJobsToCloud(jobsToSync);
    if (result?.success) {
      await setStorage(SYNC_TIMESTAMP_KEY, new Date().toISOString());
      log.info(`Synced ${result.synced} jobs to cloud`);
      return true;
    }

    return false;
  } catch (error) {
    log.error('Cloud sync failed', error);
    return false;
  }
}

/**
 * Pull jobs from cloud and merge with local storage.
 * Used for cross-device sync and data recovery.
 */
export async function syncFromCloud(): Promise<number> {
  const canSync = await hasFeature('cloud_sync');
  if (!canSync) return 0;

  try {
    const lastSync = await getStorage<string>(SYNC_TIMESTAMP_KEY);
    const result = await pullJobsFromCloud(lastSync || undefined);

    if (!result?.jobs || result.jobs.length === 0) {
      return 0;
    }

    // Merge with local jobs (cloud wins on conflict)
    const localJobs = await getStorage<Job[]>(STORAGE_KEYS.APPLIED_JOBS) || [];
    const localMap = new Map(localJobs.map((j) => [j.id, j]));

    let newCount = 0;
    for (const cloudJob of result.jobs) {
      if (!localMap.has(cloudJob.id)) {
        localJobs.push(cloudJob);
        newCount++;
      } else {
        // Update local with cloud version (cloud has latest status/notes)
        const idx = localJobs.findIndex((j) => j.id === cloudJob.id);
        if (idx >= 0) localJobs[idx] = { ...localJobs[idx], ...cloudJob };
      }
    }

    await setStorage(STORAGE_KEYS.APPLIED_JOBS, localJobs);
    await setStorage(SYNC_TIMESTAMP_KEY, new Date().toISOString());

    log.info(`Pulled ${result.jobs.length} jobs from cloud (${newCount} new)`);
    return newCount;
  } catch (error) {
    log.error('Cloud pull failed', error);
    return 0;
  }
}

/**
 * Full two-way sync: push local → cloud, then pull cloud → local.
 */
export async function fullSync(): Promise<{ pushed: boolean; pulled: number }> {
  const pushed = await syncToCloud();
  const pulled = await syncFromCloud();
  return { pushed, pulled };
}
