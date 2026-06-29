/* ============================================================
   LinkedApply Pro — Usage Tracker
   Track AI API usage locally in chrome.storage
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';

const log = createLogger('UsageTracker');
const USAGE_KEY = STORAGE_KEYS.USAGE_STATE;

export interface UsageState {
  tier: 'byok' | 'pro';
  licenseKey?: string;
  dailyCalls: { date: string; count: number };
  totalCalls: number;
  lastCallAt?: string;
}

const DEFAULT_USAGE: UsageState = {
  tier: 'byok',
  dailyCalls: { date: new Date().toISOString().slice(0, 10), count: 0 },
  totalCalls: 0,
};

/**
 * Get current usage state from storage.
 */
export async function getUsageState(): Promise<UsageState> {
  const state = await getStorage<UsageState>(USAGE_KEY);
  if (!state) return { ...DEFAULT_USAGE };

  // Reset daily counter if it's a new day
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailyCalls.date !== today) {
    state.dailyCalls = { date: today, count: 0 };
    await setStorage(USAGE_KEY, state);
  }

  return state;
}

/**
 * Record an AI call (increment daily + total counters).
 */
export async function recordAICall(): Promise<UsageState> {
  const state = await getUsageState();
  const today = new Date().toISOString().slice(0, 10);

  if (state.dailyCalls.date !== today) {
    state.dailyCalls = { date: today, count: 1 };
  } else {
    state.dailyCalls.count++;
  }
  state.totalCalls++;
  state.lastCallAt = new Date().toISOString();

  await setStorage(USAGE_KEY, state);
  log.info(`AI call #${state.dailyCalls.count} today (${state.totalCalls} total)`);
  return state;
}

/**
 * Set the tier and optionally a license key.
 */
export async function setTier(tier: 'byok' | 'pro', licenseKey?: string): Promise<void> {
  const state = await getUsageState();
  state.tier = tier;
  if (licenseKey) state.licenseKey = licenseKey;
  await setStorage(USAGE_KEY, state);
  log.info(`Tier set to: ${tier}`);
}

/**
 * Estimated cost based on Gemini 2.5 Flash pricing (~$0.15/M input tokens).
 * Average ~1500 tokens per call.
 */
export function estimateCost(calls: number): string {
  const est = calls * 1500 * 0.00000015; // rough estimate
  return est < 0.01 ? '<$0.01' : `~$${est.toFixed(3)}`;
}
