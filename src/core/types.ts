/**
 * SmartSubmit data model.
 *
 * Everything the extension knows about the user lives in these shapes. They
 * are stored locally (see `storage/db.ts`) and, when sync is on, encrypted and
 * mirrored to the user's own backend.
 */

export type Tri = 'yes' | 'no' | '';
/** 'YYYY-MM' (month precision) or 'YYYY' or ''. */
export type YearMonth = string;
/** 'YYYY-MM-DD' or ''. */
export type IsoDate = string;

// ───────────────────────────── Profile ─────────────────────────────

export type DegreeLevel =
  | ''
  | 'high-school'
  | 'associate'
  | 'diploma'
  | 'bachelor'
  | 'master'
  | 'mba'
  | 'jd'
  | 'md'
  | 'doctorate'
  | 'certificate'
  | 'other';

export interface Education {
  id: string;
  school: string;
  /** Canonical level, used to pick from degree dropdowns. */
  degree: DegreeLevel;
  /** Exact wording, e.g. "Bachelor of Computer Science (Honours)". */
  degreeName: string;
  /** Major / field of study. */
  field: string;
  minor: string;
  start: YearMonth;
  /** Graduation date, actual or expected. */
  end: YearMonth;
  /** Still enrolled. */
  current: boolean;
  gpa: string;
  gpaScale: string;
  city: string;
  region: string;
  country: string;
}

export type EmploymentType = '' | 'full-time' | 'part-time' | 'internship' | 'co-op' | 'contract';

export interface Experience {
  id: string;
  company: string;
  title: string;
  location: string;
  type: EmploymentType;
  start: YearMonth;
  end: YearMonth;
  current: boolean;
  description: string;
}

/** How well someone speaks a language, from the top. */
export type LanguageLevel = '' | 'native' | 'fluent' | 'advanced' | 'intermediate' | 'beginner';

export interface SpokenLanguage {
  id: string;
  /** e.g. "English", "French". */
  language: string;
  level: LanguageLevel;
}

export type AuthStatus =
  | ''
  | 'citizen'
  | 'permanent-resident'
  | 'work-permit'
  | 'study-permit'
  | 'visa'
  | 'none';

export interface CountryAuth {
  /** Legally authorized to work in this country. */
  authorized: Tri;
  /** Requires employer sponsorship now or in the future. */
  sponsorship: Tri;
  status: AuthStatus;
  /** Free text, e.g. "F-1 OPT", "TN", "Co-op work permit". */
  detail: string;
}

export type Gender = '' | 'male' | 'female' | 'non-binary' | 'other' | 'decline';
export type Race =
  | 'american-indian'
  | 'asian'
  | 'black'
  | 'hispanic'
  | 'middle-eastern'
  | 'pacific-islander'
  | 'white'
  | 'two-or-more'
  | 'decline';
export type TriDecline = '' | 'yes' | 'no' | 'decline';
export type VeteranStatus = '' | 'veteran' | 'not-veteran' | 'decline';

export interface Demographics {
  gender: Gender;
  /** One or more; `two-or-more` is derived when several are chosen. */
  race: Race[];
  hispanic: TriDecline;
  veteran: VeteranStatus;
  disability: TriDecline;
  /** Canadian employment-equity categories. */
  indigenous: TriDecline;
  visibleMinority: TriDecline;
}

export interface LinkEntry {
  label: string;
  url: string;
}

export interface Profile {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  email: string;
  /** National number as the user types it; `phoneCountry` holds the region. */
  phone: string;
  /** ISO country code for the phone number: 'CA', 'US', ... */
  phoneCountry: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    /** Province / state, stored as its full name. */
    region: string;
    postalCode: string;
    /** ISO country code. */
    country: string;
  };
  links: {
    linkedin: string;
    github: string;
    portfolio: string;
    website: string;
    twitter: string;
    other: LinkEntry[];
  };
  education: Education[];
  experience: Experience[];
  /** Skills and tools, most important first. */
  skills: string[];
  /** Languages spoken, most fluent first. */
  languages: SpokenLanguage[];
  /** Keyed by ISO country code. CA and US are always present. */
  workAuth: Record<string, CountryAuth>;
  preferences: {
    salary: string;
    salaryCurrency: string;
    /** Earliest start date; free text is allowed ("Immediately", "May 2027"). */
    startDate: string;
    noticePeriod: string;
    relocate: Tri;
    workMode: '' | 'remote' | 'hybrid' | 'onsite';
    over18: Tri;
    /** Default answer to "How did you hear about us?". */
    howHeard: string;
    yearsExperience: string;
  };
  demographics: Demographics;
}

// ───────────────────────────── Resumes ─────────────────────────────

/** A structured resume: what tailoring edits and what the PDF is built from. */
export interface ResumeDoc {
  basics: {
    name: string;
    email: string;
    phone: string;
    location: string;
    links: string[];
  };
  summary: string;
  experience: ResumeExperience[];
  education: ResumeEducation[];
  projects: ResumeProject[];
  skills: ResumeSkillGroup[];
  /** Any other section: certifications, awards, publications, volunteering. */
  extras: ResumeExtra[];
  /**
   * Order of the sections on the page: 'summary', 'education', 'experience',
   * 'projects', 'skills', or `extra:<title>` for one of the extras. Sections
   * not listed follow in the default order.
   */
  order: string[];
}

export interface ResumeExperience {
  company: string;
  title: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  location: string;
  start: string;
  end: string;
  details: string[];
}

export interface ResumeProject {
  name: string;
  /** Short qualifier shown beside the name: tech stack or a link. */
  subtitle: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface ResumeSkillGroup {
  /** e.g. "Languages". Empty for an unlabelled list. */
  category: string;
  items: string[];
}

export interface ResumeExtra {
  title: string;
  items: string[];
}

export interface Resume {
  id: string;
  name: string;
  isDefault: boolean;
  /** Where the text came from. A LaTeX upload keeps no file: a PDF is built from its sections. */
  source: 'paste' | 'upload' | 'latex';
  /** Plain text of the resume, as pasted or extracted from the upload. */
  text: string;
  /** Structured form; present once parsed (automatically or by AI) or edited. */
  doc: ResumeDoc | null;
  /** The original uploaded file, attached as-is when present. */
  file: { id: string; name: string; mime: string; size: number } | null;
  createdAt: number;
}

/** A resume rewritten for one job. The PDF is rebuilt from `doc` on demand. */
export interface TailoredResume {
  id: string;
  resumeId: string;
  jobId: string;
  doc: ResumeDoc;
  changes: TailorChange[];
  gaps: string[];
  via: 'ollama' | 'openai-compat' | 'claude-handoff' | 'manual';
  createdAt: number;
}

export interface TailorChange {
  section: string;
  before: string;
  after: string;
  reason: string;
}

// ─────────────────────────── Saved answers ───────────────────────────

export type AnswerKind = 'text' | 'choice' | 'multi' | 'boolean';

/** A question the user answered once and wants reused. */
export interface SavedAnswer {
  id: string;
  /** Question wording as it appeared on the form. */
  question: string;
  /** Normalised form used for matching (see `autofill/answers.ts`). */
  norm: string;
  kind: AnswerKind;
  /** Text, the chosen option's text, or several option texts. */
  answer: string | string[];
  /** Options that were on offer when it was saved, if any. */
  options: string[];
  /** Hostname where it was first saved. Informational only. */
  host: string;
  uses: number;
  createdAt: number;
}

// ─────────────────────────────── Jobs ───────────────────────────────

export type JobStatus =
  | 'saved'
  | 'started'
  | 'applied'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

/** A block of job-description content, already reduced to safe plain data. */
export type RichBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; runs: RichRun[] }
  | { type: 'bullet'; runs: RichRun[]; level: number };

export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface Job {
  id: string;
  /** Stable identity across visits: `${site}:${postingId}` (see `jobs/extract.ts`). */
  key: string;
  site: string;
  url: string;
  title: string;
  company: string;
  location: string;
  /** Plain-text job description. */
  description: string;
  /** The same description as structured blocks, for the PDF. */
  blocks: RichBlock[];
  capturedAt: number;
  status: JobStatus;
  appliedAt: number | null;
  /** Which resume was attached: a Resume id or a TailoredResume id. */
  resumeRef: { kind: 'resume' | 'tailored'; id: string } | null;
  notes: string;
  /** Keyword match score against the resume used, 0–100, or null if not run. */
  score: number | null;
}

// ───────────────────────────── Settings ─────────────────────────────

export type AiProvider = 'none' | 'ollama' | 'openai-compat';

/** Device-local settings. These are never synced. */
export interface Settings {
  onboarded: boolean;
  ai: {
    provider: AiProvider;
    ollamaUrl: string;
    ollamaModel: string;
    compatUrl: string;
    compatKey: string;
    compatModel: string;
  };
  autofill: {
    /** Fill as soon as a form is detected instead of waiting for a click. */
    autoRun: boolean;
    /** Outline filled / review / unanswered fields on the page. */
    highlight: boolean;
    /** Offer to save answers to questions SmartSubmit didn't know. */
    learn: boolean;
    /** Similarity (0–1) above which a saved answer is reused and flagged. */
    similarThreshold: number;
    /** Include the optional demographic questions when autofilling. */
    demographics: boolean;
  };
  pdf: {
    pageSize: 'letter' | 'a4';
  };
  sync: {
    /** Supabase project URL, e.g. https://abc.supabase.co. */
    url: string;
    /** Supabase publishable (anon) key. Public by design. */
    key: string;
  };
  panel: {
    side: 'right' | 'left';
    /** Hosts where the user has hidden the panel. */
    hiddenHosts: string[];
  };
  /**
   * Where versions before 0.2.1 kept the job site account; moved to the
   * synced `credentials` collection when the background starts.
   */
  account: {
    /** Empty to use the profile's email. */
    email: string;
    password: string;
  };
}

// ───────────────────────────── Referrals ─────────────────────────────

/** One of the user's LinkedIn connections, from LinkedIn's own data export. */
export interface Connection {
  firstName: string;
  lastName: string;
  /** Their LinkedIn profile address. */
  url: string;
  /** Only when they let connections see it. */
  email: string;
  company: string;
  position: string;
  /** As LinkedIn writes it, e.g. "12 Nov 2024". */
  connectedOn: string;
}

/**
 * The imported connections. Kept on this browser only: they are other
 * people's details, so they are never synced or put in a backup.
 */
export interface Connections {
  importedAt: number;
  items: Connection[];
}

export type ReferralStatus = 'to-ask' | 'asked' | 'agreed' | 'referred' | 'declined';

/** Someone at a company who could refer the user, and where asking them stands. */
export interface Referral {
  id: string;
  name: string;
  company: string;
  /** Their job title. */
  title: string;
  linkedin: string;
  email: string;
  /** How they know each other: "Former coworker", "Classmate". */
  relationship: string;
  status: ReferralStatus;
  /** The tracked jobs at that company this referral is for. */
  jobIds: string[];
  notes: string;
  askedAt: number | null;
  createdAt: number;
}

/**
 * The email and password for accounts on application systems (Workday and
 * iCIMS make one per employer). Synced, encrypted, like everything else in
 * the account; never put in a backup file, and only handed to those
 * systems' own pages.
 */
export interface JobSiteAccount {
  /** Empty to use the profile's email. */
  email: string;
  password: string;
}

export const JOB_SITE_ACCOUNT_ID = 'jobsites';

// ─────────────────────────── Collections ───────────────────────────

/**
 * Synced collections. `profile` holds a single record with id `me`; the rest
 * hold many records keyed by random id.
 */
export interface CollectionMap {
  profile: Profile;
  resumes: Resume;
  tailored: TailoredResume;
  answers: SavedAnswer;
  jobs: Job;
  referrals: Referral;
  credentials: JobSiteAccount;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTIONS: CollectionName[] = ['profile', 'resumes', 'tailored', 'answers', 'jobs', 'referrals', 'credentials'];

/** Never written to a backup file, which is plain text: the job site password. */
export const NOT_IN_BACKUPS: ReadonlySet<CollectionName> = new Set<CollectionName>(['credentials']);

export const PROFILE_ID = 'me';

/** Envelope every stored record is wrapped in. */
export interface Rec<T> {
  id: string;
  /** Milliseconds since epoch of the last local or remote change. */
  updatedAt: number;
  /** Deletion marker, kept until sync has propagated it. */
  deleted?: boolean;
  /** Absent only on deletion markers. */
  data: T;
}
