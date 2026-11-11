/**
 * Capturing the job posting behind an application page: title, company,
 * location and the full description.
 *
 * Sources, best first:
 *   1. what the application system itself publishes (the Greenhouse job board
 *      API, the description on a Lever posting page),
 *   2. schema.org JobPosting data, which Ashby, Lever and many career sites
 *      embed for search engines,
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
  if (site === 'greenhouse') pieces = await greenhouse(doc, url, fetcher);
  else if (site === 'lever') pieces = await lever(doc, url, fetcher);
  else pieces = {};

  // Fill the gaps from schema.org data, then from the page itself.
  const ld = readJsonLd(doc);
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
    key: postingKey(site, url),
    site,
    url: pieces.url ?? ld?.url ?? canonicalUrl(url),
    title,
    company,
    location,
    description: blocks.length > 0 ? description : '',
    blocks,
  };
}
