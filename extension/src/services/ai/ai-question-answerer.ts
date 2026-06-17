/* ============================================================
   LinkedApply Pro — AI-Powered Question Answerer
   Uses AI as fallback when pattern matching fails
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { QuestionType } from '../../shared/types';
import { fillPrompt, ANSWER_QUESTION_PROMPT, ANSWER_WITH_OPTIONS_SUFFIX } from './prompts';

const log = createLogger('AI:Questions');

/**
 * Use AI to answer a job application question.
 * This is called as a fallback when the pattern matcher in
 * question-answerer.ts doesn't have a match.
 */
export async function aiAnswerQuestion(
  client: AIProviderClient,
  question: string,
  options?: {
    questionType?: QuestionType;
    selectOptions?: string[];
    jobDescription?: string;
    aboutCompany?: string;
    userInfo?: string;
  }
): Promise<string | null> {
  try {
    log.info(`AI answering: "${question.substring(0, 80)}..."`);

    let prompt = fillPrompt(ANSWER_QUESTION_PROMPT, {
      userInfo: options?.userInfo || 'N/A',
      question,
    });

    // Add select/radio options to prompt
    if (options?.selectOptions && options.selectOptions.length > 0) {
      const optionsStr = options.selectOptions.map((o) => `- ${o}`).join('\n');
      prompt += fillPrompt(ANSWER_WITH_OPTIONS_SUFFIX, { options: optionsStr });
    }

    // Add job context
    if (options?.jobDescription && options.jobDescription !== 'Unknown') {
      prompt += `\n\nJOB DESCRIPTION:\n${options.jobDescription}`;
    }
    if (options?.aboutCompany) {
      prompt += `\n\nABOUT THE COMPANY:\n${options.aboutCompany}`;
    }

    const answer = await client.complete(prompt, {
      temperature: 0.1,
      maxTokens: 500,
    });

    // Clean the response
    const cleaned = answer.trim().replace(/^["']|["']$/g, '');

    log.info(`AI answer: "${cleaned.substring(0, 100)}"`);
    return cleaned || null;
  } catch (error) {
    log.error('AI question answering failed', error);
    return null;
  }
}
