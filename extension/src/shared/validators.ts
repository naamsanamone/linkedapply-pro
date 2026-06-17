/* ============================================================
   LinkedApply Pro — Validators
   Input validation for user config before bot runs
   ============================================================ */

import type { UserProfile, SearchPreferences, QuestionDefaults } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate user profile has minimum required fields
 */
export function validateProfile(profile: UserProfile | null): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!profile) {
    errors.push('User profile is not configured');
    return { valid: false, errors, warnings };
  }

  if (!profile.firstName?.trim()) errors.push('First name is required');
  if (!profile.lastName?.trim()) errors.push('Last name is required');
  if (!profile.email?.trim()) errors.push('Email is required');
  if (!profile.phoneNumber?.trim()) warnings.push('Phone number is not set — some applications may require it');

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate search preferences
 */
export function validateSearchPrefs(prefs: SearchPreferences | null): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!prefs) {
    errors.push('Search preferences are not configured');
    return { valid: false, errors, warnings };
  }

  if (!prefs.searchTerms || prefs.searchTerms.length === 0) {
    errors.push('At least one search term is required');
  }

  if (!prefs.searchLocation?.trim()) {
    warnings.push('No search location set — will use LinkedIn default');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate question defaults
 */
export function validateQuestionDefaults(defaults: QuestionDefaults | null): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!defaults) {
    warnings.push('Question defaults not configured — bot will use fallback answers');
    return { valid: true, errors, warnings };
  }

  if (!defaults.yearsOfExperience) {
    warnings.push('Years of experience not set');
  }

  return { valid: errors.length === 0, errors, warnings };
}
