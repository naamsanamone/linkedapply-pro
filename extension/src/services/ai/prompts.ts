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
You are an intelligent AI assistant filling out a job application form. Answer like a human.
Respond concisely based on the type of question:

1. If the question asks for **years of experience, duration, or numeric value**, return **only a number** (e.g., "2", "5", "10").
2. If the question is a **Yes/No question**, return **only "Yes" or "No"**.
3. If the question requires a **short description**, give a **single-sentence response**.
4. If the question requires a **detailed response**, provide a **well-structured, human-like answer under 350 characters**.
5. Do **not** repeat the question in your answer.

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

CANDIDATE PROFILE:
{userProfile}

JOB DESCRIPTION:
{jobDescription}

Score the match from 0 to 100 and explain briefly. Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>", "<gap 2>"],
  "recommendation": "<1-2 sentence recommendation>",
  "shouldApply": <true/false>
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
