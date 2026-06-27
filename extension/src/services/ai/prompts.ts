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
You are a career advisor AI. Evaluate how well this candidate matches the job description.
Provide a detailed qualification breakdown like LinkedIn Premium.

CANDIDATE PROFILE:
{userProfile}

JOB DESCRIPTION:
{jobDescription}

Analyze every qualification mentioned in the job description. Classify each as required or preferred.
For each qualification, determine if the candidate matches it based on their profile/resume.

Score the overall match from 0 to 100. Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "headline": "<e.g. You'd be a top applicant OR Job match is low>",
  "recommendation": "<2-3 sentence recommendation explaining the match>",
  "shouldApply": <true/false>,
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "requiredQualifications": [
    {
      "description": "<qualification text>",
      "matched": <true/false>,
      "note": "<optional: why partial/no match, e.g. User has 3 years, requires 5+>"
    }
  ],
  "preferredQualifications": [
    {
      "description": "<qualification text>",
      "matched": <true/false>,
      "note": "<optional>"
    }
  ]
}
`;

// ======== RESUME TAILORING (Premium) ========

export const RESUME_TAILOR_PROMPT = `
You are an expert resume writer specializing in ATS-optimized resumes.

ORIGINAL RESUME/PROFILE:
{userProfile}

TARGET JOB DESCRIPTION:
{jobDescription}

EXTRACTED REQUIRED SKILLS:
{requiredSkills}

Rewrite the resume to maximize ATS score for this specific job. Instructions:
- Keep all facts truthful — do not fabricate experience
- Reorder and reword bullet points to emphasize relevant skills
- Incorporate keywords from the job description naturally
- Use strong action verbs and quantifiable achievements
- Keep professional summary under 3 sentences, targeted to this role

Return ONLY valid JSON:
{
  "summary": "<tailored professional summary>",
  "skills": ["<skill 1>", "<skill 2>", ...],
  "experience": [
    {
      "title": "<job title>",
      "company": "<company>",
      "duration": "<dates>",
      "bullets": ["<bullet 1>", "<bullet 2>"]
    }
  ],
  "atsScore": <estimated ATS match score 0-100>,
  "keywordsAdded": ["<keyword 1>", "<keyword 2>"]
}
`;

// ======== COVER LETTER (Premium) ========

export const COVER_LETTER_PROMPT = `
You are an expert cover letter writer. Create a compelling, personalized cover letter.

CANDIDATE PROFILE:
{userProfile}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Write a 3-4 paragraph cover letter that:
- Opens with a strong, personalized hook (not "I am writing to apply...")
- Connects the candidate's strongest relevant experience to the job requirements
- Shows genuine interest in the company
- Closes with a confident call to action
- Is professional but not overly formal
- Is under 350 words

Return the cover letter as plain text. No JSON. No markdown formatting.
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
