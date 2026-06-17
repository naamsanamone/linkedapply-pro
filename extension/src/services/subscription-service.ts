/* ============================================================
   LinkedApply Pro — Subscription Service
   Manages subscription state, feature gating, and daily
   limit enforcement within the extension
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS, PLAN_LIMITS } from '../shared/constants';
import type { Subscription, PlanType } from '../shared/types';
import type { PremiumFeature } from '../shared/constants';
import { verifySubscription } from './api-client';

const log = createLogger('Subscription');

// Feature → minimum plan mapping
const FEATURE_PLAN_REQUIREMENTS: Record<string, PlanType[]> = {
  ai_answers:          ['day', 'week', 'month', 'year', 'lifetime'],
  ai_resume_tailor:    ['week', 'month', 'year', 'lifetime'],
  job_match_score:     ['week', 'month', 'year', 'lifetime'],
  ai_cover_letter:     ['month', 'year', 'lifetime'],
  ats_keywords:        ['month', 'year', 'lifetime'],
  kanban_board:        ['month', 'year', 'lifetime'],
  analytics:           ['month', 'year', 'lifetime'],
  cloud_sync:          ['week', 'month', 'year', 'lifetime'],
  follow_up_reminders: ['month', 'year', 'lifetime'],
  email_notifications: ['month', 'year', 'lifetime'],
  export_data:         ['month', 'year', 'lifetime'],
  turbo_speed:         ['day', 'week', 'month', 'year', 'lifetime'],
  unlimited_search_terms: ['day', 'week', 'month', 'year', 'lifetime'],
  unlimited_blacklist:    ['day', 'week', 'month', 'year', 'lifetime'],
};

/**
 * Check if the user's current plan grants a specific feature.
 */
export async function hasFeature(feature: string): Promise<boolean> {
  const subscription = await getStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTION);
  if (!subscription || subscription.status !== 'active') return false;

  const allowedPlans = FEATURE_PLAN_REQUIREMENTS[feature];
  if (!allowedPlans) return false; // Unknown feature

  return allowedPlans.includes(subscription.plan);
}

/**
 * Check if user can apply today (hasn't hit daily limit).
 */
export async function canApplyToday(): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const subscription = await getStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTION);
  const plan = subscription?.plan || 'free_trial';
  const limits = PLAN_LIMITS[plan];
  const dailyLimit = limits?.dailyApplications ?? 5;

  // Unlimited
  if (dailyLimit === -1) {
    return { allowed: true, remaining: -1, limit: -1 };
  }

  // Count today's applications from local storage
  const jobs = await getStorage<any[]>(STORAGE_KEYS.APPLIED_JOBS) || [];
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = jobs.filter(
    (j) => j.dateApplied?.startsWith(today) && j.status === 'applied'
  ).length;

  const remaining = Math.max(0, dailyLimit - todayCount);

  return {
    allowed: remaining > 0,
    remaining,
    limit: dailyLimit,
  };
}

/**
 * Refresh subscription from backend.
 * Called on extension startup and periodically via alarm.
 */
export async function refreshSubscription(): Promise<Subscription | null> {
  try {
    const result = await verifySubscription();
    if (result?.subscription) {
      await setStorage(STORAGE_KEYS.SUBSCRIPTION, result.subscription);
      log.info(`Subscription refreshed: ${result.subscription.plan} (${result.subscription.status})`);
      return result.subscription;
    }
    return null;
  } catch (error) {
    log.error('Failed to refresh subscription', error);
    // Fall back to cached subscription
    return getStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTION);
  }
}

/**
 * Get current subscription (from cache, no API call).
 */
export async function getCurrentPlan(): Promise<Subscription | null> {
  return getStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTION);
}

/**
 * Check if user has any paid plan (not free trial).
 */
export async function isPaidUser(): Promise<boolean> {
  const sub = await getStorage<Subscription>(STORAGE_KEYS.SUBSCRIPTION);
  return !!sub && sub.plan !== 'free_trial' && sub.status === 'active';
}
