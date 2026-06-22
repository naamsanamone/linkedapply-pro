/* ============================================================
   LinkedApply Pro — Answer Memory
   Stores previously answered questions for reuse.
   Inspired by GodsScion's questions_memory.json approach.
   ============================================================ */

import { getStorage, setStorage } from './storage';
import { STORAGE_KEYS } from './constants';
import type { AnswerMemoryEntry } from './types';

/**
 * Normalize a question string for consistent lookup.
 * Strips common prefixes, lowercases, removes punctuation.
 */
export function normalizeQuestion(q: string): string {
  let key = q.toLowerCase().trim();

  // Strip common prefixes
  const prefixes = [
    'what is your ', 'what are your ', 'what is the ',
    'how many years of ', 'how many years ',
    'please provide ', 'please enter ', 'please specify ',
    'do you have ', 'are you ', 'have you ',
    'can you ', 'will you ', 'would you ',
  ];
  for (const prefix of prefixes) {
    if (key.startsWith(prefix)) {
      key = key.slice(prefix.length);
      break;
    }
  }

  // Remove trailing punctuation and asterisks
  key = key.replace(/[?*.:!]+$/g, '').trim();

  return key;
}

/**
 * Compute word-level Jaccard similarity between two strings.
 */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/));
  const setB = new Set(b.split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Find a stored answer for a question.
 * First tries exact match on normalized key, then fuzzy match.
 */
export async function findAnswer(question: string): Promise<AnswerMemoryEntry | null> {
  const memory = await getStorage<AnswerMemoryEntry[]>(STORAGE_KEYS.ANSWER_MEMORY) || [];
  const key = normalizeQuestion(question);

  // Exact match
  const exact = memory.find(e => e.questionKey === key);
  if (exact) {
    // Update usage stats
    exact.usedCount += 1;
    exact.lastUsed = new Date().toISOString();
    await setStorage(STORAGE_KEYS.ANSWER_MEMORY, memory);
    return exact;
  }

  // Fuzzy match (Jaccard > 0.7)
  let bestMatch: AnswerMemoryEntry | null = null;
  let bestScore = 0;
  for (const entry of memory) {
    const score = jaccardSimilarity(key, entry.questionKey);
    if (score > 0.7 && score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    bestMatch.usedCount += 1;
    bestMatch.lastUsed = new Date().toISOString();
    await setStorage(STORAGE_KEYS.ANSWER_MEMORY, memory);
  }

  return bestMatch;
}

/**
 * Save a question-answer pair to memory.
 * Updates existing entry if question already stored.
 */
export async function saveAnswer(
  question: string,
  answer: string,
  answeredBy: 'pattern' | 'ai' | 'user'
): Promise<void> {
  const memory = await getStorage<AnswerMemoryEntry[]>(STORAGE_KEYS.ANSWER_MEMORY) || [];
  const key = normalizeQuestion(question);

  const existing = memory.find(e => e.questionKey === key);
  if (existing) {
    existing.answer = answer;
    existing.answeredBy = answeredBy;
    existing.lastUsed = new Date().toISOString();
  } else {
    memory.push({
      question,
      questionKey: key,
      answer,
      answeredBy,
      usedCount: 1,
      lastUsed: new Date().toISOString(),
    });
  }

  await setStorage(STORAGE_KEYS.ANSWER_MEMORY, memory);
}

/**
 * Get all stored answers.
 */
export async function getAllAnswers(): Promise<AnswerMemoryEntry[]> {
  return await getStorage<AnswerMemoryEntry[]>(STORAGE_KEYS.ANSWER_MEMORY) || [];
}
