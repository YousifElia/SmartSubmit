/**
 * Capturing the job posting behind an application page: title, company,
 * location and the full description.
 *
 * Sources, best first:
 *   1. what the application system itself publishes (the Greenhouse, Workday,
 *      SmartRecruiters and Workable job APIs, the description on a Lever or
 *      iCIMS posting page),
 *   2. schema.org JobPosting data, as JSON-LD or microdata, which most
 *      systems and many career sites embed for search engines,
 *   3. the page itself: its main heading and largest block of text.
 */
import { COUNTRIES, REGIONS } from '../data/geo';
import type { SiteId } from '../sites';
import type { RichBlock } from '../types';
import { blocksToText, elementToBlocks, htmlToBlocks, withoutTitle } from './html';

export interface JobCapture {
  /** Stable identity of the posting: `${site}:${postingId}`. */
  key: string;
  site: SiteId;
  /** The posting's own address, without tracking parameters. */
  url: string;
  title: string;
  company: string;
  location: string;
  description: string;
  blocks: RichBlock[];
}

type Fetcher = (url: string) => Promise<Response>;

interface Pieces {
  /** The posting's identity when the system's own data gives a better one than the address. */
  key?: string;
  title?: string;
  company?: string;
  location?: string;
  blocks?: RichBlock[];
  url?: string;
}

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const textOf = (el: Element | null | undefined) => clean(el?.textContent);
const meta = (doc: Document, property: string) =>
  clean(doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`)?.getAttribute('content'));

// ───────────────────────────── schema.org ─────────────────────────────

interface JsonLdPosting {
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown;
  jobLocationType?: string;
  applicantLocationRequirements?: unknown;
  url?: string;
}

function isPosting(node: unknown): node is JsonLdPosting {
  if (!node || typeof node !== 'object') return false;
  const type = (node as { '@type'?: unknown })['@type'];
  return type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
}

function findPosting(node: unknown): JsonLdPosting | null {
  if (isPosting(node)) return node;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPosting(item);
      if (found) return found;
    }
  } else if (node && typeof node === 'object' && '@graph' in node) {
    return findPosting((node as { '@graph': unknown })['@graph']);
  }
  return null;
}

function placeText(place: unknown): string {
  if (!place || typeof place !== 'object') return typeof place === 'string' ? place : '';
  const address = (place as { address?: unknown }).address;
  if (typeof address === 'string') return address;
  if (!address || typeof address !== 'object') return clean((place as { name?: string }).name);
  const a = address as Record<string, unknown>;
  const country = typeof a.addressCountry === 'object' ? (a.addressCountry as { name?: string } | null)?.name : a.addressCountry;
  const parts = [a.addressLocality, a.addressRegion, country].map((p) => clean(typeof p === 'string' ? p : ''));
  // Avoid "Singapore, Singapore, Singapore".
  return parts.filter((p, i) => p && !parts.slice(0, i).some((q) => q && q.includes(p))).join(', ');
}

function locationFromJsonLd(posting: JsonLdPosting): string {
  const places = Array.isArray(posting.jobLocation) ? posting.jobLocation : posting.jobLocation ? [posting.jobLocation] : [];
  const onsite = [...new Set(places.map(placeText).filter(Boolean))];
  if (posting.jobLocationType === 'TELECOMMUTE') {
    const reqs = Array.isArray(posting.applicantLocationRequirements)
      ? posting.applicantLocationRequirements
      : posting.applicantLocationRequirements
        ? [posting.applicantLocationRequirements]
        : [];
    const where = [...new Set(reqs.map((r) => clean((r as { name?: string })?.name)).filter(Boolean))];
    // "USA" and "United States" side by side say the same thing.
    const distinct = where.filter((w) => !(w === 'USA' && where.includes('United States')));
    onsite.push(distinct.length > 0 ? `Remote (${distinct.join(', ')})` : 'Remote');
  }
  return onsite.join(' · ');
}

export function readJsonLd(doc: Document): Pieces | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const posting = findPosting(data);
    if (!posting) continue;
    const org = posting.hiringOrganization;
    return {
      title: clean(posting.title),
      company: clean(typeof org === 'string' ? org : org?.name),
      location: locationFromJsonLd(posting),
      blocks: posting.description ? htmlToBlocks(posting.description) : [],
      url: typeof posting.url === 'string' ? posting.url : undefined,
    };
  }
  return null;
}

/** The same schema.org data written as microdata (itemprop attributes). */
export function readMicrodata(doc: Document): Pieces | null {
  const scope = doc.querySelector('[itemscope][itemtype$="schema.org/JobPosting"]');
  if (!scope) return null;
  const prop = (root: Element, name: string) => root.querySelector(`[itemprop="${name}"]`);
  const value = (el: Element | null) => clean(el?.getAttribute('content') ?? el?.textContent);
  const org = prop(scope, 'hiringOrganization');
  const address = scope.querySelector('[itemprop="jobLocation"] [itemprop="address"]') ?? prop(scope, 'jobLocation');
  const parts = address ? ['addressLocality', 'addressRegion', 'addressCountry'].map((name) => value(address.querySelector(`[itemprop="${name}"]`))) : [];
  const description = prop(scope, 'description');
  let blocks: RichBlock[] = [];
  if (description) {
    const copy = description.cloneNode(true) as Element;
    copy.querySelectorAll(NOISE).forEach((n) => n.remove());
    blocks = elementToBlocks(copy);
  }
  return {
    title: value(prop(scope, 'title')),
    company: org ? value(org.querySelector('[itemprop="name"]')) || value(org) : '',
    location: parts.filter((p, i) => p && !parts.slice(0, i).includes(p)).join(', '),
    blocks,
  };
}

// ───────────────────────────── Per site ─────────────────────────────

/** Greenhouse board and posting id from any of its URL shapes. */
export function greenhouseIds(url: URL): { board: string; id: string } | null {
  const params = url.searchParams;
  const embedded = params.get('for') && params.get('token');
  if (embedded) return { board: params.get('for')!, id: params.get('token')! };
  const path = /^\/([^/]+)\/jobs\/(\d+)/.exec(url.pathname);
  if (path) return { board: path[1]!, id: path[2]! };
  const jid = params.get('gh_jid');
  const board = /^\/([^/]+)/.exec(url.pathname)?.[1];
  return jid && board ? { board, id: jid } : null;
}

async function greenhouse(doc: Document, url: URL, fetcher: Fetcher): Promise<Pieces> {
  const description = doc.querySelector('.job__description, #content .content-intro, #content');
  const pieces: Pieces = {
    title: textOf(doc.querySelector('.job__title h1, .job__header h1, h1.app-title, .app-title')),
    location: textOf(doc.querySelector('.job__location, #header .location, .location')),
    // "Job Application for Software Developer Intern at Acme Robotics"
    company: clean(/\bat\s+(.+)$/.exec(doc.title)?.[1] ?? textOf(doc.querySelector('.company-name')).replace(/^at\s+/i, '')),
    blocks: description ? elementToBlocks(description) : [],
  };
  // An application embedded on a company's own site carries no description;
  // Greenhouse's public job board API has it.
  const ids = greenhouseIds(url);
  if (ids && (pieces.blocks!.length === 0 || !pieces.company)) {
    try {
      const response = await fetcher(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ids.board)}/jobs/${encodeURIComponent(ids.id)}`);
      if (response.ok) {
        const data = (await response.json()) as { title?: string; company_name?: string; location?: { name?: string }; content?: string; absolute_url?: string };
        pieces.title ||= clean(data.title);
        pieces.company ||= clean(data.company_name);
        pieces.location ||= clean(data.location?.name);
        if (pieces.blocks!.length === 0 && data.content) pieces.blocks = htmlToBlocks(data.content);
        if (data.absolute_url) pieces.url = data.absolute_url;
      }
    } catch {
      // Offline or blocked: carry on with what the page has.
    }
  }
  return pieces;
}

async function lever(doc: Document, url: URL, fetcher: Fetcher): Promise<Pieces> {
  // The application page shows only the posting's header; the description
  // lives on the posting page, one level up.
  const match = /^\/([^/]+)\/([0-9a-f-]{20,})/i.exec(url.pathname);
  const postingUrl = match ? `${url.origin}/${match[1]}/${match[2]}` : '';
  let source: Document = doc;
  if (!readJsonLd(doc) && postingUrl && url.pathname.replace(/\/$/, '') !== postingUrl.slice(url.origin.length)) {
    try {
      const response = await fetcher(postingUrl);
      if (response.ok) source = new DOMParser().parseFromString(await response.text(), 'text/html');
    } catch {
      // Use whatever the application page has.
    }
  }
  const ld = readJsonLd(source);
  const ogTitle = meta(doc, 'og:title');
  return {
    title: ld?.title || textOf(doc.querySelector('.posting-headline h2')),
    company: ld?.company || clean(ogTitle.split(' - ')[0]),
    location: ld?.location || textOf(doc.querySelector('.posting-categories .location')),
    blocks: ld?.blocks ?? [],
    url: postingUrl || undefined,
  };
}

/**
 * Tenant, career site and job from a Workday address: the posting page or any
 * step of its application, on myworkdayjobs.com or myworkdaysite.com.
 */
export function workdayIds(url: URL): { tenant: string; site: string; path: string; req: string } | null {
  const parts = url.pathname.split('/').filter(Boolean);
  const job = parts.indexOf('job');
  if (job < 1) return null;
  let tenant: string;
  if (url.hostname.endsWith('.myworkdaysite.com')) {
    // wd3.myworkdaysite.com/en-US/recruiting/<tenant>/<site>/job/...
    const recruiting = parts.indexOf('recruiting');
    if (recruiting < 0 || recruiting + 3 !== job) return null;
    tenant = parts[recruiting + 1]!;
  } else {
    tenant = url.hostname.split('.')[0]!;
  }
  // The job's own segments end where the application's steps begin.
  const rest = parts.slice(job + 1);
  const apply = rest.indexOf('apply');
  const own = apply >= 0 ? rest.slice(0, apply) : rest;
  if (own.length === 0) return null;
  const last = own[own.length - 1]!;
  return { tenant, site: parts[job - 1]!, path: `/job/${own.join('/')}`, req: /_([A-Za-z0-9-]+)$/.exec(last)?.[1] ?? last };
}

/**
 * Workday names the hiring legal entity ("2100 NVIDIA USA"); the tenant name
 * says which part of that is the brand people know.
 */
function workdayCompany(tenant: string, org: string | undefined): string {
  const name = clean(org);
  const brand = new RegExp(`\\b${tenant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').exec(name);
  if (brand) return brand[0];
  if (name && !/^\d/.test(name)) return name;
  return tenant.charAt(0).toUpperCase() + tenant.slice(1);
}

async function workday(doc: Document, url: URL, fetcher: Fetcher): Promise<Pieces> {
  const ids = workdayIds(url);
  if (!ids) return {};
  const pieces: Pieces = { key: `workday:${ids.tenant}/${ids.req}`.toLowerCase(), url: `${url.origin}/${ids.site}${ids.path}` };
  let org: string | undefined;
  try {
    // The same public data the posting page loads for itself.
    const response = await fetcher(`${url.origin}/wday/cxs/${encodeURIComponent(ids.tenant)}/${encodeURIComponent(ids.site)}${ids.path}`);
    if (response.ok) {
      const data = (await response.json()) as {
        jobPostingInfo?: { title?: string; jobDescription?: string; location?: string; additionalLocations?: string[]; country?: { descriptor?: string }; externalUrl?: string };
        hiringOrganization?: { name?: string };
      };
      const info = data.jobPostingInfo;
      if (info) {
        pieces.title = clean(info.title);
        const places = [info.location, ...(info.additionalLocations ?? [])].map(clean).filter(Boolean);
        let location = [...new Set(places)].join(' · ');
        const country = clean(info.country?.descriptor);
        if (country && places.length === 1 && !jobCountry(location)) location = `${location} (${country})`;
        pieces.location = location || country;
        pieces.blocks = info.jobDescription ? htmlToBlocks(info.jobDescription) : [];
        if (info.externalUrl) pieces.url = info.externalUrl;
      }
      org = data.hiringOrganization?.name;
    }
  } catch {
    // Use whatever the page has.
  }
  pieces.company = workdayCompany(ids.tenant, org ?? readJsonLd(doc)?.company);
  return pieces;
}

async function icims(doc: Document, url: URL, fetcher: Fetcher): Promise<Pieces> {
  // careers-<company>.icims.com/jobs/<id>/<slug>/job (or /login, /candidate…)
  const match = /^\/jobs\/(\d+)(?:\/([^/]+))?/.exec(url.pathname);
  if (!match) return {};
  const [, id, slug = 'job'] = match;
  const pieces: Pieces = { key: `icims:${url.hostname}/${id}`.toLowerCase(), url: `${url.origin}/jobs/${id}/${slug}/job` };
  let ld = readJsonLd(doc);
  if (!ld) {
    // The sign-in and application steps don't carry the posting; its own page does.
    try {
      const response = await fetcher(`${url.origin}/jobs/${id}/${slug}/job?in_iframe=1`);
      if (response.ok) ld = readJsonLd(new DOMParser().parseFromString(await response.text(), 'text/html'));
    } catch {
      // Carry on with the page.
    }
  }
  if (ld) Object.assign(pieces, { title: ld.title, company: ld.company, location: ld.location, blocks: ld.blocks });
  return pieces;
}

/** Company and posting from a SmartRecruiters posting page or one-click application. */
export function smartRecruitersIds(url: URL): { company: string; posting: string } | null {
  const oneClick = /^\/oneclick-ui\/company\/([^/]+)\/publication\/([0-9a-f-]{36})/i.exec(url.pathname);
  if (oneClick) return { company: oneClick[1]!, posting: oneClick[2]!.toLowerCase() };
  const posting = /^\/([^/]+)\/(\d{6,})(?:-|\/|$)/.exec(url.pathname);
  return posting && posting[1] !== 'oneclick-ui' ? { company: posting[1]!, posting: posting[2]! } : null;
}

async function smartRecruiters(doc: Document, url: URL, fetcher: Fetcher): Promise<Pieces> {
  const ids = smartRecruitersIds(url);
  if (!ids) return {};
  // A posting has a number and a publication id; keys use the publication id,
  // which the posting page links to and the application page is named by.
  const publication = /\/publication\/([0-9a-f-]{36})/i.exec(doc.querySelector('a[href*="/oneclick-ui/company/"]')?.getAttribute('href') ?? '')?.[1];
  const pieces: Pieces = { key: `smartrecruiters:${ids.company}/${publication ?? ids.posting}`.toLowerCase() };
  try {
    // SmartRecruiters' public posting API, open to any site.
    const response = await fetcher(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(ids.company)}/postings/${encodeURIComponent(ids.posting)}`);
    if (response.ok) {
      type Section = { title?: string; text?: string };
      const data = (await response.json()) as {
        uuid?: string;
        name?: string;
        postingUrl?: string;
        company?: { name?: string };
        location?: { fullLocation?: string; city?: string; region?: string; country?: string; remote?: boolean; hybrid?: boolean };
        jobAd?: { sections?: Partial<Record<'companyDescription' | 'jobDescription' | 'qualifications' | 'additionalInformation', Section>> };
      };
      if (data.uuid) pieces.key = `smartrecruiters:${ids.company}/${data.uuid}`.toLowerCase();
      pieces.title = clean(data.name);
      pieces.company = clean(data.company?.name);
      const loc = data.location;
      const where = clean(loc?.fullLocation) || [loc?.city, loc?.region].map(clean).filter(Boolean).join(', ');
      pieces.location = loc?.remote ? `${where} (Remote)` : loc?.hybrid ? `${where} (Hybrid)` : where;
      const sections = data.jobAd?.sections ?? {};
      const html = (['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation'] as const)
        .map((name) => sections[name])
        .filter((section): section is Section => !!section?.text)
        .map((section) => `${section.title ? `<h2>${section.title}</h2>` : ''}${section.text}`)
        .join('');
      pieces.blocks = html ? htmlToBlocks(html) : [];
      if (data.postingUrl) pieces.url = data.postingUrl;
    }
  } catch {
    // The posting page's own microdata fills in below.
  }
  return pieces;
}

/** Account and job from a Workable address: apply.workable.com/<account>/j/<shortcode>/… */
export function workableIds(url: URL): { account: string; shortcode: string } | null {
  const match = /^\/([^/]+)\/j\/([A-Za-z0-9]+)/.exec(url.pathname);
  return match ? { account: match[1]!, shortcode: match[2]!.toUpperCase() } : null;
}

async function workable(doc: Document, url: URL, fetcher: Fetcher): Promise<Pieces> {
  const ids = workableIds(url);
  if (!ids) return {};
  const pieces: Pieces = { key: `workable:${ids.account}/${ids.shortcode}`.toLowerCase(), url: `${url.origin}/${ids.account}/j/${ids.shortcode}/` };
  try {
    // The job data Workable's own apply pages load.
    const response = await fetcher(`${url.origin}/api/v2/accounts/${encodeURIComponent(ids.account)}/jobs/${encodeURIComponent(ids.shortcode)}`);
    if (response.ok) {
      type Place = { city?: string; region?: string; country?: string };
      const data = (await response.json()) as {
        title?: string;
        description?: string;
        requirements?: string;
        benefits?: string;
        remote?: boolean;
        workplace?: string;
        location?: Place;
        locations?: Place[];
      };
      pieces.title = clean(data.title);
      const places = (data.locations?.length ? data.locations : data.location ? [data.location] : [])
        .map((p) => [p.city, p.region, p.country].map(clean).filter(Boolean).join(', '))
        .filter(Boolean);
      const where = [...new Set(places)].join(' · ');
      pieces.location = data.remote || data.workplace === 'remote' ? (where ? `${where} (Remote)` : 'Remote') : where;
      const html = [
        data.description ?? '',
        data.requirements ? `<h2>Requirements</h2>${data.requirements}` : '',
        data.benefits ? `<h2>Benefits</h2>${data.benefits}` : '',
      ].join('');
      pieces.blocks = html ? htmlToBlocks(html) : [];
    }
  } catch {
    // Fall back to the page.
  }
  // "Software Developer - Acme Robotics"
  const titled = / [-–|] ([^-–|]+)$/.exec(clean(doc.title))?.[1];
  pieces.company = clean(meta(doc, 'og:site_name') || titled) || companyFromHost(`${ids.account}.example`);
  return pieces;
}

/** Countries named in a location, as ISO codes. Ambiguous wordings are ignored. */
export function countriesIn(location: string): Set<string> {
  const found = new Set<string>();
  const text = ` ${location.replace(/[()]/g, ' ')} `;
  // Short forms are only trusted in capitals: "US", "U.S.", "UK".
  const exact: [RegExp, string][] = [
    [/[\s,]U\.?S\.?A?\.?(?=[\s,)·]|$)/, 'US'],
    [/[\s,]U\.?K\.?(?=[\s,)·]|$)/, 'GB'],
  ];
  for (const [pattern, code] of exact) if (pattern.test(text)) found.add(code);

  const lower = text.toLowerCase();
  for (const c of COUNTRIES) {
    for (const name of [c.name, ...c.aliases]) {
      if (name.length < 4 || name.toUpperCase() === name) continue;
      // Georgia is a country and a state; leave it alone.
      if (c.code === 'GE') continue;
      if (new RegExp(`[^a-z]${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(lower)) found.add(c.code);
    }
  }
  for (const r of REGIONS) {
    if (r.name === 'Georgia' || r.name === 'Washington') continue;
    if (new RegExp(`[^a-z]${r.name.toLowerCase()}[^a-z]`).test(lower)) found.add(r.country);
    // A region code after a comma: "Windsor, ON", "Austin, TX". "CA" could be
    // California or Canada, so it proves nothing on its own.
    if (r.code !== 'CA' && new RegExp(`,\\s*${r.code}(?=[\\s,)·]|$)`).test(text)) found.add(r.country);
  }
  return found;
}

/**
 * The country a job is in, as an ISO code, when the location names exactly
 * one. Remote roles open to several countries, or unclear wording, give ''.
 */
export function jobCountry(location: string): string {
  const found = countriesIn(location);
  return found.size === 1 ? [...found][0]! : '';
}

// ───────────────────────────── Generic ─────────────────────────────

const NOISE = 'form, nav, header, footer, aside, script, style, noscript, iframe, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]';

function mainContent(doc: Document): Element | null {
  const candidates = [
    ...doc.querySelectorAll('[itemprop="description"], [class*="job-description" i], [class*="jobdescription" i], [id*="job-description" i], [class*="posting-description" i]'),
    ...doc.querySelectorAll('main, [role="main"], article'),
  ];
  for (const candidate of candidates) {
    if (clean(candidate.textContent).length > 200) return candidate;
  }
  return doc.body;
}

function generic(doc: Document, url: URL): Pieces {
  const container = mainContent(doc);
  let blocks: RichBlock[] = [];
  if (container) {
    const copy = container.cloneNode(true) as Element;
    copy.querySelectorAll(NOISE).forEach((n) => n.remove());
    blocks = elementToBlocks(copy);
  }
  const title = textOf(doc.querySelector('h1')) || meta(doc, 'og:title') || clean(doc.title);
  return { title, company: meta(doc, 'og:site_name') || companyFromHost(url.hostname), location: '', blocks };
}

/** "careers.mapleleaf.example" → "Mapleleaf". */
export function companyFromHost(hostname: string): string {
  const labels = hostname.toLowerCase().split('.').filter(Boolean);
  const meaningful = labels.slice(0, -1).filter((l) => !/^(www|careers?|jobs?|apply|talent|work|join|hire|hiring|recruiting|boards?)$/.test(l));
  const name = meaningful[meaningful.length - 1] ?? labels[0] ?? '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ───────────────────────────── Identity ─────────────────────────────

const TRACKING = /^(utm_|gh_src|source|src|ref|referrer|lever-source|lever-origin|ashby_|fbclid|gclid|mc_|_hs)/i;

/** The posting's address without tracking parameters or application-page suffixes. */
export function canonicalUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = '';
  for (const key of [...copy.searchParams.keys()]) if (TRACKING.test(key)) copy.searchParams.delete(key);
  copy.pathname = copy.pathname.replace(/\/(apply|application)(\/.*)?$/i, '').replace(/\/$/, '') || '/';
  return copy.toString();
}

/** A stable identity for the posting, so revisiting it updates the same record. */
export function postingKey(site: SiteId, url: URL): string {
  if (site === 'greenhouse') {
    const ids = greenhouseIds(url);
    if (ids) return `greenhouse:${ids.board}/${ids.id}`;
  }
  const uuid = /^\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(url.pathname);
  if ((site === 'lever' || site === 'ashby') && uuid) return `${site}:${uuid[1]!.toLowerCase()}/${uuid[2]!.toLowerCase()}`;
  if (site === 'workday') {
    const ids = workdayIds(url);
    if (ids) return `workday:${ids.tenant}/${ids.req}`.toLowerCase();
  }
  if (site === 'icims') {
    const id = /^\/jobs\/(\d+)/.exec(url.pathname)?.[1];
    if (id) return `icims:${url.hostname}/${id}`.toLowerCase();
  }
  if (site === 'smartrecruiters') {
    const ids = smartRecruitersIds(url);
    if (ids) return `smartrecruiters:${ids.company}/${ids.posting}`.toLowerCase();
  }
  if (site === 'workable') {
    const ids = workableIds(url);
    if (ids) return `workable:${ids.account}/${ids.shortcode}`.toLowerCase();
  }
  const canonical = new URL(canonicalUrl(url));
  return `${site}:${canonical.host}${canonical.pathname}${canonical.search}`;
}

// ───────────────────────────── Entry point ─────────────────────────────

/**
 * Capture the job from an application page. Returns null when there is no
 * sign of a job at all (no title and no description).
 */
export async function captureJob(doc: Document, site: SiteId, href: string, fetcher: Fetcher = (u) => fetch(u)): Promise<JobCapture | null> {
  const url = new URL(href);
  let pieces: Pieces;
  const readers: Partial<Record<SiteId, (doc: Document, url: URL, fetcher: Fetcher) => Promise<Pieces>>> = {
    greenhouse,
    lever,
    workday,
    icims,
    smartrecruiters: smartRecruiters,
    workable,
  };
  pieces = (await readers[site]?.(doc, url, fetcher)) ?? {};

  // Fill the gaps from schema.org data, then from the page itself.
  const ld = readJsonLd(doc) ?? readMicrodata(doc);
  const fallback = generic(doc, url);
  const pick = (key: 'title' | 'company' | 'location') => clean(pieces[key] || ld?.[key] || fallback[key]);
  const title = pick('title');
  const company = pick('company');
  const location = pick('location');
  let blocks = pieces.blocks?.length ? pieces.blocks : ld?.blocks?.length ? ld.blocks : fallback.blocks ?? [];
  blocks = withoutTitle(blocks, title);
  const description = blocksToText(blocks);
  // A few words of page furniture are not a description.
  if (description.length < 80) blocks = [];
  if (!title && blocks.length === 0) return null;

  return {
    key: pieces.key ?? postingKey(site, url),
    site,
    url: pieces.url ?? ld?.url ?? canonicalUrl(url),
    title,
    company,
    location,
    description: blocks.length > 0 ? description : '',
    blocks,
  };
}
