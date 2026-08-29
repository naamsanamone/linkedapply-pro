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

// ======== JD KEYWORD EXTRACTION (Hybrid Tailoring — AI only touches the JD) ========

export const JD_KEYWORDS_PROMPT = `
Extract the top keywords from this job description. Categorize them.

JOB DESCRIPTION:
{jobDescription}

Return ONLY valid JSON:
{
  "hardSkills": ["Java", "Spring Boot", "PostgreSQL"],
  "softSkills": ["leadership", "communication"],
  "tools": ["Docker", "AWS", "Jenkins", "Git"],
  "domain": ["fintech", "microservices", "REST API"],
  "seniority": ["senior", "3+ years", "lead"],
  "jobTitle": "Software Engineer"
}
`;

// Legacy prompt kept for optional "full AI rewrite" mode
export const RESUME_TAILOR_PROMPT = JD_KEYWORDS_PROMPT;

// ======== RESUME STRUCTURE PARSING (one-time on upload) ========

export const PARSE_RESUME_PROMPT = `
Parse this resume text into structured JSON. Extract ALL sections exactly as written — do NOT modify, rewrite, or improve any content. Copy text VERBATIM.

RESUME TEXT:
{resumeText}

Return ONLY valid JSON:
{
  "skillCategories": {
    "Languages": "Java, Python, SQL, JavaScript",
    "Frameworks": "Spring Boot, React, Angular",
    "Developer Tools": "Git, Docker, AWS, Jenkins",
    "Libraries": "JUnit, Mockito, pandas"
  },
  "skills": ["Java", "Python", "Spring Boot", "Docker"],
  "experience": [
    {
      "company": "Company Name",
      "location": "City, State/Country",
      "title": "Job Title",
      "duration": "Mon YYYY -- Mon YYYY or Present",
      "bullets": ["exact bullet text from resume", "another bullet"]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "location": "City, State",
      "degree": "Degree Name and Major",
      "year": "YYYY or date range"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "techStack": "tech1, tech2",
      "duration": "Mon YYYY -- Mon YYYY",
      "bullets": ["exact bullet text"]
    }
  ],
  "certifications": ["Cert name 1"]
}

CRITICAL RULES:
1. Copy ALL bullet points EXACTLY as written — do not rephrase, summarize, or improve
2. Include EVERY experience entry, EVERY education entry, EVERY project, EVERY certification
3. If the resume has skill categories (Languages, Frameworks, etc), preserve them in skillCategories
4. Also list all skills as a flat array in the skills field
5. If a section is missing from the resume, return an empty array for it
6. Do NOT skip any section — extract everything
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

// ======== STAND OUT TIPS (Premium) ========

export const STAND_OUT_TIPS_PROMPT = `
Help this candidate stand out for this job application. Like LinkedIn Premium's "Help Stand Out" feature.

CANDIDATE:
{userProfile}

JOB: {jobTitle} at {company}
{jobDescription}

Provide actionable tips. Keep each tip under 15 words.

Return ONLY valid JSON:
{
  "highlightSkills": ["<skill to emphasize in application>", "<skill>"],
  "highlightAchievements": ["<achievement to mention>", "<achievement>"],
  "profileImprovements": ["<specific LinkedIn profile improvement>", "<improvement>"]
}
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
