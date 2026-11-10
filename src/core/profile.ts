/** Derived views of the profile, shared by the dashboard and the autofill engine. */
import { countryByCode } from './data/geo';
import type { Education, Experience, Profile } from './types';

export function fullName(p: Profile): string {
  return [p.firstName, p.middleName, p.lastName].map((s) => s.trim()).filter(Boolean).join(' ');
}

/** "First Last", without the middle name: what most single name fields expect. */
export function shortName(p: Profile): string {
  return [p.firstName, p.lastName].map((s) => s.trim()).filter(Boolean).join(' ');
}

/** Sort key for 'YYYY-MM' / 'YYYY' values; empty sorts last (treated as ongoing). */
function ymKey(value: string): string {
  return value ? value.padEnd(7, '-12') : '9999-12';
}

/** Education entries, most recent first. */
export function educationByRecency(p: Profile): Education[] {
  return [...p.education].sort((a, b) => ymKey(b.end).localeCompare(ymKey(a.end)));
}

/** Experience entries, most recent first, with current roles on top. */
export function experienceByRecency(p: Profile): Experience[] {
  return [...p.experience].sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    const end = ymKey(b.end).localeCompare(ymKey(a.end));
    return end !== 0 ? end : ymKey(b.start).localeCompare(ymKey(a.start));
  });
}

/** Digits of the phone number, without any country code. */
export function phoneDigits(p: Profile): string {
  let digits = p.phone.replace(/\D/g, '');
  const dial = countryByCode(p.phoneCountry)?.dial ?? '';
  // Drop a leading country code the user typed in themselves.
  if (dial && p.phone.trim().startsWith('+') && digits.startsWith(dial)) digits = digits.slice(dial.length);
  if (dial === '1' && digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits;
}

export type PhoneStyle = 'national' | 'international' | 'e164' | 'digits';

/** Format the phone number the way a form is likely to want it. */
export function formatPhone(p: Profile, style: PhoneStyle = 'national'): string {
  const digits = phoneDigits(p);
  if (!digits) return '';
  const dial = countryByCode(p.phoneCountry)?.dial ?? '';
  const nanp = dial === '1' && digits.length === 10;
  const pretty = nanp ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
  switch (style) {
    case 'digits':
      return digits;
    case 'e164':
      return dial ? `+${dial}${digits}` : digits;
    case 'international':
      return dial ? `+${dial} ${nanp ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : digits}` : pretty;
    default:
      return pretty;
  }
}

/** "City, Region" as most location fields expect. */
export function cityRegion(p: Profile): string {
  return [p.address.city, p.address.region].map((s) => s.trim()).filter(Boolean).join(', ');
}

export interface Completeness {
  percent: number;
  missing: string[];
}

/** How much of the profile that forms commonly ask for has been filled in. */
export function profileCompleteness(p: Profile): Completeness {
  const checks: [string, boolean][] = [
    ['First name', !!p.firstName.trim()],
    ['Last name', !!p.lastName.trim()],
    ['Email', !!p.email.trim()],
    ['Phone', !!p.phone.trim()],
    ['City', !!p.address.city.trim()],
    ['Province or state', !!p.address.region.trim()],
    ['LinkedIn', !!p.links.linkedin.trim()],
    ['Education', p.education.some((e) => e.school.trim())],
    ['Work experience', p.experience.some((e) => e.company.trim())],
    [
      'Work authorization',
      Object.values(p.workAuth).some((a) => a.authorized !== '' || a.sponsorship !== ''),
    ],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([, ok]) => !ok).map(([label]) => label),
  };
}
