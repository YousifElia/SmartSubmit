/**
 * The application systems SmartSubmit activates on automatically.
 *
 * This list is the single source of truth for the manifest's host permissions
 * and for the content script's match patterns. Any other site is only touched
 * after the user clicks the toolbar button (via the `activeTab` permission).
 */
export const ATS_HOST_PATTERNS: string[] = [
  // Greenhouse (hosted boards, new boards, and embedded application iframes)
  '*://*.greenhouse.io/*',
  // Lever
  '*://jobs.lever.co/*',
  '*://jobs.eu.lever.co/*',
  // Ashby
  '*://jobs.ashbyhq.com/*',
  // Workday
  '*://*.myworkdayjobs.com/*',
  '*://*.myworkdaysite.com/*',
  // iCIMS
  '*://*.icims.com/*',
  // SmartRecruiters
  '*://jobs.smartrecruiters.com/*',
  '*://careers.smartrecruiters.com/*',
  // Workable
  '*://apply.workable.com/*',
];

export type SiteId =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'icims'
  | 'smartrecruiters'
  | 'workable'
  | 'generic';

export const SITE_NAMES: Record<SiteId, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  icims: 'iCIMS',
  smartrecruiters: 'SmartRecruiters',
  workable: 'Workable',
  generic: 'This page',
};

/** Identify the application system from a hostname. */
export function siteFromHost(hostname: string): SiteId {
  const h = hostname.toLowerCase();
  if (h === 'greenhouse.io' || h.endsWith('.greenhouse.io')) return 'greenhouse';
  if (h === 'jobs.lever.co' || h === 'jobs.eu.lever.co') return 'lever';
  if (h === 'jobs.ashbyhq.com') return 'ashby';
  if (h.endsWith('.myworkdayjobs.com') || h.endsWith('.myworkdaysite.com')) return 'workday';
  if (h.endsWith('.icims.com')) return 'icims';
  if (h.endsWith('.smartrecruiters.com')) return 'smartrecruiters';
  if (h === 'apply.workable.com') return 'workable';
  return 'generic';
}
