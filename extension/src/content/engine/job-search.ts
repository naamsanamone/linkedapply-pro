/* ============================================================
   LinkedApply Pro — Job Search Engine
   Port of Python's apply_filters(), set_search_location(),
   get_page_info() and search navigation
   ============================================================ */

import { createLogger } from '../../shared/logger';
import { getStorage } from '../../shared/storage';
import { STORAGE_KEYS, LINKEDIN_JOBS_URL } from '../../shared/constants';
import type { SearchPreferences } from '../../shared/types';
import {
  waitForElement,
  clickElement,
  findSpanByText,
  typeText,
  humanDelay,
  scrollToView,
  waitForXPath,
  isVisible,
} from './dom-utils';

const log = createLogger('JobSearch');

/**
 * Navigate to LinkedIn job search with the given search term
 */
export async function navigateToSearch(searchTerm: string): Promise<void> {
  const url = `${LINKEDIN_JOBS_URL}?keywords=${encodeURIComponent(searchTerm)}`;
  window.location.href = url;
  log.info(`Navigating to search: "${searchTerm}"`);

  // Wait for page to load
  await waitForElement('.jobs-search-results-list', 10000);
  await humanDelay(1500, 3000);
}

/**
 * Set the search location field
 * Port of Python's set_search_location()
 */
export async function setSearchLocation(location: string): Promise<void> {
  if (!location.trim()) return;

  try {
    log.info(`Setting search location: "${location}"`);
    const locationInput = await waitForElement(
      "input[aria-label='City, state, or zip code']",
      5000
    ) as HTMLInputElement | null;

    if (locationInput && !locationInput.disabled) {
      await typeText(locationInput, location.trim());
      await humanDelay(1500, 2500);

      // Press Enter to search or select first autocomplete suggestion
      locationInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await humanDelay(500, 1000);
    } else {
      log.warn('Location input not found or disabled');
    }
  } catch (error) {
    log.error('Failed to set search location', error);
  }
}

/**
 * Apply all filters: sort, date, experience, job type, etc.
 * Port of Python's apply_filters()
 */
export async function applyFilters(prefs: SearchPreferences): Promise<void> {
  log.info('Applying search filters...');

  // Set location first
  await setSearchLocation(prefs.searchLocation);

  try {
    // Click "All filters" button
    const allFiltersBtn = await waitForXPath(
      '//button[normalize-space()="All filters"]',
      5000
    ) as HTMLElement | null;

    if (!allFiltersBtn) {
      log.warn('Could not find "All filters" button');
      return;
    }

    await clickElement(allFiltersBtn);
    await humanDelay(800, 1500);

    // Sort by
    if (prefs.sortBy) {
      await clickSpanText(prefs.sortBy);
      await humanDelay(300, 600);
    }

    // Date posted
    if (prefs.datePosted) {
      await clickSpanText(prefs.datePosted);
      await humanDelay(300, 600);
    }

    // Experience level (multi-select)
    await clickMultipleSpans(prefs.experienceLevel);

    // Job type (multi-select)
    await clickMultipleSpans(prefs.jobType);

    // On-site/Remote/Hybrid
    await clickMultipleSpans(prefs.onSite);

    // Easy Apply toggle
    if (prefs.easyApplyOnly) {
      await toggleBooleanFilter('Easy Apply');
    }

    // Industry (multi-select)
    await clickMultipleSpans(prefs.industry);

    // Salary
    if (prefs.salary) {
      await clickSpanText(prefs.salary);
      await humanDelay(300, 600);
    }

    // Click "Show results" button
    const showResultsBtn = document.querySelector<HTMLElement>(
      'button[aria-label*="apply current filters"],' +
      'button[aria-label*="Apply current filters"],' +
      'button[aria-label*="Show"]'
    );

    if (showResultsBtn) {
      await clickElement(showResultsBtn);
      log.info('Filters applied, showing results');
    } else {
      // Fallback: try XPath
      const btn = await waitForXPath(
        '//button[contains(translate(@aria-label, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "apply current filters to show")]',
        3000
      ) as HTMLElement | null;
      if (btn) {
        await clickElement(btn);
        log.info('Filters applied via fallback XPath');
      }
    }

    await humanDelay(2000, 4000);
  } catch (error) {
    log.error('Failed to apply filters', error);
  }
}

/**
 * Get current page info (pagination element and page number)
 * Port of Python's get_page_info()
 */
export function getPageInfo(): { paginationElement: Element | null; currentPage: number | null } {
  try {
    const paginationClasses = [
      'jobs-search-pagination__pages',
      'artdeco-pagination',
      'artdeco-pagination__pages',
    ];

    let paginationElement: Element | null = null;
    for (const cls of paginationClasses) {
      paginationElement = document.querySelector(`.${cls}`);
      if (paginationElement) break;
    }

    if (!paginationElement) {
      return { paginationElement: null, currentPage: null };
    }

    scrollToView(paginationElement);

    const activePage = paginationElement.querySelector("button[class*='active']");
    const currentPage = activePage ? parseInt(activePage.textContent?.trim() || '1', 10) : null;

    return { paginationElement, currentPage };
  } catch (error) {
    log.error('Failed to get page info', error);
    return { paginationElement: null, currentPage: null };
  }
}

/**
 * Navigate to the next page
 */
export async function goToNextPage(
  paginationElement: Element,
  currentPage: number
): Promise<boolean> {
  try {
    const nextPage = currentPage + 1;
    const nextBtn = paginationElement.querySelector(
      `button[aria-label='Page ${nextPage}']`
    ) as HTMLElement | null;

    if (nextBtn) {
      await clickElement(nextBtn);
      log.info(`Navigated to page ${nextPage}`);
      await humanDelay(2000, 4000);
      return true;
    }

    log.info(`No page ${nextPage} found. End of results.`);
    return false;
  } catch (error) {
    log.error('Failed to navigate to next page', error);
    return false;
  }
}

/**
 * Get all job listing elements on the current page
 */
export async function getJobListings(): Promise<Element[]> {
  await humanDelay(1000, 2000);

  let listings = Array.from(
    document.querySelectorAll('li[data-occludable-job-id]')
  );

  if (listings.length === 0) {
    listings = Array.from(
      document.querySelectorAll('.job-card-container, div[data-job-id]')
    );
  }

  log.info(`Found ${listings.length} job listings on current page`);
  return listings;
}

/**
 * Check if LinkedIn's daily Easy Apply limit is reached
 */
export function isDailyLimitReached(): boolean {
  try {
    const feedbackEls = document.querySelectorAll('.artdeco-inline-feedback__message');
    for (const el of feedbackEls) {
      if (el.textContent?.includes('exceeded the daily application limit')) {
        log.warn('Daily Easy Apply limit reached!');
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}

// ---- Internal Helpers ----

async function clickSpanText(text: string): Promise<boolean> {
  if (!text) return false;
  const span = findSpanByText(text);
  if (span) {
    await clickElement(span);
    return true;
  }
  log.warn(`Span not found: "${text}"`);
  return false;
}

async function clickMultipleSpans(texts: string[]): Promise<void> {
  for (const text of texts) {
    await clickSpanText(text);
    await humanDelay(200, 500);
  }
}

async function toggleBooleanFilter(text: string): Promise<void> {
  try {
    const heading = await waitForXPath(
      `.//h3[normalize-space()="${text}"]/ancestor::fieldset`,
      3000
    ) as HTMLElement | null;

    if (heading) {
      const toggle = heading.querySelector("input[role='switch']") as HTMLElement | null;
      if (toggle) {
        scrollToView(toggle);
        toggle.click();
        await humanDelay(300, 600);
      }
    }
  } catch (error) {
    log.warn(`Failed to toggle: "${text}"`, error);
  }
}
