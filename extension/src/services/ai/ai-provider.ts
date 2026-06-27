/* ============================================================
   LinkedApply Pro — AI Provider Interface & Factory
   Unified interface for all AI providers (OpenAI, Gemini,
   DeepSeek) with factory pattern for provider selection
   ============================================================ */

import { createLogger } from '../../shared/logger';
import { getStorage } from '../../shared/storage';
import { STORAGE_KEYS } from '../../shared/constants';
import type { AIConfig, AIProvider, ExtractedSkills } from '../../shared/types';

const log = createLogger('AIProvider');

// ---- Unified AI Provider Interface ----

export interface AIProviderClient {
  readonly provider: AIProvider;
  readonly model: string;

  /** Test the connection / validate API key */
  testConnection(): Promise<boolean>;

  /** Get a chat completion (raw text response) */
  complete(prompt: string, options?: CompletionOptions): Promise<string>;

  /** Get a structured JSON response */
  completeJSON<T = any>(prompt: string, options?: CompletionOptions): Promise<T>;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  systemMessage?: string;
  responseFormat?: 'text' | 'json';
}

// ---- OpenAI-Compatible Provider ----
// Works for OpenAI, DeepSeek, and any OpenAI-compatible API

class OpenAICompatibleProvider implements AIProviderClient {
  readonly provider: AIProvider;
  readonly model: string;
  private apiUrl: string;
  private apiKey: string;

  constructor(config: AIConfig) {
    this.provider = config.provider;
    this.model = config.model;
    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // remove trailing slash
    this.apiKey = config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      if (!response.ok) {
        log.error(`Connection test failed: ${response.status} ${response.statusText}`);
        return false;
      }
      log.info(`${this.provider} connection successful`);
      return true;
    } catch (error) {
      log.error(`${this.provider} connection failed`, error);
      return false;
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const messages: any[] = [];

    if (options?.systemMessage) {
      messages.push({ role: 'system', content: options.systemMessage });
    }
    messages.push({ role: 'user', content: prompt });

    const body: any = {
      model: this.model,
      messages,
      stream: false,
    };

    // Temperature support varies by model
    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options?.maxTokens) {
      body.max_tokens = options.maxTokens;
    }
    if (options?.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.provider} API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`${this.provider} API error: ${JSON.stringify(data.error)}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.provider} returned empty response`);
    }

    log.debug(`${this.provider} completion received (${content.length} chars)`);
    return content;
  }

  async completeJSON<T = any>(prompt: string, options?: CompletionOptions): Promise<T> {
    const raw = await this.complete(prompt, {
      ...options,
      responseFormat: 'json',
    });

    try {
      return JSON.parse(raw) as T;
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim()) as T;
      }
      throw new Error(`Failed to parse JSON from ${this.provider} response: ${raw.substring(0, 200)}`);
    }
  }
}

// ---- Google Gemini Provider ----

class GeminiProvider implements AIProviderClient {
  readonly provider: AIProvider = 'gemini';
  readonly model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AIConfig) {
    // Auto-correct deprecated model names
    const deprecatedModels: Record<string, string> = {
      'gemini-1.5-flash': 'gemini-2.5-flash',
      'gemini-1.5-pro': 'gemini-2.5-flash',
      'gemini-pro': 'gemini-2.5-flash',
      'gemini-2.0-flash': 'gemini-2.5-flash',
    };
    this.model = deprecatedModels[config.model] || config.model;
    this.apiKey = config.apiKey;
    this.baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}`;
    if (deprecatedModels[config.model]) {
      log.info(`Auto-corrected deprecated model "${config.model}" → "${this.model}"`);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      if (!response.ok) {
        log.error(`Gemini connection test failed: ${response.status}`);
        return false;
      }
      log.info('Gemini connection successful');
      return true;
    } catch (error) {
      log.error('Gemini connection failed', error);
      return false;
    }
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const body: any = {
          contents: [{ parts: [{ text: prompt }] }],
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        };

        if (options?.temperature !== undefined) {
          body.generationConfig = { temperature: options.temperature };
        }
        if (options?.maxTokens) {
          body.generationConfig = { ...body.generationConfig, maxOutputTokens: options.maxTokens };
        }

        const url = `${this.baseUrl}:generateContent?key=${this.apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();

          // Auto-retry on 429/503 with parsed delay
          if ((response.status === 429 || response.status === 503) && attempt < maxRetries - 1) {
            // Don't retry daily quota limits — they won't reset for hours
            const isDailyQuota = errorText.includes('PerDay') || errorText.includes('FreeTier');
            if (isDailyQuota) {
              log.warn('🚫 Daily AI quota exhausted — skipping retry (resets in ~1 hour)');
              throw new Error(`Gemini daily quota exhausted (20 req/day free tier). Bot will continue without AI scoring.`);
            }

            const retryMatch = errorText.match(/retry in ([\d.]+)s/i) || errorText.match(/"retryDelay":\s*"(\d+)s"/);
            const waitSec = retryMatch ? Math.min(parseFloat(retryMatch[1]), 60) : (15 * (attempt + 1));
            log.warn(`⏳ Gemini ${response.status} — auto-retrying in ${Math.ceil(waitSec)}s (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(r => setTimeout(r, waitSec * 1000));
            continue;
          }

          throw new Error(`Gemini API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(`Gemini API error: ${JSON.stringify(data.error)}`);
        }

        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
          throw new Error('Gemini returned empty response — possibly blocked by safety filters');
        }

        log.debug(`Gemini completion received (${content.length} chars)`);
        return content;
      } catch (error: any) {
        lastError = error;
        // Only retry on rate limit / server errors
        if (attempt < maxRetries - 1 && (error.message?.includes('429') || error.message?.includes('503'))) {
          continue;
        }
        throw error;
      }
    }
    throw lastError || new Error('Max retries exceeded');
  }

  async completeJSON<T = any>(prompt: string, options?: CompletionOptions): Promise<T> {
    const enrichedPrompt = prompt + '\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations. Ensure JSON is complete and properly closed.';
    const raw = await this.complete(enrichedPrompt, options);

    // Clean markdown code blocks
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Attempt to repair truncated JSON (multiple strategies)
      const repaired = this.repairJSON(cleaned);
      if (repaired) {
        try {
          return JSON.parse(repaired) as T;
        } catch { /* fall through */ }
      }
      throw new Error(`Failed to parse JSON from Gemini response: ${cleaned.substring(0, 200)}`);
    }
  }

  /** Try to repair truncated JSON by closing open brackets/braces */
  private repairJSON(json: string): string | null {
    try {
      // Strategy 1: Simple close — close open strings, brackets, braces
      const attempt1 = this.tryCloseJSON(json);
      if (attempt1) {
        try { JSON.parse(attempt1); return attempt1; } catch { /* try next */ }
      }

      // Strategy 2: Strip last incomplete array item/object, then close
      // Find the last complete item by looking for }, or ], before truncation
      let stripped = json;

      // Close open string first
      if (this.isInString(stripped)) stripped += '"';

      // Remove trailing partial object in array: {...truncated
      stripped = stripped.replace(/,\s*\{[^}]*$/s, '');
      // Remove trailing partial key-value pair
      stripped = stripped.replace(/,\s*"[^"]*"\s*:\s*(?:"[^"]*"?|[^,}\]]*)?$/s, '');
      // Remove trailing comma/colon
      stripped = stripped.replace(/[,:\s]+$/, '');

      const attempt2 = this.tryCloseJSON(stripped);
      if (attempt2) {
        try { JSON.parse(attempt2); log.warn('Repaired truncated JSON (stripped incomplete items)'); return attempt2; } catch { /* try next */ }
      }

      // Strategy 3: Progressive strip — walk backwards to find last parseable boundary
      let progressive = stripped;
      for (let i = 0; i < 10; i++) {
        // Remove last item (either a key-value or array element)
        const prevLen = progressive.length;
        progressive = progressive.replace(/,\s*\{[^{}]*\}?\s*$/s, '');
        progressive = progressive.replace(/,\s*"[^"]*"\s*:\s*(?:"[^"]*"|[\d.]+|true|false|null|\[[^\]]*\])\s*$/s, '');
        progressive = progressive.replace(/[,:\s]+$/, '');
        if (progressive.length === prevLen) break; // no more to strip

        const attempt3 = this.tryCloseJSON(progressive);
        if (attempt3) {
          try { JSON.parse(attempt3); log.warn(`Repaired truncated JSON (progressive strip, pass ${i + 1})`); return attempt3; } catch { /* keep stripping */ }
        }
      }

      // Last resort: return strategy 1 result anyway (may still fail)
      return attempt1;
    } catch {
      return null;
    }
  }

  /** Check if the string ends inside an open JSON string */
  private isInString(json: string): boolean {
    let inString = false, escape = false;
    for (const ch of json) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; }
    }
    return inString;
  }

  /** Close open strings, brackets, braces */
  private tryCloseJSON(json: string): string {
    let repaired = json;
    if (this.isInString(repaired)) repaired += '"';
    repaired = repaired.replace(/[,:\s]+$/, '');

    let braces = 0, brackets = 0, inString = false, escape = false;
    for (const ch of repaired) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
    }

    for (let i = 0; i < brackets; i++) repaired += ']';
    for (let i = 0; i < braces; i++) repaired += '}';
    return repaired;
  }
}

// ---- Factory ----

/**
 * Create an AI provider client from config.
 * Factory pattern — caller doesn't need to know which implementation is used.
 */
export function createAIProvider(config: AIConfig): AIProviderClient {
  switch (config.provider) {
    case 'openai':
      return new OpenAICompatibleProvider(config);
    case 'deepseek':
      return new OpenAICompatibleProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}

/**
 * Create an AI provider from stored config in chrome.storage.
 * Returns null if no AI config is saved.
 */
export async function createAIProviderFromStorage(): Promise<AIProviderClient | null> {
  const config = await getStorage<AIConfig>(STORAGE_KEYS.AI_CONFIG);
  if (!config || !config.apiKey) {
    log.debug('No AI config found in storage');
    return null;
  }

  try {
    const provider = createAIProvider(config);
    log.info(`AI provider created: ${config.provider} (${config.model})`);
    return provider;
  } catch (error) {
    log.error('Failed to create AI provider from storage', error);
    return null;
  }
}
