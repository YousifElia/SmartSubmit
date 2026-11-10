/**
 * Profile form sections. Each one edits a slice of the profile and is used
 * both by the onboarding wizard and by the dashboard's Profile page.
 */
import { Plus, Trash2 } from 'lucide-react';
import {
  AUTH_STATUSES,
  DEGREES,
  DISABILITY,
  EMPLOYMENT_TYPES,
  GENDERS,
  MONTHS,
  RACES,
  TRI_DECLINE,
  VETERAN,
  WORK_MODES,
} from '@/core/data/choices';
import { COUNTRIES, regionsOf } from '@/core/data/geo';
import { emptyCountryAuth, emptyEducation, emptyExperience } from '@/core/defaults';
import type {
  AuthStatus,
  CountryAuth,
  DegreeLevel,
  Education,
  EmploymentType,
  Experience,
  Gender,
  Profile,
  Race,
  Tri,
  TriDecline,
  VeteranStatus,
  YearMonth,
} from '@/core/types';
import { Button, Checkbox, Field, Grid, Notice, Segmented, SelectField, TextArea, TextField } from '../kit';

export interface SectionProps {
  profile: Profile;
  onChange: (next: Profile) => void;
}

const COUNTRY_OPTIONS = [
  // The two the profile is tuned for, then everything else alphabetically.
  ...COUNTRIES.filter((c) => c.code === 'CA' || c.code === 'US'),
  ...COUNTRIES.filter((c) => c.code !== 'CA' && c.code !== 'US'),
].map((c) => ({ value: c.code, label: c.name }));

const DIAL_OPTIONS = [
  ...COUNTRIES.filter((c) => c.code === 'CA' || c.code === 'US'),
  ...COUNTRIES.filter((c) => c.code !== 'CA' && c.code !== 'US'),
].map((c) => ({ value: c.code, label: `${c.name} (+${c.dial})` }));

const YES_NO: readonly { value: 'yes' | 'no'; label: string }[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** Month + year picker producing 'YYYY-MM', 'YYYY' or ''. Works in Firefox, which has no month input. */
export function MonthField({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: YearMonth;
  onChange: (value: YearMonth) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [year = '', month = ''] = value.split('-');
  const update = (y: string, m: string) => {
    const cleanYear = y.replace(/\D/g, '').slice(0, 4);
    if (!cleanYear) return onChange('');
    onChange(m ? `${cleanYear}-${m}` : cleanYear);
  };
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <select
          aria-label={`${label} month`}
          disabled={disabled}
          value={month}
          onChange={(e) => update(year, e.target.value)}
          className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={String(i + 1).padStart(2, '0')}>
              {name}
            </option>
          ))}
        </select>
        <input
          aria-label={`${label} year`}
          disabled={disabled}
          inputMode="numeric"
          placeholder="Year"
          value={year}
          onChange={(e) => update(e.target.value, month)}
          className="block w-24 shrink-0 rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>
    </Field>
  );
}

function RegionField({
  country,
  value,
  onChange,
}: {
  country: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const regions = regionsOf(country);
  const label = country === 'CA' ? 'Province' : country === 'US' ? 'State' : 'State / region';
  if (regions.length === 0) return <TextField label={label} value={value} onChange={onChange} autoComplete="address-level1" />;
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={regions.map((r) => ({ value: r.name, label: r.name }))}
    />
  );
}

// ───────────────────────────── Basics ─────────────────────────────

export function BasicsSection({ profile, onChange }: SectionProps) {
  const set = (patch: Partial<Profile>) => onChange({ ...profile, ...patch });
  const setAddress = (patch: Partial<Profile['address']>) =>
    onChange({ ...profile, address: { ...profile.address, ...patch } });

  return (
    <div className="space-y-4">
      <Grid cols={3}>
        <TextField label="First name" value={profile.firstName} onChange={(v) => set({ firstName: v })} autoComplete="given-name" />
        <TextField label="Middle name" value={profile.middleName} onChange={(v) => set({ middleName: v })} autoComplete="additional-name" />
        <TextField label="Last name" value={profile.lastName} onChange={(v) => set({ lastName: v })} autoComplete="family-name" />
      </Grid>
      <Grid>
        <TextField
          label="Preferred name"
          hint="Used when a form asks for it. Leave blank to use your first name."
          value={profile.preferredName}
          onChange={(v) => set({ preferredName: v })}
        />
        <TextField label="Pronouns" placeholder="she/her, he/him, they/them" value={profile.pronouns} onChange={(v) => set({ pronouns: v })} />
      </Grid>
      <Grid>
        <TextField label="Email" type="email" value={profile.email} onChange={(v) => set({ email: v })} autoComplete="email" />
        <Field label="Phone">
          <div className="flex gap-2">
            <select
              aria-label="Phone country"
              value={profile.phoneCountry}
              onChange={(e) => set({ phoneCountry: e.target.value })}
              className="block w-40 shrink-0 rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
            >
              {DIAL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              aria-label="Phone number"
              type="tel"
              autoComplete="tel-national"
              placeholder="519 555 0142"
              value={profile.phone}
              onChange={(e) => set({ phone: e.target.value })}
              className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600"
            />
          </div>
        </Field>
      </Grid>

      <div className="border-t border-slate-100 pt-4">
        <h3 className="mb-3 text-[13px] font-semibold text-slate-700">Address</h3>
        <div className="space-y-4">
          <Grid>
            <TextField label="Street address" value={profile.address.line1} onChange={(v) => setAddress({ line1: v })} autoComplete="address-line1" />
            <TextField label="Apartment, suite, etc." value={profile.address.line2} onChange={(v) => setAddress({ line2: v })} autoComplete="address-line2" />
          </Grid>
          <Grid>
            <TextField label="City" value={profile.address.city} onChange={(v) => setAddress({ city: v })} autoComplete="address-level2" />
            <RegionField country={profile.address.country} value={profile.address.region} onChange={(v) => setAddress({ region: v })} />
          </Grid>
          <Grid>
            <TextField
              label={profile.address.country === 'US' ? 'ZIP code' : 'Postal code'}
              value={profile.address.postalCode}
              onChange={(v) => setAddress({ postalCode: v })}
              autoComplete="postal-code"
            />
            <SelectField
              label="Country"
              value={profile.address.country}
              onChange={(v) => setAddress({ country: v, region: v === profile.address.country ? profile.address.region : '' })}
              options={COUNTRY_OPTIONS}
            />
          </Grid>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Links ─────────────────────────────

export function LinksSection({ profile, onChange }: SectionProps) {
  const setLinks = (patch: Partial<Profile['links']>) => onChange({ ...profile, links: { ...profile.links, ...patch } });
  const other = profile.links.other;
  return (
    <div className="space-y-4">
      <Grid>
        <TextField label="LinkedIn" placeholder="https://www.linkedin.com/in/…" value={profile.links.linkedin} onChange={(v) => setLinks({ linkedin: v })} />
        <TextField label="GitHub" placeholder="https://github.com/…" value={profile.links.github} onChange={(v) => setLinks({ github: v })} />
      </Grid>
      <Grid>
        <TextField label="Portfolio" placeholder="https://…" value={profile.links.portfolio} onChange={(v) => setLinks({ portfolio: v })} />
        <TextField label="Personal website" placeholder="https://…" value={profile.links.website} onChange={(v) => setLinks({ website: v })} />
      </Grid>
      <Grid>
        <TextField label="X / Twitter" placeholder="https://x.com/…" value={profile.links.twitter} onChange={(v) => setLinks({ twitter: v })} />
      </Grid>
      {other.map((link, i) => (
        <div key={i} className="flex items-end gap-2">
          <TextField
            wrapClassName="w-48 shrink-0"
            label="Label"
            placeholder="Devpost"
            value={link.label}
            onChange={(v) => setLinks({ other: other.map((l, j) => (j === i ? { ...l, label: v } : l)) })}
          />
          <TextField
            wrapClassName="flex-1"
            label="URL"
            value={link.url}
            onChange={(v) => setLinks({ other: other.map((l, j) => (j === i ? { ...l, url: v } : l)) })}
          />
          <Button variant="ghost" aria-label="Remove link" icon={<Trash2 size={16} />} onClick={() => setLinks({ other: other.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={<Plus size={15} />} onClick={() => setLinks({ other: [...other, { label: '', url: '' }] })}>
        Add another link
      </Button>
    </div>
  );
}

// ───────────────────────────── Education ─────────────────────────────

export function EducationSection({ profile, onChange }: SectionProps) {
  const list = profile.education;
  const update = (id: string, patch: Partial<Education>) =>
    onChange({ ...profile, education: list.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  return (
    <div className="space-y-4">
      {list.length === 0 && <p className="text-[13px] text-slate-500">No education added yet. List your most recent first.</p>}
      {list.map((edu, i) => (
        <div key={edu.id} className="rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200/70">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-slate-700">{edu.school || `Education ${i + 1}`}</h3>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={() => onChange({ ...profile, education: list.filter((e) => e.id !== edu.id) })}
            >
              Remove
            </Button>
          </div>
          <div className="space-y-4">
            <TextField label="School" value={edu.school} onChange={(v) => update(edu.id, { school: v })} />
            <Grid>
              <SelectField
                label="Degree level"
                value={edu.degree}
                onChange={(v) => update(edu.id, { degree: v as DegreeLevel })}
                options={DEGREES}
              />
              <TextField
                label="Degree name"
                placeholder="Bachelor of Computer Science (Honours)"
                value={edu.degreeName}
                onChange={(v) => update(edu.id, { degreeName: v })}
              />
            </Grid>
            <Grid>
              <TextField label="Major / field of study" value={edu.field} onChange={(v) => update(edu.id, { field: v })} />
              <TextField label="Minor" value={edu.minor} onChange={(v) => update(edu.id, { minor: v })} />
            </Grid>
            <Grid>
              <MonthField label="Start" value={edu.start} onChange={(v) => update(edu.id, { start: v })} />
              <MonthField
                label={edu.current ? 'Expected graduation' : 'Graduation'}
                value={edu.end}
                onChange={(v) => update(edu.id, { end: v })}
              />
            </Grid>
            <Checkbox checked={edu.current} onChange={(v) => update(edu.id, { current: v })} label="I'm currently enrolled here" />
            <Grid cols={3}>
              <TextField label="GPA" placeholder="3.7" value={edu.gpa} onChange={(v) => update(edu.id, { gpa: v })} />
              <TextField label="GPA scale" placeholder="4.0" value={edu.gpaScale} onChange={(v) => update(edu.id, { gpaScale: v })} />
              <TextField label="City" value={edu.city} onChange={(v) => update(edu.id, { city: v })} />
            </Grid>
          </div>
        </div>
      ))}
      <Button icon={<Plus size={15} />} onClick={() => onChange({ ...profile, education: [...list, emptyEducation()] })}>
        Add education
      </Button>
    </div>
  );
}

// ───────────────────────────── Experience ─────────────────────────────

export function ExperienceSection({ profile, onChange }: SectionProps) {
  const list = profile.experience;
  const update = (id: string, patch: Partial<Experience>) =>
    onChange({ ...profile, experience: list.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  return (
    <div className="space-y-4">
      {list.length === 0 && (
        <p className="text-[13px] text-slate-500">
          No experience added yet. Include internships and co-op terms, most recent first.
        </p>
      )}
      {list.map((exp, i) => (
        <div key={exp.id} className="rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200/70">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-slate-700">
              {[exp.title, exp.company].filter(Boolean).join(' at ') || `Experience ${i + 1}`}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={() => onChange({ ...profile, experience: list.filter((e) => e.id !== exp.id) })}
            >
              Remove
            </Button>
          </div>
          <div className="space-y-4">
            <Grid>
              <TextField label="Company" value={exp.company} onChange={(v) => update(exp.id, { company: v })} />
              <TextField label="Job title" value={exp.title} onChange={(v) => update(exp.id, { title: v })} />
            </Grid>
            <Grid>
              <TextField label="Location" placeholder="Windsor, ON" value={exp.location} onChange={(v) => update(exp.id, { location: v })} />
              <SelectField
                label="Type"
                value={exp.type}
                onChange={(v) => update(exp.id, { type: v as EmploymentType })}
                options={EMPLOYMENT_TYPES}
              />
            </Grid>
            <Grid>
              <MonthField label="Start" value={exp.start} onChange={(v) => update(exp.id, { start: v })} />
              <MonthField label="End" value={exp.end} disabled={exp.current} onChange={(v) => update(exp.id, { end: v })} />
            </Grid>
            <Checkbox
              checked={exp.current}
              onChange={(v) => update(exp.id, { current: v, end: v ? '' : exp.end })}
              label="I currently work here"
            />
            <TextArea
              label="What you did"
              hint="Used when a form asks you to describe the role."
              value={exp.description}
              onChange={(v) => update(exp.id, { description: v })}
            />
          </div>
        </div>
      ))}
      <Button icon={<Plus size={15} />} onClick={() => onChange({ ...profile, experience: [...list, emptyExperience()] })}>
        Add experience
      </Button>
    </div>
  );
}

// ───────────────────────────── Work authorization ─────────────────────────────

function CountryAuthFields({
  title,
  auth,
  onChange,
}: {
  title: string;
  auth: CountryAuth;
  onChange: (next: CountryAuth) => void;
}) {
  return (
    <div className="rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200/70">
      <h3 className="mb-3 text-[13px] font-semibold text-slate-700">{title}</h3>
      <div className="space-y-4">
        <Grid>
          <Segmented<'yes' | 'no'>
            label="Legally authorized to work here?"
            value={auth.authorized}
            onChange={(v) => onChange({ ...auth, authorized: v as Tri })}
            options={YES_NO}
          />
          <Segmented<'yes' | 'no'>
            label="Need sponsorship, now or later?"
            value={auth.sponsorship}
            onChange={(v) => onChange({ ...auth, sponsorship: v as Tri })}
            options={YES_NO}
          />
        </Grid>
        <Grid>
          <SelectField
            label="Status"
            value={auth.status}
            onChange={(v) => onChange({ ...auth, status: v as AuthStatus })}
            options={AUTH_STATUSES}
          />
          <TextField
            label="Details"
            placeholder="e.g. Co-op work permit, F-1 OPT, TN"
            value={auth.detail}
            onChange={(v) => onChange({ ...auth, detail: v })}
          />
        </Grid>
      </div>
    </div>
  );
}

export function WorkAuthSection({ profile, onChange }: SectionProps) {
  const setAuth = (code: string, next: CountryAuth) =>
    onChange({ ...profile, workAuth: { ...profile.workAuth, [code]: next } });
  return (
    <div className="space-y-4">
      <CountryAuthFields title="Canada" auth={profile.workAuth.CA ?? emptyCountryAuth()} onChange={(a) => setAuth('CA', a)} />
      <CountryAuthFields title="United States" auth={profile.workAuth.US ?? emptyCountryAuth()} onChange={(a) => setAuth('US', a)} />
      <Segmented<'yes' | 'no'>
        label="Are you 18 or older?"
        value={profile.preferences.over18}
        onChange={(v) => onChange({ ...profile, preferences: { ...profile.preferences, over18: v as Tri } })}
        options={YES_NO}
      />
    </div>
  );
}

// ───────────────────────────── Preferences ─────────────────────────────

export function PreferencesSection({ profile, onChange }: SectionProps) {
  const prefs = profile.preferences;
  const set = (patch: Partial<Profile['preferences']>) => onChange({ ...profile, preferences: { ...prefs, ...patch } });
  return (
    <div className="space-y-4">
      <Grid>
        <Field label="Desired salary">
          <div className="flex gap-2">
            <input
              aria-label="Desired salary"
              placeholder="e.g. 75,000 or 30/hour"
              value={prefs.salary}
              onChange={(e) => set({ salary: e.target.value })}
              className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600"
            />
            <select
              aria-label="Salary currency"
              value={prefs.salaryCurrency}
              onChange={(e) => set({ salaryCurrency: e.target.value })}
              className="block w-24 shrink-0 rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
            >
              {['CAD', 'USD', 'EUR', 'GBP'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </Field>
        <TextField label="Years of experience" placeholder="2" value={prefs.yearsExperience} onChange={(v) => set({ yearsExperience: v })} />
      </Grid>
      <Grid>
        <TextField
          label="Earliest start date"
          placeholder="e.g. 2027-05-03 or Immediately"
          value={prefs.startDate}
          onChange={(v) => set({ startDate: v })}
        />
        <TextField label="Notice period" placeholder="e.g. 2 weeks" value={prefs.noticePeriod} onChange={(v) => set({ noticePeriod: v })} />
      </Grid>
      <Grid>
        <Segmented<'yes' | 'no'>
          label="Willing to relocate?"
          value={prefs.relocate}
          onChange={(v) => set({ relocate: v as Tri })}
          options={YES_NO}
        />
        <Segmented
          label="Preferred work arrangement"
          value={prefs.workMode}
          onChange={(v) => set({ workMode: v })}
          options={WORK_MODES.map((m) => ({ value: m.value, label: m.label }))}
        />
      </Grid>
      <TextField
        label="How did you hear about us?"
        hint="Your usual answer. You can still change it on any form."
        placeholder="e.g. LinkedIn, company website, university job board"
        value={prefs.howHeard}
        onChange={(v) => set({ howHeard: v })}
      />
    </div>
  );
}

// ───────────────────────────── Demographics ─────────────────────────────

export function DemographicsSection({ profile, onChange }: SectionProps) {
  const demo = profile.demographics;
  const set = (patch: Partial<Profile['demographics']>) => onChange({ ...profile, demographics: { ...demo, ...patch } });
  const toggleRace = (race: Race) => {
    if (race === 'decline') return set({ race: demo.race.includes('decline') ? [] : ['decline'] });
    const without = demo.race.filter((r) => r !== 'decline' && r !== race);
    set({ race: demo.race.includes(race) ? without : [...without, race] });
  };
  return (
    <div className="space-y-5">
      <Notice tone="brand">
        Everything here is optional. These are the voluntary questions many applications ask. Leave a question blank
        and SmartSubmit won't touch it; choose “Decline to answer” and it will select that option for you.
      </Notice>
      <Grid>
        <SelectField label="Gender" value={demo.gender} onChange={(v) => set({ gender: v as Gender })} options={GENDERS} placeholder="Leave unanswered" />
        <SelectField
          label="Hispanic or Latino?"
          value={demo.hispanic}
          onChange={(v) => set({ hispanic: v as TriDecline })}
          options={TRI_DECLINE}
          placeholder="Leave unanswered"
        />
      </Grid>
      <Field label="Race / ethnicity" hint="Choose all that apply.">
        <div className="grid gap-2 sm:grid-cols-2">
          {RACES.map((r) => (
            <Checkbox key={r.value} checked={demo.race.includes(r.value)} onChange={() => toggleRace(r.value)} label={r.label} />
          ))}
        </div>
      </Field>
      <Grid>
        <SelectField
          label="Veteran status"
          value={demo.veteran}
          onChange={(v) => set({ veteran: v as VeteranStatus })}
          options={VETERAN}
          placeholder="Leave unanswered"
        />
        <SelectField
          label="Disability"
          value={demo.disability}
          onChange={(v) => set({ disability: v as TriDecline })}
          options={DISABILITY}
          placeholder="Leave unanswered"
        />
      </Grid>
      <Grid>
        <SelectField
          label="Indigenous (First Nations, Métis or Inuit)?"
          hint="Asked on Canadian employment-equity forms."
          value={demo.indigenous}
          onChange={(v) => set({ indigenous: v as TriDecline })}
          options={TRI_DECLINE}
          placeholder="Leave unanswered"
        />
        <SelectField
          label="Member of a visible minority?"
          hint="Asked on Canadian employment-equity forms."
          value={demo.visibleMinority}
          onChange={(v) => set({ visibleMinority: v as TriDecline })}
          options={TRI_DECLINE}
          placeholder="Leave unanswered"
        />
      </Grid>
    </div>
  );
}
