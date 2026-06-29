/* ============================================================
   LinkedApply Pro — [PREMIUM] Cover Letter Generator
   AI-powered personalized cover letters per job
   ============================================================ */

import { createLogger } from '../../shared/logger';
import type { AIProviderClient } from './ai-provider';
import type { UserProfile, CoverLetterData } from '../../shared/types';
import { fillPrompt, COVER_LETTER_PROMPT } from './prompts';

const log = createLogger('AI:CoverLetter');

interface CoverLetterResult {
  subject: string;
  greeting: string;
  body: string[];
  closing: string;
  signature: string;
}

/**
 * Generate a personalized cover letter for a specific job.
 * Returns structured CoverLetterData for PDF/DOCX export.
 */
export async function aiGenerateCoverLetter(
  client: AIProviderClient,
  profile: UserProfile,
  jobTitle: string,
  company: string,
  jobDescription: string
): Promise<CoverLetterData | null> {
  try {
    log.info(`Generating cover letter for "${jobTitle}" at ${company}...`);

    const userProfileStr = [
      `Name: ${profile.firstName} ${profile.lastName}`,
      `Email: ${profile.email}`,
      `Phone: ${profile.phoneNumber}`,
      `Location: ${profile.currentCity}, ${profile.state}`,
    ].join('\n');

    const prompt = fillPrompt(COVER_LETTER_PROMPT, {
      userProfile: userProfileStr,
      jobTitle,
      company,
      jobDescription: jobDescription.substring(0, 3000),
    });

    const result = await client.completeJSON<CoverLetterResult>(prompt, {
      temperature: 0.5,
      maxTokens: 2000,
    });

    // Ensure arrays/strings exist
    result.body = result.body || [];
    result.subject = result.subject || `Application for ${jobTitle}`;
    result.greeting = result.greeting || 'Dear Hiring Manager,';
    result.closing = result.closing || 'Sincerely,';
    result.signature = result.signature || `${profile.firstName} ${profile.lastName}`;

    // Build plain text version
    const plainText = [
      result.greeting,
      '',
      ...result.body.map(p => p + '\n'),
      result.closing,
      result.signature,
    ].join('\n');

    const coverLetterData: CoverLetterData = {
      subject: result.subject,
      plainText,
      greeting: result.greeting,
      bodyParagraphs: result.body,
      closing: result.closing,
      signature: result.signature,
      generatedAt: Date.now(),
      jobTitle,
      company,
    };

    log.info(`Cover letter generated (${plainText.length} chars, ${result.body.length} paragraphs)`);
    return coverLetterData;
  } catch (error) {
    log.error('Cover letter generation failed', error);
    return null;
  }
}
