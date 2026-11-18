/**
 * Finding who to ask: connections at the company a job is with, and which of
 * them are best placed to refer you for that role.
 */
import type { Connection, Referral } from '../types';

const LEGAL = /\b(inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|gmbh|plc|sa|ag|lp|llp|pty|bv|nv|ulc|lc|pllc|holdings?|group)\b/g;

/** "Acme Robotics, Inc." → "acme robotics". */
export function normalizeCompany(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL, ' ')
    .replace(/^\s*the\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * How surely two company names mean the same employer: 1 when they are the
 * same name, 0.85 when one is the other plus words ("Amazon" and "Amazon
 * Web Services"), else 0.
 */
export function companyMatch(a: string, b: string): number {
  const x = normalizeCompany(a);
  const y = normalizeCompany(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // Whole leading words only, and not a word too common to identify anyone.
  if (short.length >= 3 && (long.startsWith(`${short} `) || long === short) && !/^(the|global|first|national|united|american|canadian|general)$/.test(short)) return 0.85;
  return 0;
}

export function connectionsAt(company: string, connections: Connection[]): Connection[] {
  if (!company.trim()) return [];
  return connections
    .map((c) => ({ c, score: companyMatch(company, c.company) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.c);
}

export function referralsAt(company: string, referrals: Referral[]): Referral[] {
  return referrals.filter((r) => companyMatch(company, r.company) > 0);
}

const STOP = new Set(
  'a an and the of for to in at on with i ii iii iv intern internship interns co op coop student new grad graduate junior senior sr jr staff principal summer fall winter spring term contract temporary remote hybrid full part time'.split(' '),
);

/** Words that mean the same kind of work. */
const SAME: Record<string, string> = {
  developer: 'engineer',
  programmer: 'engineer',
  swe: 'engineer',
  sde: 'engineer',
  dev: 'engineer',
  engineering: 'engineer',
  analytics: 'analyst',
  scientist: 'science',
  designer: 'design',
  marketer: 'marketing',
  accountant: 'accounting',
};

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 1 && !STOP.has(w))
      .map((w) => SAME[w] ?? w.replace(/s$/, '')),
  );
}

const RECRUITING = /\b(recruit\w*|talent|sourc(er|ing)|people partner|people operations|human resources|hr|hiring)\b/i;
const LEADS = /\b(manager|lead|head|director|vp|vice president|chief|founder|cto|ceo)\b/i;

export interface Ranked {
  connection: Connection;
  score: number;
  /** Why they are a good person to ask, in a few words. */
  reason: string;
}

/** Order the people at a company by how well placed they are to refer you for this role. */
export function rankForRole(connections: Connection[], jobTitle: string, now = Date.now()): Ranked[] {
  const role = words(jobTitle);
  return connections
    .map((connection) => {
      const position = connection.position;
      const theirs = words(position);
      const shared = [...role].filter((w) => theirs.has(w));
      let score = shared.length * 3;
      let reason = shared.length > 0 ? 'Does the same kind of work as this role' : '';
      if (RECRUITING.test(position)) {
        score += 2.5;
        reason = `Recruits for the company`;
      } else if (LEADS.test(position) && shared.length > 0) {
        score += 1.5;
        reason = 'Leads that kind of work there';
      }
      // Someone you connected with recently is likelier to remember you.
      const connected = Date.parse(connection.connectedOn);
      if (!Number.isNaN(connected) && now - connected < 2 * 365 * 24 * 3600 * 1000) score += 0.5;
      return { connection, score, reason: reason || 'Works there' };
    })
    .sort((a, b) => b.score - a.score || a.connection.lastName.localeCompare(b.connection.lastName));
}
