/* ============================================================
   Unit Tests — Shared Utilities
   Tests: constants, storage, logger, validators
   ============================================================ */

import '../setup';

describe('Constants', () => {
  let constants: typeof import('../../src/shared/constants');

  beforeAll(async () => {
    constants = await import('../../src/shared/constants');
  });

  test('APP_NAME is LinkedApply Pro', () => {
    expect(constants.APP_NAME).toBe('LinkedApply Pro');
  });

  test('APP_VERSION follows semver format', () => {
    expect(constants.APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test('PLAN_LIMITS has all 6 plan types', () => {
    const plans = ['free_trial', 'day', 'week', 'month', 'year', 'lifetime'];
    plans.forEach((plan) => {
      expect(constants.PLAN_LIMITS[plan]).toBeDefined();
      expect(constants.PLAN_LIMITS[plan].dailyApplications).toBeDefined();
    });
  });

  test('free_trial has daily limit of 5', () => {
    expect(constants.PLAN_LIMITS.free_trial.dailyApplications).toBe(5);
  });

  test('paid plans have unlimited (-1) daily applications', () => {
    ['day', 'week', 'month', 'year', 'lifetime'].forEach((plan) => {
      expect(constants.PLAN_LIMITS[plan].dailyApplications).toBe(-1);
    });
  });

  test('STORAGE_KEYS contains all required keys', () => {
    const requiredKeys = [
      'USER_PROFILE', 'SEARCH_PREFS', 'QUESTION_DEFAULTS',
      'BOT_SETTINGS', 'AI_CONFIG', 'SESSION_SUMMARY',
      'APPLIED_JOBS', 'BOT_STATUS', 'SUBSCRIPTION', 'AUTH_TOKEN',
    ];
    requiredKeys.forEach((key) => {
      expect(constants.STORAGE_KEYS[key as keyof typeof constants.STORAGE_KEYS]).toBeDefined();
    });
  });

  test('PREMIUM_FEATURES contains follow_up_reminders', () => {
    expect(constants.PREMIUM_FEATURES).toContain('follow_up_reminders');
  });

  test('SPEED_MODES has correct ranges', () => {
    expect(constants.SPEED_MODES.normal.min).toBeLessThan(constants.SPEED_MODES.normal.max);
    expect(constants.SPEED_MODES.turbo.min).toBeLessThan(constants.SPEED_MODES.turbo.max);
    expect(constants.SPEED_MODES.turbo.min).toBeLessThan(constants.SPEED_MODES.normal.min);
  });

  test('DEFAULT_PROFILE has all required fields', () => {
    expect(constants.DEFAULT_PROFILE.firstName).toBe('');
    expect(constants.DEFAULT_PROFILE.email).toBe('');
    expect(constants.DEFAULT_PROFILE.veteranStatus).toBe('Decline');
  });

  test('DEFAULT_BOT_SETTINGS has sensible defaults', () => {
    expect(constants.DEFAULT_BOT_SETTINGS.closeTabs).toBe(true);
    expect(constants.DEFAULT_BOT_SETTINGS.smoothScroll).toBe(true);
    expect(constants.DEFAULT_BOT_SETTINGS.speedMode).toBe('normal');
    expect(constants.DEFAULT_BOT_SETTINGS.clickGap).toBeGreaterThan(0);
  });
});

describe('Storage', () => {
  let storage: typeof import('../../src/shared/storage');

  beforeAll(async () => {
    storage = await import('../../src/shared/storage');
  });

  test('setStorage saves and getStorage retrieves', async () => {
    await storage.setStorage('test_key', { name: 'test' });
    const result = await storage.getStorage<{ name: string }>('test_key');
    expect(result).toEqual({ name: 'test' });
  });

  test('getStorage returns null for missing key', async () => {
    const result = await storage.getStorage('nonexistent');
    expect(result).toBeNull();
  });

  test('setStorage overwrites existing values', async () => {
    await storage.setStorage('test_overwrite', 'first');
    await storage.setStorage('test_overwrite', 'second');
    const result = await storage.getStorage('test_overwrite');
    expect(result).toBe('second');
  });

  test('setStorage handles complex objects', async () => {
    const complexObj = {
      nested: { array: [1, 2, 3], bool: true },
      date: '2024-01-01',
    };
    await storage.setStorage('complex', complexObj);
    const result = await storage.getStorage('complex');
    expect(result).toEqual(complexObj);
  });
});

describe('Logger', () => {
  let createLogger: typeof import('../../src/shared/logger').createLogger;

  beforeAll(async () => {
    const mod = await import('../../src/shared/logger');
    createLogger = mod.createLogger;
  });

  test('createLogger returns logger with all methods', () => {
    const logger = createLogger('TestModule');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  test('logger does not throw on any method', () => {
    const logger = createLogger('TestModule');
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
    expect(() => logger.warn('test')).not.toThrow();
    expect(() => logger.debug('test')).not.toThrow();
  });
});
