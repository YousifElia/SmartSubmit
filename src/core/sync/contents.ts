/**
 * What a sync account keeps, item by item, for the Sync page. The server
 * can't read any of it, so this is worked out from this browser's copy,
 * which after a sync is the account's.
 */
import type { Job, JobSiteAccount, Profile, Referral, Resume, SavedAnswer, TailoredResume } from '../types';

export interface ContentRow {
  key: string;
  label: string;
  /** A few words on what is there. */
  detail: string;
  /** How many, for the rows that are lists. */
  count: number | null;
  /** Whether anything is there at all. */
  filled: boolean;
}

export interface ContentsInput {
  profile: Profile;
  resumes: Resume[];
  jobs: Job[];
  answers: SavedAnswer[];
  tailored: TailoredResume[];
  referrals: Referral[];
  jobSiteAccount: JobSiteAccount | null;
}

const APPLIED: ReadonlySet<Job['status']> = new Set(['applied', 'interviewing', 'offer', 'rejected', 'withdrawn']);

function names(list: string[], max = 2): string {
  const shown = list.filter(Boolean).slice(0, max);
  const more = list.filter(Boolean).length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}

function list(key: string, label: string, count: number, detail: string, empty = 'None yet'): ContentRow {
  return { key, label, count, detail: count > 0 ? detail : empty, filled: count > 0 };
}

export function accountContents(input: ContentsInput): ContentRow[] {
  const { profile: p } = input;
  const name = [p.preferredName || p.firstName, p.lastName].filter(Boolean).join(' ');
  const contact = [p.email && 'email', p.phone && 'phone', p.address.city && 'address'].filter(Boolean) as string[];
  const links = (
    [
      ['LinkedIn', p.links.linkedin],
      ['GitHub', p.links.github],
      ['portfolio', p.links.portfolio],
      ['website', p.links.website],
      ['Twitter', p.links.twitter],
    ] as const
  )
    .filter(([, url]) => url.trim() !== '')
    .map(([label]): string => label)
    .concat(p.links.other.filter((l) => l.url.trim()).map((l) => l.label || 'other link'));
  const authorization = Object.values(p.workAuth).some((a) => a.authorized !== '' || a.sponsorship !== '');
  const common = Object.values(p.preferences).some((v) => v !== '' && v !== 'CAD');
  const files = input.resumes.filter((r) => r.file).length;
  const applied = input.jobs.filter((j) => APPLIED.has(j.status)).length;
  const companies = new Set(input.referrals.map((r) => r.company.trim().toLowerCase()).filter(Boolean)).size;

  return [
    {
      key: 'about',
      label: 'About you',
      detail: name || contact.length ? [name, contact.length ? `with ${contact.join(', ')}` : ''].filter(Boolean).join(' ') : 'Not filled in yet',
      count: null,
      filled: !!(name || contact.length),
    },
    list('links', 'Links', links.length, links.join(', ')),
    list('education', 'Education', p.education.length, names(p.education.map((e) => e.school))),
    list('experience', 'Work experience', p.experience.length, names(p.experience.map((e) => [e.title, e.company].filter(Boolean).join(' at ')))),
    list('skills', 'Skills', p.skills.length, names(p.skills, 4)),
    list('languages', 'Languages', p.languages.filter((l) => l.language.trim()).length, names(p.languages.map((l) => l.language), 4)),
    {
      key: 'questions',
      label: 'Work authorization and common answers',
      detail: authorization || common ? [authorization && 'work authorization', common && 'salary, start date and the like'].filter(Boolean).join('; ') : 'Not filled in yet',
      count: null,
      filled: authorization || common,
    },
    list('resumes', 'Resumes', input.resumes.length, `${names(input.resumes.map((r) => r.name))}${files ? ` (${files} uploaded file${files === 1 ? '' : 's'})` : ''}`),
    list('jobs', 'Applications', input.jobs.length, `${applied} applied${input.jobs.length > applied ? `, ${input.jobs.length - applied} saved or started` : ''}`),
    list('tailored', 'Tailored resumes', input.tailored.length, `for ${new Set(input.tailored.map((t) => t.jobId)).size} job${new Set(input.tailored.map((t) => t.jobId)).size === 1 ? '' : 's'}`),
    list('answers', 'Saved answers', input.answers.length, names(input.answers.map((a) => a.question), 1)),
    list('referrals', 'Referrals', input.referrals.length, `at ${companies} compan${companies === 1 ? 'y' : 'ies'}`),
    {
      key: 'jobsite',
      label: 'Job site sign-in',
      detail: input.jobSiteAccount?.password ? 'Saved' : input.jobSiteAccount?.email ? 'Email saved, no password' : 'Not saved',
      count: null,
      filled: !!input.jobSiteAccount,
    },
  ];
}

/** Whether there is nothing at all to keep. */
export function nothingToKeep(rows: ContentRow[]): boolean {
  return rows.every((r) => !r.filled);
}
