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
Parse this resume into an ORDERED array of sections. Return EVERY section found in the resume. Copy all text VERBATIM — do NOT modify, rephrase, or improve anything.

RESUME TEXT:
{resumeText}

Return ONLY valid JSON — an array of section objects. The FIRST section MUST be "header" with contact info. Each section has "name", "type", and type-specific content:

[
  {
    "name": "Header",
    "type": "header",
    "fullName": "John Doe",
    "email": "john@email.com",
    "phone": "123-456-7890",
    "location": "City, State",
    "linkedin": "linkedin.com/in/johndoe",
    "github": "github.com/johndoe",
    "portfolio": "johndoe.com"
  },
  {
    "name": "Professional Summary",
    "type": "summary",
    "text": "exact summary paragraph from resume"
  },
  {
    "name": "Technical Skills",
    "type": "skills",
    "categories": {"Languages": "Java, Python", "Frameworks": "Spring Boot, React"},
    "items": ["Java", "Python", "Spring Boot"]
  },
  {
    "name": "Professional Experience",
    "type": "experience",
    "entries": [
      {"company": "Company", "location": "City, State", "title": "Job Title", "duration": "Mon YYYY -- Present", "bullets": ["exact bullet 1", "exact bullet 2"]}
    ]
  },
  {
    "name": "Personal Projects",
    "type": "projects",
    "entries": [
      {"name": "Project Name", "techStack": "tech1, tech2", "duration": "Mon YYYY -- Mon YYYY", "bullets": ["exact bullet"]}
    ]
  },
  {
    "name": "Education",
    "type": "education",
    "entries": [
      {"institution": "University", "location": "City, State", "degree": "Degree Name", "year": "YYYY"}
    ]
  },
  {
    "name": "Certifications",
    "type": "list",
    "items": ["Cert name 1"]
  }
]

SECTION TYPES:
- "header": contact info (MUST be first — extract name, email, phone, location, and any links like LinkedIn/GitHub/Portfolio from the resume header)
- "summary": paragraph text (use for Summary, Objective, Profile)
- "skills": categorized skills (use for Technical Skills, Core Competencies)
- "experience": work entries with bullets (use for Experience, Work History)
- "projects": project entries with bullets (use for Projects)
- "education": education entries (use for Education)
- "list": simple bullet items (use for Certifications, Achievements, Awards, Publications, Volunteer, Languages, Interests, Honors, or any other section)

CRITICAL RULES:
1. Copy ALL text VERBATIM — do not rephrase, summarize, or improve
2. The FIRST section MUST be "header" with the person's name and contact details
3. Return remaining sections in the SAME ORDER as the resume
4. Include EVERY section found — do not skip any
5. Include ALL entries and ALL bullets within each section
6. Use "list" type for any section not matching the other types
7. If a contact field (email, phone, etc.) is not in the resume, omit it
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
