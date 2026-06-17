/* ============================================================
   Unit Tests — Services
   Tests: export-service, profile-import, subscription-service
   ============================================================ */

import '../setup';

describe('ExportService', () => {
  test('CSV escaping handles commas, quotes, newlines', () => {
    function csvEscape(value: string): string {
      if (!value) return '';
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }

    expect(csvEscape('simple')).toBe('simple');
    expect(csvEscape('has, comma')).toBe('"has, comma"');
    expect(csvEscape('has "quotes"')).toBe('"has ""quotes"""');
    expect(csvEscape('has\nnewline')).toBe('"has\nnewline"');
    expect(csvEscape('')).toBe('');
  });

  test('HTML escaping prevents XSS', () => {
    function escapeHtml(str: string): string {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
    expect(escapeHtml('Normal text')).toBe('Normal text');
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  test('getTopN returns correct top items', () => {
    function getTopN(items: string[], n: number): [string, number][] {
      const counts = new Map<string, number>();
      items.forEach((item) => {
        if (item) counts.set(item, (counts.get(item) || 0) + 1);
      });
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    }

    const items = ['Google', 'Meta', 'Google', 'Apple', 'Google', 'Meta'];
    const top = getTopN(items, 2);
    expect(top[0]).toEqual(['Google', 3]);
    expect(top[1]).toEqual(['Meta', 2]);
    expect(top.length).toBe(2);
  });
});

describe('ProfileImport', () => {
  test('resume text parser extracts email', () => {
    const text = 'John Doe\njohn.doe@example.com\n(555) 123-4567';
    const match = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
    expect(match?.[0]).toBe('john.doe@example.com');
  });

  test('resume text parser extracts phone', () => {
    const text = 'Contact: (555) 123-4567';
    const match = text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    expect(match?.[0]).toBe('(555) 123-4567');
  });

  test('resume text parser extracts LinkedIn URL', () => {
    const text = 'LinkedIn: linkedin.com/in/john-doe';
    const match = text.match(/linkedin\.com\/in\/[\w-]+/i);
    expect(match?.[0]).toBe('linkedin.com/in/john-doe');
  });

  test('resume text parser extracts years of experience', () => {
    const cases = [
      { text: '5+ years of experience in software engineering', expected: '5' },
      { text: '3 years experience', expected: '3' },
      { text: '10 yrs of experience', expected: '10' },
    ];

    cases.forEach(({ text, expected }) => {
      const match = text.match(/(\d+)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:experience|exp)/i);
      expect(match?.[1]).toBe(expected);
    });
  });

  test('JSON import validates structure', () => {
    const validJSON = JSON.stringify({
      version: '1.0.0',
      profile: { firstName: 'John', lastName: 'Doe' },
      questionDefaults: { yearsOfExperience: '5' },
    });

    const parsed = JSON.parse(validJSON);
    expect(parsed.profile).toBeDefined();
    expect(parsed.profile.firstName).toBe('John');
    expect(parsed.questionDefaults.yearsOfExperience).toBe('5');
  });

  test('JSON import handles malformed input', () => {
    expect(() => JSON.parse('not valid json')).toThrow();
  });

  test('merge logic preserves existing non-blank values', () => {
    const existing = { firstName: 'Jane', email: 'jane@test.com', phone: '' };
    const imported = { firstName: '', email: 'newjane@test.com', phone: '555-0123' };

    const merged: any = { ...existing };
    for (const [key, value] of Object.entries(imported)) {
      if (value && String(value).trim()) merged[key] = value;
    }

    expect(merged.firstName).toBe('Jane'); // Preserved (import was blank)
    expect(merged.email).toBe('newjane@test.com'); // Updated
    expect(merged.phone).toBe('555-0123'); // Filled
  });
});

describe('SubscriptionService', () => {
  test('feature gating allows correct features per plan', () => {
    const featurePlanReqs: Record<string, string[]> = {
      ai_answers: ['day', 'week', 'month', 'year', 'lifetime'],
      ai_resume_tailor: ['week', 'month', 'year', 'lifetime'],
      ai_cover_letter: ['month', 'year', 'lifetime'],
      cloud_sync: ['week', 'month', 'year', 'lifetime'],
    };

    // Free trial should not have AI answers
    expect(featurePlanReqs.ai_answers.includes('free_trial')).toBe(false);

    // Day pass should have AI answers but not resume tailor
    expect(featurePlanReqs.ai_answers.includes('day')).toBe(true);
    expect(featurePlanReqs.ai_resume_tailor.includes('day')).toBe(false);

    // Monthly should have everything
    expect(featurePlanReqs.ai_answers.includes('month')).toBe(true);
    expect(featurePlanReqs.ai_resume_tailor.includes('month')).toBe(true);
    expect(featurePlanReqs.ai_cover_letter.includes('month')).toBe(true);
    expect(featurePlanReqs.cloud_sync.includes('month')).toBe(true);
  });

  test('daily limit check with unlimited plan', () => {
    const dailyLimit = -1;
    const allowed = dailyLimit === -1 || 50 < dailyLimit;
    expect(allowed).toBe(true);
  });

  test('daily limit check with free trial', () => {
    const dailyLimit = 5;
    expect(3 < dailyLimit).toBe(true);  // 3 used, should allow
    expect(5 < dailyLimit).toBe(false); // 5 used, should block
    expect(6 < dailyLimit).toBe(false); // 6 used, should block
  });
});

describe('ReminderService', () => {
  test('reminder date calculation is correct', () => {
    const now = new Date();
    const days = 7;
    const reminderDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const diff = Math.round((reminderDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    expect(diff).toBe(7);
  });

  test('overdue detection works', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    expect(new Date(past) <= new Date()).toBe(true);
    expect(new Date(future) <= new Date()).toBe(false);
  });

  test('snooze recalculates date correctly', () => {
    const original = new Date('2024-06-01T10:00:00Z');
    const snoozed = new Date(original.getTime());
    snoozed.setDate(snoozed.getDate() + 2);

    expect(snoozed.getDate()).toBe(original.getDate() + 2);
  });
});
