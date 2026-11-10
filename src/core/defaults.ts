import type { CountryAuth, Education, Experience, Profile, ResumeDoc, Settings } from './types';
import { newId } from './util/id';

export function emptyCountryAuth(): CountryAuth {
  return { authorized: '', sponsorship: '', status: '', detail: '' };
}

export function emptyProfile(): Profile {
  return {
    firstName: '',
    middleName: '',
    lastName: '',
    preferredName: '',
    pronouns: '',
    email: '',
    phone: '',
    phoneCountry: 'CA',
    address: { line1: '', line2: '', city: '', region: '', postalCode: '', country: 'CA' },
    links: { linkedin: '', github: '', portfolio: '', website: '', twitter: '', other: [] },
    education: [],
    experience: [],
    workAuth: { CA: emptyCountryAuth(), US: emptyCountryAuth() },
    preferences: {
      salary: '',
      salaryCurrency: 'CAD',
      startDate: '',
      noticePeriod: '',
      relocate: '',
      workMode: '',
      over18: '',
      howHeard: '',
      yearsExperience: '',
    },
    demographics: {
      gender: '',
      race: [],
      hispanic: '',
      veteran: '',
      disability: '',
      indigenous: '',
      visibleMinority: '',
    },
  };
}

export function emptyEducation(): Education {
  return {
    id: newId(),
    school: '',
    degree: '',
    degreeName: '',
    field: '',
    minor: '',
    start: '',
    end: '',
    current: false,
    gpa: '',
    gpaScale: '',
    city: '',
    region: '',
    country: '',
  };
}

export function emptyExperience(): Experience {
  return {
    id: newId(),
    company: '',
    title: '',
    location: '',
    type: '',
    start: '',
    end: '',
    current: false,
    description: '',
  };
}

export function emptyResumeDoc(): ResumeDoc {
  return {
    basics: { name: '', email: '', phone: '', location: '', links: [] },
    summary: '',
    experience: [],
    education: [],
    projects: [],
    skills: [],
    extras: [],
    order: [],
  };
}

export function defaultSettings(): Settings {
  return {
    onboarded: false,
    ai: {
      provider: 'none',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: '',
      compatUrl: 'http://localhost:1234/v1',
      compatKey: '',
      compatModel: '',
    },
    autofill: {
      autoRun: false,
      highlight: true,
      learn: true,
      similarThreshold: 0.72,
      demographics: true,
    },
    pdf: { pageSize: 'letter' },
    sync: {
      url: (import.meta.env?.WXT_SUPABASE_URL as string | undefined) ?? '',
      key: (import.meta.env?.WXT_SUPABASE_KEY as string | undefined) ?? '',
    },
    panel: { side: 'right', hiddenHosts: [] },
  };
}

/**
 * Fill in anything missing from a stored value using the defaults, so data
 * written by an older version keeps working after fields are added.
 */
export function withDefaults<T>(defaults: T, stored: unknown): T {
  if (stored === null || stored === undefined) return defaults;
  if (Array.isArray(defaults)) return (Array.isArray(stored) ? stored : defaults) as T;
  if (typeof defaults !== 'object' || defaults === null) {
    return (typeof stored === typeof defaults ? stored : defaults) as T;
  }
  if (typeof stored !== 'object' || Array.isArray(stored)) return defaults;
  const out: Record<string, unknown> = { ...(stored as Record<string, unknown>) };
  for (const [key, value] of Object.entries(defaults as Record<string, unknown>)) {
    out[key] = withDefaults(value, (stored as Record<string, unknown>)[key]);
  }
  return out as T;
}
