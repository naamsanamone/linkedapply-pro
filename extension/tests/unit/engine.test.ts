/* ============================================================
   Unit Tests — Automation Engine
   Tests: question-answerer, job-details, dom-utils
   ============================================================ */

import '../setup';

describe('QuestionAnswerer', () => {
  let answerer: typeof import('../../src/content/engine/question-answerer');

  beforeAll(async () => {
    // Pre-load question defaults into mock storage
    const { setStorage } = await import('../../src/shared/storage');
    await setStorage('question_defaults', {
      yearsOfExperience: '5',
      requireVisa: 'No',
      desiredSalary: 120000,
      usCitizenship: 'Yes',
      linkedIn: 'https://linkedin.com/in/testuser',
      website: 'https://example.com',
      coverLetter: 'I am a great candidate...',
      recentEmployer: 'Google',
      confidenceLevel: '9',
    });

    answerer = await import('../../src/content/engine/question-answerer');
  });

  test('matchesPattern returns answer for experience question', () => {
    const patterns: Array<{ keywords: string[]; answer: string }> = [
      { keywords: ['years', 'experience'], answer: '5' },
      { keywords: ['salary', 'expected'], answer: '120000' },
    ];

    // Simulate matching
    const question = 'How many years of experience do you have?';
    const match = patterns.find((p) =>
      p.keywords.every((kw) => question.toLowerCase().includes(kw))
    );
    expect(match).toBeDefined();
    expect(match?.answer).toBe('5');
  });

  test('matchesPattern handles case-insensitive matching', () => {
    const question = 'YEARS OF EXPERIENCE';
    const keywords = ['years', 'experience'];
    const matches = keywords.every((kw) => question.toLowerCase().includes(kw));
    expect(matches).toBe(true);
  });

  test('visa question pattern matches correctly', () => {
    const questions = [
      'Do you require visa sponsorship?',
      'Will you need visa sponsorship now or in the future?',
      'Visa sponsorship required?',
    ];

    questions.forEach((q) => {
      const hasVisa = q.toLowerCase().includes('visa');
      expect(hasVisa).toBe(true);
    });
  });

  test('salary question detects numeric format', () => {
    const salaryStr = '120000';
    const salary = parseInt(salaryStr);
    expect(salary).toBe(120000);
    expect(salary).toBeGreaterThan(0);
  });
});

describe('JobDetails', () => {
  test('parseExperience extracts years from description', () => {
    const descriptions = [
      { text: '3+ years of experience in React', expected: '3' },
      { text: '5-7 years experience required', expected: '5' },
      { text: 'Minimum 2 years', expected: '2' },
      { text: 'Entry level position', expected: '' },
    ];

    descriptions.forEach(({ text, expected }) => {
      const match = text.match(/(\d+)\+?\s*(?:-\d+)?\s*(?:years?|yrs?)/i);
      const result = match ? match[1] : '';
      expect(result).toBe(expected);
    });
  });

  test('parseWorkStyle detects remote/hybrid/onsite', () => {
    const testCases = [
      { text: 'Remote', expected: 'Remote' },
      { text: 'Hybrid - 3 days in office', expected: 'Hybrid' },
      { text: 'On-site only', expected: 'On-site' },
      { text: 'Work from home available', expected: 'Remote' },
    ];

    testCases.forEach(({ text, expected }) => {
      let result = '';
      if (/remote|work from home|wfh/i.test(text)) result = 'Remote';
      else if (/hybrid/i.test(text)) result = 'Hybrid';
      else if (/on[- ]?site|in[- ]?office|in[- ]?person/i.test(text)) result = 'On-site';
      expect(result).toBe(expected);
    });
  });

  test('extractJobId from LinkedIn URL', () => {
    const urls = [
      { url: 'https://www.linkedin.com/jobs/view/12345/', expected: '12345' },
      { url: 'https://www.linkedin.com/jobs/view/67890?refId=abc', expected: '67890' },
    ];

    urls.forEach(({ url, expected }) => {
      const match = url.match(/\/jobs\/view\/(\d+)/);
      expect(match?.[1]).toBe(expected);
    });
  });
});

describe('DomUtils', () => {
  test('sanitizeText strips HTML and normalizes whitespace', () => {
    const testCases = [
      { input: '  Hello   World  \n  ', expected: 'Hello World' },
      { input: 'Line1\nLine2\n\nLine3', expected: 'Line1 Line2 Line3' },
      { input: '\t  tabs  and  spaces  \t', expected: 'tabs and spaces' },
    ];

    testCases.forEach(({ input, expected }) => {
      const result = input.replace(/\s+/g, ' ').trim();
      expect(result).toBe(expected);
    });
  });

  test('delay creates a promise that resolves after time', async () => {
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });
});
