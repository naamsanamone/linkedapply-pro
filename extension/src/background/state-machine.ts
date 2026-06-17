/* ============================================================
   LinkedApply Pro — State Machine
   Manages the bot's lifecycle states and transitions
   ============================================================ */

import { createLogger } from '../shared/logger';
import { getStorage, setStorage, onStorageChanged } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import type { BotStatus, ExtensionMessage } from '../shared/types';

const log = createLogger('StateMachine');

/**
 * Valid state transitions map.
 * Keys: current state → Values: allowed next states
 */
const VALID_TRANSITIONS: Record<BotStatus, BotStatus[]> = {
  idle:      ['searching', 'stopped'],
  searching: ['filtering', 'applying', 'paused', 'stopped', 'error'],
  filtering: ['searching', 'applying', 'paused', 'stopped', 'error'],
  applying:  ['searching', 'paused', 'stopped', 'error'],
  paused:    ['searching', 'filtering', 'applying', 'stopped', 'idle'],
  error:     ['searching', 'idle', 'stopped'],
  stopped:   ['idle', 'searching'],
};

export class BotStateMachine {
  private currentState: BotStatus = 'idle';
  private listeners: Map<string, Set<(state: BotStatus, prevState: BotStatus) => void>> = new Map();

  async init(): Promise<void> {
    const savedState = await getStorage<BotStatus>(STORAGE_KEYS.BOT_STATUS);
    if (savedState) {
      this.currentState = savedState;
    }
    log.info(`State machine initialized. Current state: ${this.currentState}`);
  }

  getState(): BotStatus {
    return this.currentState;
  }

  canTransition(to: BotStatus): boolean {
    const allowed = VALID_TRANSITIONS[this.currentState];
    return allowed?.includes(to) ?? false;
  }

  async transition(to: BotStatus): Promise<boolean> {
    if (!this.canTransition(to)) {
      log.warn(`Invalid transition: ${this.currentState} → ${to}`);
      return false;
    }

    const prevState = this.currentState;
    this.currentState = to;
    await setStorage(STORAGE_KEYS.BOT_STATUS, to);

    log.info(`State transition: ${prevState} → ${to}`);
    this.notifyListeners(to, prevState);
    return true;
  }

  /**
   * Force set state (for recovery from errors)
   */
  async forceState(to: BotStatus): Promise<void> {
    const prev = this.currentState;
    this.currentState = to;
    await setStorage(STORAGE_KEYS.BOT_STATUS, to);
    log.warn(`Forced state: ${prev} → ${to}`);
    this.notifyListeners(to, prev);
  }

  /**
   * Subscribe to state changes
   */
  on(event: 'stateChange', callback: (state: BotStatus, prevState: BotStatus) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove a state change listener
   */
  off(event: 'stateChange', callback: (state: BotStatus, prevState: BotStatus) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  private notifyListeners(state: BotStatus, prevState: BotStatus): void {
    this.listeners.get('stateChange')?.forEach((cb) => {
      try { cb(state, prevState); } catch (e) {  log.error('Listener error', e); }
    });
  }

  isRunning(): boolean {
    return ['searching', 'filtering', 'applying'].includes(this.currentState);
  }

  isPaused(): boolean {
    return this.currentState === 'paused';
  }

  isStopped(): boolean {
    return ['idle', 'stopped'].includes(this.currentState);
  }
}

/** Singleton instance */
export const stateMachine = new BotStateMachine();
