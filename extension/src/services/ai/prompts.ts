/* ============================================================
   LinkedApply Pro — AI Prompt Library
   Port of Python prompts.py + new premium prompts for
   resume tailoring, cover letters, job matching, ATS analysis
   ============================================================ */

// ======== SKILL EXTRACTION (from Python) ========

export const EXTRACT_SKILLS_PROMPT = `
You are a job requirements extractor and classifier. Extract all skills from this job description and classify them into five categories:

1. "tech_stack": Programming languages, frameworks, libraries, databases, and other technologies. Examples: Python, React.js, Node.js, MongoDB, Spring Boot, etc.
2. "technical_skills": Technical expertise beyond specific tools. Examples: System Architecture, Data Engineering, Microservices, etc.
3. "other_skills": Non-technical skills. Examples: Communication, Leadership, Cross-team collaboration, etc.
4. "required_skills": All skills specifically listed as required or expected.
5. "nice_to_have": Skills listed as preferred or beneficial but not mandatory.

IMPORTANT: Return ONLY valid JSON in the exact format below — no additional text, explanation, or markdown.

{
  "tech_stack": [],
  "technical_skills": [],
  "other_skills": [],
  "required_skills": [],
  "nice_to_have": []
}

JOB DESCRIPTION:
{jobDescription}
`;

// ======== QUESTION ANSWERING (from Python) ========

export const ANSWER_QUESTION_PROMPT = `
You are filling out a job application form on behalf of the user. Answer accurately and concisely.

RULES:
1. For **numeric fields** (years of experience, salary, etc.), return **only a number** (e.g., "2", "5").
2. For **Yes/No questions**, return **only "Yes" or "No"**.
3. For **CTC or salary** questions, format as "X LPA" (e.g., "8 LPA", "12 LPA").
4. For **short text** fields, give a single concise phrase or sentence.
5. For **detailed/textarea** questions, provide a well-structured answer under 350 characters.
6. **NEVER** answer "Yes" for a phone country code or dial code question.
7. For skills you **DON'T** have (0 years), honestly answer "0" or "No".
8. For career break questions, answer "N/A" if no breaks.
9. For "How did you hear about this job?", answer "LinkedIn".
10. Do NOT repeat the question. Do NOT add explanations. Return ONLY the answer.

User Information:
{userInfo}

QUESTION:
{question}
`;

export const ANSWER_WITH_OPTIONS_SUFFIX = `
OPTIONS:
{options}

Select exactly ONE option from the list above. Return only the exact option text, nothing else.
`;

// ======== JOB MATCHING (Premium) ========

export const JOB_MATCH_PROMPT = `
You are a career advisor. Evaluate candidate-job fit. You MUST extract and list all qualifications from the job description.

CANDIDATE:
{userProfile}

JOB:
{jobDescription}

RULES:
- Extract EVERY qualification from the JD. requiredQualifications and preferredQualifications arrays are MANDATORY and must NOT be empty.
- Keep descriptions short (under 10 words each).
- Omit the "note" field unless the match is partial.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "headline": "<short: e.g. Top applicant OR Low match>",
  "recommendation": "<1 sentence>",
  "shouldApply": <true/false>,
  "strengths": ["<skill1>", "<skill2>"],
  "gaps": ["<gap1>"],
  "requiredQualifications": [
    {"description": "<short qual>", "matched": true},
    {"description": "<short qual>", "matched": false, "note": "<why>"}
  ],
  "preferredQualifications": [
    {"description": "<short qual>", "matched": true}
  ]
}
`;

// ======== RESUME TAILORING (Premium) ========

export const RESUME_TAILOR_PROMPT = `
You are an ATS resume optimizer. Rewrite the resume for this specific job.

RESUME:
{userProfile}

JOB:
{jobDescription}

REQUIRED SKILLS:
{requiredSkills}

RULES: Keep facts truthful. Incorporate JD keywords. Use action verbs. Summary under 3 sentences.

Return ONLY valid JSON (put atsScore and keywordsAdded FIRST):
{
  "atsScore": <0-100>,
  "keywordsAdded": ["<keyword>"],
  "summary": "<tailored summary>",
  "skills": ["<skill>"],
  "experience": [{"title": "<title>", "company": "<co>", "duration": "<dates>", "bullets": ["<bullet>"]}]
}
`;

// ======== COVER LETTER (Premium) ========

export const COVER_LETTER_PROMPT = `
Write a personalized cover letter for this job application.

CANDIDATE:
{userProfile}

JOB: {jobTitle} at {company}
{jobDescription}

RULES:
- Open with a strong hook (NOT "I am writing to apply...")
- Connect candidate's experience to job requirements
- Professional but conversational tone
- Under 300 words total

Return ONLY valid JSON:
{
  "subject": "Application for <job title>",
  "greeting": "Dear Hiring Manager,",
  "body": ["<paragraph 1>", "<paragraph 2>", "<paragraph 3>"],
  "closing": "Sincerely,",
  "signature": "<candidate full name>"
}
`;

// ======== ATS KEYWORD ANALYSIS (Premium) ========

export const ATS_ANALYSIS_PROMPT = `
You are an ATS (Applicant Tracking System) keyword analyst.

CANDIDATE RESUME/PROFILE:
{userProfile}

JOB DESCRIPTION:
{jobDescription}

Analyze the match between the resume and job description. Return ONLY valid JSON:
{
  "atsScore": <number 0-100>,
  "matchedKeywords": ["<keyword>", ...],
  "missingKeywords": ["<keyword>", ...],
  "suggestions": [
    "<specific suggestion to improve match>"
  ],
  "sectionScores": {
    "skills": <0-100>,
    "experience": <0-100>,
    "education": <0-100>,
    "keywords": <0-100>
  }
}
`;

// ======== FOLLOW-UP MESSAGE (Premium) ========

export const FOLLOWUP_MESSAGE_PROMPT = `
You are a career coach. Write a brief, professional follow-up message for LinkedIn.

CONTEXT:
Candidate: {candidateName}
Applied to: {jobTitle} at {company}
Applied on: {dateApplied}

Write a concise (2-3 sentence) follow-up message that:
- References the specific position
- Expresses continued interest
- Is professional but warm
- Under 200 characters

Return only the message text. No quotes, no formatting.
`;

// ======== HELPER: Template interpolation ========

/**
 * Replace {placeholders} in a prompt template with actual values.
 * Handles missing keys gracefully by replacing with "N/A".
 */
export function fillPrompt(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] ?? 'N/A';
  });
}
