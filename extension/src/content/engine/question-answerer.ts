/* ============================================================
   LinkedApply Pro — Question Answerer
   Port of Python's answer_questions() — pattern matching +
   fuzzy matching + AI fallback for all 5 question types
   ============================================================ */

import { createLogger } from '../../shared/logger';
import { getStorage } from '../../shared/storage';
import { STORAGE_KEYS } from '../../shared/constants';
import type { UserProfile, QuestionDefaults, QuestionAnswer, QuestionType } from '../../shared/types';
import { scrollToView, humanDelay } from './dom-utils';
import { createAIProviderFromStorage, type AIProviderClient } from '../../services/ai/ai-provider';
import { aiAnswerQuestion } from '../../services/ai/ai-question-answerer';
import { findAnswer, saveAnswer } from '../../shared/answer-memory';

const log = createLogger('QuestionAnswerer');

// Lazy-loaded AI client cache
let _aiClient: AIProviderClient | null | undefined = undefined;

async function getAIClient(): Promise<AIProviderClient | null> {
  if (_aiClient === undefined) {
    _aiClient = await createAIProviderFromStorage();
  }
  return _aiClient;
}

interface AnswerContext {
  profile: UserProfile;
  defaults: QuestionDefaults;
  workLocation: string;
  jobDescription: string | null;
}

/**
 * Answer all questions on the current Easy Apply modal page.
 * Port of Python's answer_questions()
 */
export async function answerQuestions(
  modal: Element,
  context: AnswerContext
): Promise<QuestionAnswer[]> {
  const answeredQuestions: QuestionAnswer[] = [];
  const questionElements = modal.querySelectorAll('[data-test-form-element]');

  for (const questionEl of questionElements) {
    try {
      const answer = await processQuestion(questionEl, context);
      if (answer) {
        answeredQuestions.push(answer);
      }
    } catch (error) {
      log.warn('Failed to process a question', error);
    }
  }

  // Auto-select today's date if date picker is present
  const todayBtn = modal.querySelector("button[aria-label*='This is today']") as HTMLElement;
  if (todayBtn) {
    todayBtn.click();
    log.debug('Selected today\'s date');
  }

  return answeredQuestions;
}

/**
 * Process a single question element and return the answer
 */
async function processQuestion(
  questionEl: Element,
  ctx: AnswerContext
): Promise<QuestionAnswer | null> {
  // Try each question type in order
  const selectEl = questionEl.querySelector('select');
  if (selectEl) return await handleSelectQuestion(questionEl, selectEl, ctx);

  const radioFieldset = questionEl.querySelector('fieldset[data-test-form-builder-radio-button-form-component="true"]');
  if (radioFieldset) return await handleRadioQuestion(questionEl, radioFieldset, ctx);

  const textInput = questionEl.querySelector("input[type='text']") as HTMLInputElement;
  if (textInput) return await handleTextQuestion(questionEl, textInput, ctx);

  // Handle number inputs (experience, salary fields)
  const numberInput = questionEl.querySelector("input[type='number']") as HTMLInputElement;
  if (numberInput) return await handleTextQuestion(questionEl, numberInput, ctx);

  // Handle phone inputs
  const telInput = questionEl.querySelector("input[type='tel']") as HTMLInputElement;
  if (telInput) return await handleTextQuestion(questionEl, telInput, ctx);

  // Handle email inputs
  const emailInput = questionEl.querySelector("input[type='email']") as HTMLInputElement;
  if (emailInput) {
    const label = extractLabel(questionEl);
    const answer = ctx.profile.email;
    if (answer && (!emailInput.value || ctx.defaults.overwritePreviousAnswers)) {
      emailInput.focus();
      emailInput.value = answer;
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { question: label, answer: answer || emailInput.value, type: 'text', answeredBy: 'pattern' };
  }

  const textarea = questionEl.querySelector('textarea') as HTMLTextAreaElement;
  if (textarea) return await handleTextareaQuestion(questionEl, textarea, ctx);

  const checkbox = questionEl.querySelector("input[type='checkbox']") as HTMLInputElement;
  if (checkbox) return handleCheckboxQuestion(questionEl, checkbox, ctx);

  return null;
}

// ==================== SELECT QUESTIONS ====================

async function handleSelectQuestion(
  container: Element,
  selectEl: HTMLSelectElement,
  ctx: AnswerContext
): Promise<QuestionAnswer> {
  const label = extractLabel(container);
  const labelLower = label.toLowerCase();
  const selectedOption = selectEl.options[selectEl.selectedIndex]?.text || '';
  const overwrite = ctx.defaults.overwritePreviousAnswers;

  let answer = '';
  let answeredBy: QuestionAnswer['answeredBy'] = 'pattern';

  // If already selected and not overwriting, keep what LinkedIn pre-filled
  if (!overwrite && selectedOption && selectedOption !== 'Select an option') {
    log.debug(`Select already filled: "${label}" → "${selectedOption}" (keeping)`);
    return { question: label, answer: selectedOption, type: 'select', answeredBy: 'pattern' };
  }

  // Phone country code — special dropdown
  if (labelLower.includes('country code') || (labelLower.includes('phone') && labelLower.includes('code'))) {
    const cc = ctx.profile.phoneCountryCode || 'India (+91)';
    // Try fuzzy matching: search for country name or dial code in options
    for (const opt of selectEl.options) {
      const optText = opt.text.toLowerCase();
      if (optText.includes(cc.toLowerCase()) || cc.toLowerCase().includes(optText)) {
        answer = opt.text;
        break;
      }
    }
    if (!answer) answer = cc;
  }
  // Gender
  else if (labelLower.includes('gender') || labelLower.includes('sex')) {
    answer = ctx.profile.gender || 'Decline';
  }
  // Disability
  else if (labelLower.includes('disability')) {
    answer = ctx.profile.disabilityStatus;
  }
  // Language proficiency
  else if (labelLower.includes('proficiency')) {
    answer = 'Professional';
  }
  // Education / qualification
  else if (hasAny(labelLower, ['education', 'qualification', 'degree'])) {
    answer = ctx.profile.highestEducation || "Bachelor's Degree";
  }
  // Notice period
  else if (hasAny(labelLower, ['notice period', 'notice'])) {
    const days = ctx.defaults.noticePeriod;
    answer = matchClosestOption(selectEl, days, 'days');
  }
  // CTC / salary — dropdown with ranges
  else if (hasAny(labelLower, ['salary', 'compensation', 'ctc', 'pay', 'package', 'stipend'])) {
    const base = hasAny(labelLower, ['current', 'present'])
      ? ctx.defaults.currentCtc
      : ctx.defaults.desiredSalary;
    answer = matchClosestOption(selectEl, base, 'salary');
  }
  // Location-based questions
  else if (hasAny(labelLower, ['location', 'city', 'state', 'country'])) {
    if (labelLower.includes('country')) answer = ctx.profile.country;
    else if (labelLower.includes('state')) answer = ctx.profile.state;
    else if (labelLower.includes('city')) answer = ctx.profile.currentCity || ctx.workLocation;
    else answer = ctx.workLocation;
  }
  // Sponsorship / visa
  else if (hasAny(labelLower, ['sponsorship', 'visa'])) {
    answer = ctx.defaults.requireVisa;
  }
  // Working mode (Remote/Hybrid/Onsite)
  else if (hasAny(labelLower, ['working mode', 'work mode', 'remote', 'hybrid', 'onsite', 'on-site'])) {
    answer = 'Remote';
  }
  // Relocation / willingness / availability / comfortable / start
  else if (hasAny(labelLower, ['relocat', 'willing', 'available', 'comfortable', 'can you start', 'able to'])) {
    answer = 'Yes';
  }
  // Authorization to work
  else if (hasAny(labelLower, ['authorized', 'authorization', 'legally', 'eligible to work'])) {
    answer = 'Yes';
  }
  // Consent / agreement
  else if (hasAny(labelLower, ['consent', 'agree', 'acknowledge', 'ndpa'])) {
    // Try to find the consent option
    for (const opt of selectEl.options) {
      if (opt.text.toLowerCase().includes('consent') || opt.text.toLowerCase().includes('agree')) {
        answer = opt.text;
        break;
      }
    }
    if (!answer) answer = 'Yes';
  }
  // Previous employment questions — default NO (to avoid lying)
  else if (hasAny(labelLower, ['previously', 'worked with', 'employed by', 'worked at', 'in the past'])) {
    answer = 'No';
  }
  // Experience
  else if (hasAny(labelLower, ['experience', 'years'])) {
    answer = ctx.defaults.yearsOfExperience;
  }
  // Default: only "Yes" if dropdown actually has Yes/No options
  else {
    const optTexts = Array.from(selectEl.options).map(o => o.text.toLowerCase());
    const hasYesNo = optTexts.some(t => t === 'yes') && optTexts.some(t => t === 'no');
    answer = hasYesNo ? 'Yes' : '';
  }

  // Try selecting the answer
  if (!selectByText(selectEl, answer)) {
    // Fuzzy match with synonyms
    if (!fuzzySelectOption(selectEl, answer)) {
      // AI fallback for select
      const aiClient = await getAIClient();
      const optionTexts = Array.from(selectEl.options).map(o => o.text).filter(t => t !== 'Select an option');
      let aiUsed = false;
      if (aiClient && optionTexts.length > 0) {
        const aiAnswer = await aiAnswerQuestion(aiClient, label, {
          questionType: 'select',
          selectOptions: optionTexts,
        });
        if (aiAnswer && selectByText(selectEl, aiAnswer)) {
          answer = aiAnswer;
          answeredBy = 'ai';
          aiUsed = true;
          log.info(`AI answered select: "${label}" → "${answer}"`);
        }
      }
      if (!aiUsed) {
        // Random fallback
        const randomIdx = Math.floor(Math.random() * (selectEl.options.length - 1)) + 1;
        selectEl.selectedIndex = randomIdx;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        answer = selectEl.options[randomIdx]?.text || answer;
        answeredBy = 'random';
        log.warn(`Randomly answered select: "${label}" → "${answer}"`);
      }
    }
  }

  log.debug(`Select: "${label}" → "${answer}"`);
  return { question: label, answer, type: 'select', answeredBy };
}

// ==================== RADIO QUESTIONS ====================

async function handleRadioQuestion(
  container: Element,
  fieldset: Element,
  ctx: AnswerContext
): Promise<QuestionAnswer> {
  const titleEl = fieldset.querySelector('[data-test-form-builder-radio-button-form-component__title]');
  let label = titleEl?.textContent?.trim() || 'Unknown';
  // Sometimes the real text is in a visually-hidden span
  const hiddenSpan = titleEl?.querySelector('.visually-hidden');
  if (hiddenSpan) label = hiddenSpan.textContent?.trim() || label;

  const labelLower = label.toLowerCase();
  let answer = 'Yes';
  let answeredBy: QuestionAnswer['answeredBy'] = 'pattern';

  const options = fieldset.querySelectorAll('input');
  const optionLabels: { input: HTMLInputElement; label: string; value: string }[] = [];
  let selectedOption: string | null = null;

  for (const opt of options) {
    const optId = opt.getAttribute('id') || '';
    const optLabel = fieldset.querySelector(`label[for="${optId}"]`);
    const labelText = optLabel?.textContent?.trim() || 'Unknown';
    const value = opt.getAttribute('value') || '';
    optionLabels.push({ input: opt, label: labelText, value });
    if (opt.checked) selectedOption = labelText;
  }

  if (ctx.defaults.overwritePreviousAnswers || selectedOption === null) {
    // Citizenship / employment eligibility
    if (hasAny(labelLower, ['citizenship', 'employment eligibility'])) {
      answer = ctx.defaults.usCitizenship;
    }
    // Veteran status
    else if (hasAny(labelLower, ['veteran', 'protected'])) {
      answer = ctx.profile.veteranStatus;
    }
    // Disability
    else if (hasAny(labelLower, ['disability', 'handicapped'])) {
      answer = ctx.profile.disabilityStatus;
    }
    // Sponsorship
    else if (hasAny(labelLower, ['sponsorship', 'visa'])) {
      answer = ctx.defaults.requireVisa;
    }
    // Gender
    else if (hasAny(labelLower, ['gender', 'sex'])) {
      answer = ctx.profile.gender || 'Male';
    }
    // Working mode
    else if (hasAny(labelLower, ['working mode', 'work mode', 'remote', 'hybrid'])) {
      answer = 'Remote';
    }
    // Notice period (radio variant)
    else if (hasAny(labelLower, ['notice', 'serving'])) {
      answer = 'Yes';
    }
    // Previous employment — default NO
    else if (hasAny(labelLower, ['previously', 'worked with', 'employed by', 'in the past', 'worked at'])) {
      answer = 'No';
    }
    // PhD / doctorate — default NO (only say yes if user configured didMasters)
    else if (hasAny(labelLower, ['phd', 'doctorate', 'ph.d'])) {
      answer = 'No';
    }
    // Authorized to work
    else if (hasAny(labelLower, ['authorized', 'legally', 'eligible to work'])) {
      answer = 'Yes';
    }
    // Relocation / availability / comfortable / start
    else if (hasAny(labelLower, ['relocat', 'willing', 'available', 'comfortable', 'can you start', 'able to', 'do you agree', 'consent'])) {
      answer = 'Yes';
    }

    // Try clicking the matching radio option
    let clicked = false;
    for (const opt of optionLabels) {
      if (opt.label.toLowerCase() === answer.toLowerCase()) {
        opt.input.click();
        clicked = true;
        answer = opt.label;
        break;
      }
    }

    // Fuzzy match
    if (!clicked) {
      const synonyms = answer === 'Decline'
        ? ['Decline', 'not wish', "don't wish", 'Prefer not', 'not want']
        : [answer];

      for (const phrase of synonyms) {
        for (const opt of optionLabels) {
          if (opt.label.toLowerCase().includes(phrase.toLowerCase())) {
            opt.input.click();
            clicked = true;
            answer = opt.label;
            break;
          }
        }
        if (clicked) break;
      }
    }

    // AI fallback for radio
    if (!clicked && optionLabels.length > 0) {
      const aiClient = await getAIClient();
      if (aiClient) {
        const optionTexts = optionLabels.map(o => o.label);
        const aiAnswer = await aiAnswerQuestion(aiClient, label, {
          questionType: 'radio',
          selectOptions: optionTexts,
        });
        if (aiAnswer) {
          for (const opt of optionLabels) {
            if (opt.label.toLowerCase() === aiAnswer.toLowerCase()) {
              opt.input.click();
              clicked = true;
              answer = opt.label;
              answeredBy = 'ai';
              log.info(`AI answered radio: "${label}" → "${answer}"`);
              break;
            }
          }
        }
      }
    }

    // Last resort: click first option
    if (!clicked && optionLabels.length > 0) {
      optionLabels[0].input.click();
      answer = optionLabels[0].label;
      answeredBy = 'random';
      log.warn(`Randomly answered radio: "${label}" → "${answer}"`);
    }
  } else {
    answer = selectedOption || 'Unknown';
  }

  log.debug(`Radio: "${label}" → "${answer}"`);
  return { question: label, answer, type: 'radio', answeredBy };
}

// ==================== TEXT INPUT QUESTIONS ====================

async function handleTextQuestion(
  container: Element,
  input: HTMLInputElement,
  ctx: AnswerContext
): Promise<QuestionAnswer> {
  const label = extractLabel(container);
  const labelLower = label.toLowerCase();
  const prevValue = input.value;
  let answer = '';
  let answeredBy: QuestionAnswer['answeredBy'] = 'pattern';

  const fullName = [ctx.profile.firstName, ctx.profile.middleName, ctx.profile.lastName]
    .filter(Boolean).join(' ');

  if (!prevValue || ctx.defaults.overwritePreviousAnswers) {
    // Tech-specific experience: "How many years with [TECH]?"
    if (hasAny(labelLower, ['experience', 'years']) && hasAny(labelLower, ['with', 'in', 'using', 'on'])) {
      const techName = extractTechFromLabel(label);
      if (techName) {
        const skillsMap = await getStorage<Record<string, number>>(STORAGE_KEYS.USER_SKILLS_MAP) || {};
        const found = skillsMap[techName.toLowerCase()];
        if (found !== undefined) {
          answer = String(found);
          log.info(`Skills map: "${techName}" → ${found} years`);
        } else {
          answer = '0';
          log.info(`Skills map: "${techName}" not found → defaulting to 0`);
        }
      } else {
        answer = ctx.defaults.yearsOfExperience;
      }
    }
    // Generic experience / total years
    else if (hasAny(labelLower, ['experience', 'years'])) {
      answer = ctx.defaults.yearsOfExperience;
    }
    // Phone
    else if (hasAny(labelLower, ['phone', 'mobile'])) {
      answer = ctx.profile.phoneNumber;
    }
    // Street
    else if (labelLower.includes('street')) {
      answer = ctx.profile.street;
    }
    // City / location / address
    else if (hasAny(labelLower, ['city', 'location', 'address'])) {
      answer = ctx.profile.currentCity || ctx.workLocation;
    }
    // Signature / full name / legal name
    else if (labelLower.includes('signature')) {
      answer = fullName;
    }
    // Name fields
    else if (labelLower.includes('name')) {
      if (labelLower.includes('full')) answer = fullName;
      else if (labelLower.includes('first') && !labelLower.includes('last')) answer = ctx.profile.firstName;
      else if (labelLower.includes('middle') && !labelLower.includes('last')) answer = ctx.profile.middleName;
      else if (labelLower.includes('last') && !labelLower.includes('first')) answer = ctx.profile.lastName;
      else if (labelLower.includes('employer')) answer = ctx.defaults.recentEmployer;
      else answer = fullName;
    }
    // Notice period
    else if (labelLower.includes('notice')) {
      const period = ctx.defaults.noticePeriod;
      if (labelLower.includes('month')) answer = String(Math.floor(period / 30));
      else if (labelLower.includes('week')) answer = String(Math.floor(period / 7));
      else answer = String(period);
    }
    // Salary / compensation / CTC
    else if (hasAny(labelLower, ['salary', 'compensation', 'ctc', 'pay', 'stipend', 'package'])) {
      const base = hasAny(labelLower, ['current', 'present', 'received', 'previous'])
        ? ctx.defaults.currentCtc
        : ctx.defaults.desiredSalary;
      // Smart formatting based on field constraints
      const maxLen = input.maxLength > 0 ? input.maxLength : 999;
      if (hasAny(labelLower, ['monthly', 'month', 'per month'])) {
        answer = String(Math.round(base / 12));
      } else if (hasAny(labelLower, ['lakh', 'lac', 'lpa'])) {
        answer = String(Math.round(base / 100000));
      } else if (maxLen <= 20 && base >= 100000) {
        // Short field — use compact "X LPA" format
        answer = `${(base / 100000).toFixed(base % 100000 === 0 ? 0 : 1)} LPA`;
      } else {
        answer = String(base);
      }
    }
    // Career breaks / gaps
    else if (hasAny(labelLower, ['career break', 'career gap', 'gap in employment', 'reason for'])) {
      answer = 'N/A';
    }
    // Current company / employer
    else if (hasAny(labelLower, ['current company', 'current employer', 'current organization'])) {
      answer = ctx.defaults.recentEmployer;
    }
    // Top skills / list skills
    else if (hasAny(labelLower, ['top skills', 'list your skills', 'key skills', 'top three', 'top 3'])) {
      const skillsMap = await getStorage<Record<string, number>>(STORAGE_KEYS.USER_SKILLS_MAP) || {};
      const sorted = Object.entries(skillsMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (sorted.length > 0) {
        answer = sorted.map(([s, y]) => `${s} - ${y} years`).join(', ');
      }
    }
    // Referral
    else if (hasAny(labelLower, ['referral', 'referred by', 'how did you hear', 'come across'])) {
      answer = 'LinkedIn';
    }
    // LinkedIn profile
    else if (labelLower.includes('linkedin')) {
      answer = ctx.defaults.linkedIn;
    }
    // Website / portfolio
    else if (hasAny(labelLower, ['website', 'blog', 'portfolio', 'link'])) {
      answer = ctx.defaults.website;
    }
    // Scale of 1-10
    else if (labelLower.includes('scale of 1-10')) {
      answer = ctx.defaults.confidenceLevel;
    }
    // Headline
    else if (labelLower.includes('headline')) {
      answer = ctx.defaults.linkedinHeadline;
    }
    // How did you hear about this job
    else if (hasAny(labelLower, ['hear', 'come across']) && labelLower.includes('this') && hasAny(labelLower, ['job', 'position'])) {
      answer = 'LinkedIn';
    }
    // State / province
    else if (hasAny(labelLower, ['state', 'province'])) {
      answer = ctx.profile.state;
    }
    // Zip / postal code
    else if (hasAny(labelLower, ['zip', 'postal', 'code'])) {
      answer = ctx.profile.zipcode;
    }
    // Country
    else if (labelLower.includes('country')) {
      answer = ctx.profile.country;
    }
    // Sponsorship
    else if (hasAny(labelLower, ['sponsorship', 'visa'])) {
      answer = ctx.defaults.requireVisa;
    }

    // Fallback chain: Answer Memory → AI → smart default
    if (!answer) {
      // Tier 2: Check answer memory
      const memorized = await findAnswer(label);
      if (memorized) {
        answer = memorized.answer;
        answeredBy = memorized.answeredBy === 'user' ? 'pattern' : memorized.answeredBy;
        log.info(`Answer memory: "${label}" → "${answer}" (used ${memorized.usedCount}x)`);
      }

      // Tier 3: AI fallback
      if (!answer) {
        const aiClient = await getAIClient();
        if (aiClient) {
          const skillsMap = await getStorage<Record<string, number>>(STORAGE_KEYS.USER_SKILLS_MAP) || {};
          const skillsStr = Object.entries(skillsMap).map(([s, y]) => `${s}: ${y}y`).join(', ');
          const userInfo = `Name: ${fullName}, City: ${ctx.profile.currentCity}, Experience: ${ctx.defaults.yearsOfExperience} years, Current CTC: ${ctx.defaults.currentCtc}, Expected: ${ctx.defaults.desiredSalary}, Notice: ${ctx.defaults.noticePeriod} days, Employer: ${ctx.defaults.recentEmployer}, Skills: ${skillsStr}`;
          const aiAnswer = await aiAnswerQuestion(aiClient, label, {
            questionType: 'text',
            jobDescription: ctx.jobDescription || undefined,
            userInfo,
          });
          if (aiAnswer) {
            answer = aiAnswer;
            answeredBy = 'ai';
            log.info(`AI answered text: "${label}" → "${answer}"`);
            // Save to answer memory for future reuse
            await saveAnswer(label, answer, 'ai');
          }
        }
      }

      // Final fallback: context-aware default instead of yearsOfExperience
      if (!answer) {
        if (input.type === 'number') {
          answer = '0';
        } else if (input.type === 'tel') {
          answer = ctx.profile.phoneNumber;
        } else {
          answer = '';
        }
        if (answer) answeredBy = 'random';
        log.warn(`No match for text: "${label}" → smart default: "${answer || '(empty)'}"`);
      }
    } else {
      // Save pattern-matched answers to memory too
      await saveAnswer(label, answer, 'pattern');
    }

    // Write the answer
    input.focus();
    input.value = '';
    input.value = answer;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // For location fields, trigger autocomplete selection
    if (hasAny(labelLower, ['city', 'location', 'address'])) {
      setTimeout(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        setTimeout(() => {
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }, 500);
      }, 1500);
    }
  }

  log.debug(`Text: "${label}" → "${answer || prevValue}"`);
  return { question: label, answer: answer || prevValue, type: 'text', answeredBy };
}

// ==================== TEXTAREA QUESTIONS ====================

async function handleTextareaQuestion(
  container: Element,
  textarea: HTMLTextAreaElement,
  ctx: AnswerContext
): Promise<QuestionAnswer> {
  const label = extractLabel(container);
  const labelLower = label.toLowerCase();
  const prevValue = textarea.value;
  let answer = '';
  let answeredBy: QuestionAnswer['answeredBy'] = 'pattern';

  if (!prevValue || ctx.defaults.overwritePreviousAnswers) {
    // Summary
    if (labelLower.includes('summary')) {
      answer = ctx.defaults.linkedinSummary;
    }
    // Cover letter
    else if (labelLower.includes('cover')) {
      answer = ctx.defaults.coverLetter;
    }

    // No pattern match — try AI fallback
    if (!answer) {
      const aiClient = await getAIClient();
      if (aiClient) {
        const fullName = [ctx.profile.firstName, ctx.profile.lastName].filter(Boolean).join(' ');
        const userInfo = `Name: ${fullName}, City: ${ctx.profile.currentCity}, Experience: ${ctx.defaults.yearsOfExperience} years`;
        const aiAnswer = await aiAnswerQuestion(aiClient, label, {
          questionType: 'textarea',
          jobDescription: ctx.jobDescription || undefined,
          userInfo,
        });
        if (aiAnswer) {
          answer = aiAnswer;
          answeredBy = 'ai';
          log.info(`AI answered textarea: "${label}" → "${answer.substring(0, 50)}..."`);
        }
      }
      if (!answer) {
        answeredBy = 'random';
        log.warn(`No pattern for textarea: "${label}"`);
      }
    }

    if (answer) {
      textarea.focus();
      textarea.value = '';
      textarea.value = answer;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  log.debug(`Textarea: "${label}" → "${(answer || prevValue).substring(0, 50)}..."`);
  return { question: label, answer: answer || prevValue, type: 'textarea', answeredBy };
}

// ==================== CHECKBOX QUESTIONS ====================

function handleCheckboxQuestion(
  container: Element,
  checkbox: HTMLInputElement,
  ctx: AnswerContext
): QuestionAnswer {
  const hiddenLabel = container.querySelector(".visually-hidden");
  const label = hiddenLabel?.textContent?.trim() || 'Unknown';
  const checkboxLabel = container.querySelector("label[for]");
  const answerText = checkboxLabel?.textContent?.trim() || 'Checked';
  const prevChecked = checkbox.checked;
  let answeredBy: QuestionAnswer['answeredBy'] = 'pattern';

  // Always check the checkbox (agree to terms, etc.)
  if (!prevChecked) {
    try {
      checkbox.click();
    } catch {
      // Fallback: dispatch click event
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }

  log.debug(`Checkbox: "${label}" → checked`);
  return { question: `${label} ([X] ${answerText})`, answer: 'true', type: 'checkbox', answeredBy };
}

// ==================== HELPERS ====================

function extractLabel(container: Element): string {
  const labelEl = container.querySelector('label[for]');
  if (labelEl) {
    const hidden = labelEl.querySelector('.visually-hidden');
    if (hidden) return hidden.textContent?.trim() || 'Unknown';
    const span = labelEl.querySelector('span');
    if (span) return span.textContent?.trim() || 'Unknown';
    return labelEl.textContent?.trim() || 'Unknown';
  }
  return 'Unknown';
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

function selectByText(select: HTMLSelectElement, text: string): boolean {
  for (const option of select.options) {
    if (option.text.trim().toLowerCase() === text.toLowerCase()) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

function fuzzySelectOption(select: HTMLSelectElement, text: string): boolean {
  const synonyms: string[] = [];

  if (text === 'Decline') {
    synonyms.push('Decline', 'not wish', "don't wish", 'Prefer not', 'not want');
  } else if (text.toLowerCase() === 'yes') {
    synonyms.push('Yes', 'Agree', 'I do', 'I have');
  } else if (text.toLowerCase() === 'no') {
    synonyms.push('No', 'Disagree', "I don't", 'I do not');
  } else {
    synonyms.push(text, text.toLowerCase(), text.toUpperCase());
  }

  for (const phrase of synonyms) {
    for (const option of select.options) {
      const optText = option.text.toLowerCase();
      const phraseL = phrase.toLowerCase();
      if (optText.includes(phraseL) || phraseL.includes(optText)) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
  }

  return false;
}

/**
 * Match the closest option in a dropdown that contains numeric ranges.
 * For example, if the user's CTC is 800000 and options are:
 *   "70,00,000 to 80,00,000 INR", "80,00,000 to 90,00,000 INR"
 * This will pick "70,00,000 to 80,00,000 INR".
 *
 * Also works for notice period ranges like "30 to 60 days", "60 to 90 days".
 */
function matchClosestOption(select: HTMLSelectElement, value: number, _type: string): string {
  if (!value || value <= 0) return 'Yes'; // no value configured, fall back to default

  let bestOption = '';
  let bestDistance = Infinity;

  for (const option of select.options) {
    const text = option.text.trim();
    if (text === 'Select an option' || text === '') continue;

    // Extract all numbers from the option text (handle Indian format like 70,00,000)
    const numbers = text.replace(/,/g, '').match(/\d+/g);
    if (!numbers || numbers.length === 0) continue;

    const nums = numbers.map(Number);

    // If it's a range (e.g., "70,00,000 to 80,00,000"), check if value falls in the range
    if (nums.length >= 2) {
      const low = Math.min(...nums);
      const high = Math.max(...nums);
      if (value >= low && value <= high) {
        return text; // Perfect match — value is within this range
      }
      // Distance to range midpoint
      const mid = (low + high) / 2;
      const dist = Math.abs(value - mid);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestOption = text;
      }
    } else {
      // Single number
      const dist = Math.abs(value - nums[0]);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestOption = text;
      }
    }
  }

  if (bestOption) {
    log.debug(`Matched closest range option: "${bestOption}" for value ${value}`);
  }
  return bestOption || String(value);
}

/**
 * Extract a technology/skill name from a question label.
 * Examples:
 *   "How many years of work experience do you have with Core Java?" → "core java"
 *   "How many years of experience do you have in Spring Boot?" → "spring boot"
 *   "Years of experience with kafka-tools?" → "kafka-tools"
 */
function extractTechFromLabel(label: string): string | null {
  const lower = label.toLowerCase();

  // Pattern: "... with/in/using/on [TECH]?"
  const patterns = [
    /(?:with|in|using|on)\s+(.+?)(?:\?|$)/i,
    /experience\s+(?:do you have\s+)?(?:with|in|using|on)\s+(.+?)(?:\?|$)/i,
  ];

  for (const regex of patterns) {
    const match = lower.match(regex);
    if (match && match[1]) {
      let tech = match[1].trim().replace(/[?*.:!]+$/g, '').trim();
      // Remove trailing "do you have" if regex captured too much
      tech = tech.replace(/\s*do you have\s*$/i, '').trim();
      if (tech.length > 0 && tech.length < 50) {
        return tech;
      }
    }
  }

  return null;
}
