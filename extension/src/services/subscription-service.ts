/* ============================================================
   LinkedApply Pro — Subscription Service (BYOK - All Free)
   All features are unlocked. Only tracks daily application count.
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';

const log = createLogger('Subscription');

/**
 * All features are free in BYOK mode. Always returns true.
 */
export async function hasFeature(_feature: string): Promise<boolean> {
  return true;
}

/**
 * Check if user can apply today (basic daily tracking).
 * In BYOK mode, there's no limit — always allowed.
 */
export async function canApplyToday(): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  return { allowed: true, remaining: -1, limit: -1 };
}

/**
 * No-op in BYOK mode. Returns null.
 */
export async function refreshSubscription(): Promise<null> {
  return null;
}

/**
 * Returns a simple free plan object.
 */
export async function getCurrentPlan() {
  return { plan: 'free', status: 'active' };
}

/**
 * BYOK mode — no paid users. Always returns false.
 */
export async function isPaidUser(): Promise<boolean> {
  return false;
}
