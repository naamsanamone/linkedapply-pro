/* ============================================================
   LinkedApply Pro — DOM Utility Functions
   Port of Python's clickers_and_finders.py to TypeScript
   ============================================================ */

import { createLogger } from '../../shared/logger';

const log = createLogger('DOM');

/**
 * Wait for an element to appear in the DOM
 */
export async function waitForElement(
  selector: string,
  timeout: number = 5000,
  parent: Element | Document = document
): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = parent.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = parent.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(parent === document ? document.body : parent, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Wait for an element by XPath
 */
export async function waitForXPath(
  xpath: string,
  timeout: number = 5000
): Promise<Element | null> {
  return new Promise((resolve) => {
    const check = () => {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue as Element | null;
    };

    const existing = check();
    if (existing) return resolve(existing);

    const intervalId = setInterval(() => {
      const el = check();
      if (el) {
        clearInterval(intervalId);
        resolve(el);
      }
    }, 200);

    setTimeout(() => {
      clearInterval(intervalId);
      resolve(null);
    }, timeout);
  });
}

/**
 * Click an element with human-like behavior
 */
export async function clickElement(element: Element): Promise<boolean> {
  try {
    scrollToView(element);
    await humanDelay(200, 500);

    (element as HTMLElement).click();
    log.debug('Clicked element');
    return true;
  } catch (error) {
    log.error('Click failed', error);
    return false;
  }
}

/**
 * Scroll element into view (centered)
 */
export function scrollToView(element: Element, smooth: boolean = true): void {
  element.scrollIntoView({
    behavior: smooth ? 'smooth' : 'instant',
    block: 'center',
  });
}

/**
 * Type text into an input field with human-like behavior
 */
export async function typeText(
  element: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  clearFirst: boolean = true
): Promise<void> {
  scrollToView(element);
  element.focus();

  if (clearFirst) {
    element.select();
    await humanDelay(100, 200);
  }

  element.value = text;

  // Dispatch events to trigger LinkedIn's React handlers
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  log.debug(`Typed text: "${text.substring(0, 30)}..."`);
}

/**
 * Select an option from a <select> dropdown
 */
export async function selectOption(selectEl: HTMLSelectElement, value: string): Promise<boolean> {
  const options = Array.from(selectEl.options);
  const match = options.find(
    (opt) => opt.value === value || opt.textContent?.trim().toLowerCase() === value.toLowerCase()
  );

  if (match) {
    selectEl.value = match.value;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    log.debug(`Selected option: "${match.textContent}"`);
    return true;
  }

  log.warn(`Option not found: "${value}"`);
  return false;
}

/**
 * Find a span element by its text content (port of Python's wait_span_click)
 */
export function findSpanByText(text: string, parent: Element | Document = document): HTMLElement | null {
  const xpath = `.//span[normalize-space(.)="${text}"]`;
  const result = document.evaluate(xpath, parent, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue as HTMLElement | null;
}

/**
 * Find all elements matching a text pattern
 */
export function findByTextContent(text: string, tagName: string = '*'): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>(tagName);
  for (const el of elements) {
    if (el.textContent?.trim().toLowerCase().includes(text.toLowerCase())) {
      return el;
    }
  }
  return null;
}

/**
 * Human-like random delay
 */
export function humanDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Wait for navigation / page load
 */
export function waitForPageLoad(timeout: number = 10000): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') return resolve();

    const handler = () => {
      document.removeEventListener('DOMContentLoaded', handler);
      resolve();
    };

    document.addEventListener('DOMContentLoaded', handler);
    setTimeout(resolve, timeout);
  });
}

/**
 * Check if an element is visible in the viewport
 */
export function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}
