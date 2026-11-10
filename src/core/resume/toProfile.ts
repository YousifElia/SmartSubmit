/**
 * Filling the profile from a parsed resume, so a new user does not have to
 * type what their resume already says. Only empty profile fields are filled;
 * nothing the user entered is replaced.
 */
import { MONTHS } from '../data/choices';
import { COUNTRIES, findRegion } from '../data/geo';
import { emptyEducation, emptyExperience } from '../defaults';
import type { DegreeLevel, Education, Experience, Profile, ResumeDoc } from '../types';

/** "Sep 2023", "09/2023", "September 2023" or "2023" → 'YYYY-MM' / 'YYYY'. */
export function toYearMonth(text: string): string {
  const t = text.trim().toLowerCase();
  if (!t || /present|current|now|ongoing/.test(t)) return '';
  const year = /(19|20)\d{2}/.exec(t)?.[0];
  if (!year) return '';
  const numeric = /\b(\d{1,2})\/(?:19|20)\d{2}/.exec(t);
  if (numeric) {
    const month = Number(numeric[1]);
    return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, '0')}` : year;
  }
  const index = MONTHS.findIndex((m) => t.includes(m.slice(0, 3).toLowerCase()));
  if (index >= 0) return `${year}-${String(index + 1).padStart(2, '0')}`;
  const season: Record<string, string> = { winter: '01', spring: '05', summer: '08', fall: '12', autumn: '12' };
  for (const [name, month] of Object.entries(season)) if (t.includes(name)) return `${year}-${month}`;
  return year;
}

function isOpenEnded(text: string): boolean {
  return /present|current|now|ongoing/i.test(text);
}

function degreeLevel(text: string): DegreeLevel {
  const t = text.toLowerCase();
  if (/\b(ph\.?\s?d|doctor of philosophy|doctorate|doctoral)\b/.test(t)) return 'doctorate';
  if (/\b(m\.?b\.?a|master of business administration)\b/.test(t)) return 'mba';
  if (/\b(j\.?d\.?|juris doctor)\b/.test(t)) return 'jd';
  if (/\b(m\.?d\.?|doctor of medicine)\b/.test(t)) return 'md';
  if (/\b(master|m\.?sc?\.?|m\.?a\.?|m\.?eng\.?|m\.?a\.?sc\.?)\b/.test(t)) return 'master';
  if (/\b(bachelor|b\.?sc?\.?|b\.?a\.?|b\.?eng\.?|b\.?a\.?sc\.?|b\.?c\.?s\.?|b\.?b\.?a\.?|b\.?comm?\.?|undergraduate|honou?rs)\b/.test(t)) return 'bachelor';
  if (/\bassociate\b/.test(t)) return 'associate';
  if (/\b(diploma|advanced diploma)\b/.test(t)) return /high school|secondary/.test(t) ? 'high-school' : 'diploma';
  if (/\b(high school|secondary|ossd|ged)\b/.test(t)) return 'high-school';
  if (/\bcertificat/.test(t)) return 'certificate';
  return '';
}

/** "Bachelor of Science in Computer Science" → "Computer Science". */
function fieldOfStudy(degree: string): string {
  const inField = /\b(?:in|of)\s+([A-Z][A-Za-z&/ -]+?)(?:\s*\(|,|$)/g;
  let last = '';
  for (let match = inField.exec(degree); match; match = inField.exec(degree)) {
    const candidate = match[1]!.trim();
    // "Bachelor of Science" names the degree, not the field.
    if (!/^(science|arts|engineering|applied science|commerce|business administration|technology|philosophy|laws?)$/i.test(candidate) || !last) {
      last = candidate;
    }
  }
  return /^(science|arts|engineering|applied science|commerce|business administration|technology|philosophy|laws?)$/i.test(last) ? '' : last;
}

/** Split "Windsor, ON" or "Windsor, Ontario, Canada" into city, region and country. */
export function splitLocation(text: string): { city: string; region: string; country: string } {
  const pieces = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (pieces.length === 0) return { city: '', region: '', country: '' };
  const city = pieces[0]!;
  let region = '';
  let country = '';
  for (const piece of pieces.slice(1)) {
    const found = findRegion(piece);
    if (found && !region) {
      region = found.name;
      country ||= found.country;
      continue;
    }
    const lower = piece.toLowerCase();
    const match = COUNTRIES.find((c) => c.name.toLowerCase() === lower || c.code.toLowerCase() === lower || c.aliases.some((a) => a.toLowerCase() === lower));
    if (match) country = match.code;
    else if (!region) region = piece;
  }
  return { city, region, country };
}

function splitName(name: string): { first: string; middle: string; last: string } {
  // Resumes often shout the name; store it in normal case.
  const tidy = name === name.toUpperCase() ? name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : name;
  const words = tidy.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { first: '', middle: '', last: '' };
  if (words.length === 1) return { first: words[0]!, middle: '', last: '' };
  return { first: words[0]!, middle: words.slice(1, -1).join(' '), last: words[words.length - 1]! };
}

function withScheme(link: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(link) ? link : `https://${link}`;
}

export interface ProfileImport {
  profile: Profile;
  /** What was filled in, for telling the user. */
  filled: string[];
}

/** Fill empty profile fields from a parsed resume. */
export function profileFromResume(doc: ResumeDoc, current: Profile): ProfileImport {
  const profile: Profile = structuredClone(current);
  const filled: string[] = [];
  const set = (label: string, isEmpty: boolean, apply: () => void, available: boolean) => {
    if (isEmpty && available) {
      apply();
      filled.push(label);
    }
  };

  const name = splitName(doc.basics.name);
  set('name', !profile.firstName && !profile.lastName, () => {
    profile.firstName = name.first;
    profile.middleName = name.middle;
    profile.lastName = name.last;
  }, !!name.first);
  set('email', !profile.email, () => (profile.email = doc.basics.email), !!doc.basics.email);

  const digits = doc.basics.phone.replace(/\D/g, '');
  set('phone', !profile.phone, () => {
    // A leading 1 on an eleven-digit number is the North American country code.
    profile.phone = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : doc.basics.phone.replace(/^\+\d{1,3}\s*/, '').trim();
  }, digits.length >= 7);

  const place = splitLocation(doc.basics.location);
  set('location', !profile.address.city, () => {
    profile.address.city = place.city;
    if (place.region) profile.address.region = place.region;
    if (place.country) {
      profile.address.country = place.country;
      if (!current.phone) profile.phoneCountry = place.country;
    }
  }, !!place.city);

  for (const raw of doc.basics.links) {
    const link = withScheme(raw);
    if (/linkedin\.com/i.test(link)) set('LinkedIn', !profile.links.linkedin, () => (profile.links.linkedin = link), true);
    else if (/github\.com/i.test(link)) set('GitHub', !profile.links.github, () => (profile.links.github = link), true);
    else set('website', !profile.links.website, () => (profile.links.website = link), true);
  }

  set('education', profile.education.length === 0, () => {
    profile.education = doc.education.map((e): Education => {
      const where = splitLocation(e.location);
      const gpa = /\bc?gpa:?\s*(\d(?:\.\d+)?)(?:\s*\/\s*(\d(?:\.\d+)?))?/i.exec(e.details.join(' '));
      return {
        ...emptyEducation(),
        school: e.school,
        degree: degreeLevel(e.degree),
        degreeName: e.degree,
        field: fieldOfStudy(e.degree),
        start: toYearMonth(e.start),
        end: toYearMonth(e.end),
        current: isOpenEnded(e.end) || (toYearMonth(e.end) !== '' && toYearMonth(e.end) > new Date().toISOString().slice(0, 7)),
        gpa: gpa?.[1] ?? '',
        gpaScale: gpa?.[2] ?? '',
        city: where.city,
        region: where.region,
        country: where.country,
      };
    });
  }, doc.education.length > 0);

  set('work experience', profile.experience.length === 0, () => {
    profile.experience = doc.experience.map((e): Experience => ({
      ...emptyExperience(),
      company: e.company,
      title: e.title,
      location: e.location,
      type: /\bco-?op\b/i.test(e.title) ? 'co-op' : /\bintern/i.test(e.title) ? 'internship' : '',
      start: toYearMonth(e.start),
      end: toYearMonth(e.end),
      current: isOpenEnded(e.end),
      description: e.bullets.join('\n'),
    }));
  }, doc.experience.length > 0);

  return { profile, filled };
}
