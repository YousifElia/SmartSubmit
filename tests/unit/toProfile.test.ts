import { describe, expect, it } from 'vitest';
import { emptyExperience, emptyProfile } from '@/core/defaults';
import { languagesFromResume, levelIn, profileFromResume, skillsFromResume, splitLocation, toYearMonth } from '@/core/resume/toProfile';
import { sampleResumeDoc } from '../fixtures/sampleResume';

describe('profileFromResume', () => {
  it('fills an empty profile from a resume', () => {
    const { profile, filled } = profileFromResume(sampleResumeDoc(), emptyProfile());
    expect(profile.firstName).toBe('Avery');
    expect(profile.lastName).toBe('Testerson');
    expect(profile.email).toBe('avery.testerson@example.com');
    expect(profile.phone).toBe('(519) 555-0142');
    expect(profile.address).toMatchObject({ city: 'Windsor', region: 'Ontario', country: 'CA' });
    expect(profile.links.linkedin).toBe('https://www.linkedin.com/in/avery-testerson-example');
    expect(profile.links.github).toBe('https://github.com/avery-testerson-example');
    expect(profile.education[0]).toMatchObject({
      school: 'University of Windsor',
      degree: 'bachelor',
      degreeName: 'Bachelor of Computer Science (Honours), Co-op',
      field: 'Computer Science',
      start: '2023-09',
      end: '2027-05',
      current: true,
      gpa: '3.8',
      gpaScale: '4.0',
      city: 'Windsor',
      region: 'Ontario',
    });
    expect(profile.experience).toHaveLength(2);
    expect(profile.experience[0]).toMatchObject({
      company: 'Example Robotics',
      title: 'Software Developer Co-op',
      type: 'co-op',
      start: '2025-01',
      end: '2025-04',
      current: false,
    });
    expect(profile.experience[0]!.description.split('\n')).toHaveLength(3);
    // Skills come from every group of the resume's skills section.
    expect(profile.skills).toEqual(['Python', 'TypeScript', 'Java', 'C', 'SQL', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'Git', 'Linux']);
    expect(filled).toEqual(['name', 'email', 'phone', 'location', 'LinkedIn', 'GitHub', '2 jobs', '1 school', '11 skills']);
  });

  it('adds the jobs, schools, skills and languages the profile lacks, and keeps what it has', () => {
    const current = emptyProfile();
    current.experience = [{ ...emptyExperience(), company: 'Example Robotics', title: 'Software Developer Co-op', description: 'My own words.' }];
    current.skills = ['python', 'Kubernetes'];
    current.languages = [{ id: 'x', language: 'English', level: 'fluent' }];
    const doc = sampleResumeDoc();
    doc.extras.push({ title: 'Languages', items: ['English (Native), French (Professional working proficiency)'] });
    const { profile, filled } = profileFromResume(doc, current);
    // The job already there keeps its own description; the other one is added after it.
    expect(profile.experience.map((e) => e.company)).toEqual(['Example Robotics', 'University of Windsor']);
    expect(profile.experience[0]!.description).toBe('My own words.');
    expect(profile.skills.slice(0, 3)).toEqual(['python', 'Kubernetes', 'TypeScript']);
    expect(profile.skills.filter((s) => s.toLowerCase() === 'python')).toHaveLength(1);
    // English keeps the level chosen in the profile; French is added.
    expect(profile.languages.map((l) => [l.language, l.level])).toEqual([
      ['English', 'fluent'],
      ['French', 'advanced'],
    ]);
    expect(filled).toEqual(expect.arrayContaining(['1 job', '1 school', '10 skills', '1 language']));
  });

  it('replaces the jobs, schools and skills when asked', () => {
    const current = emptyProfile();
    current.experience = [{ ...emptyExperience(), company: 'Old Co', title: 'Cashier' }];
    current.skills = ['Typing'];
    const { profile } = profileFromResume(sampleResumeDoc(), current, { replace: true });
    expect(profile.experience.map((e) => e.company)).toEqual(['Example Robotics', 'University of Windsor']);
    expect(profile.skills).not.toContain('Typing');
    expect(profile.skills).toContain('PostgreSQL');
  });

  it('never replaces what the user already entered', () => {
    const current = emptyProfile();
    current.firstName = 'Ave';
    current.email = 'mine@example.com';
    current.links.linkedin = 'https://linkedin.com/in/mine';
    const { profile, filled } = profileFromResume(sampleResumeDoc(), current);
    expect(profile.firstName).toBe('Ave');
    expect(profile.lastName).toBe('');
    expect(profile.email).toBe('mine@example.com');
    expect(profile.links.linkedin).toBe('https://linkedin.com/in/mine');
    expect(filled).not.toContain('name');
    expect(filled).not.toContain('email');
    expect(filled).toContain('phone');
    // The input is left untouched.
    expect(current.phone).toBe('');
  });

  it('normalises a shouted name and a +1 phone number', () => {
    const doc = sampleResumeDoc();
    doc.basics.name = 'SAM J. RIVERA';
    doc.basics.phone = '+1 604-555-0123';
    const { profile } = profileFromResume(doc, emptyProfile());
    expect([profile.firstName, profile.middleName, profile.lastName]).toEqual(['Sam', 'J.', 'Rivera']);
    expect(profile.phone).toBe('6045550123');
  });
});

describe('toYearMonth', () => {
  it('reads the usual date wordings', () => {
    expect(toYearMonth('Sep 2023')).toBe('2023-09');
    expect(toYearMonth('September 2023')).toBe('2023-09');
    expect(toYearMonth('09/2023')).toBe('2023-09');
    expect(toYearMonth('2023')).toBe('2023');
    expect(toYearMonth('Summer 2024')).toBe('2024-08');
    expect(toYearMonth('Present')).toBe('');
    expect(toYearMonth('')).toBe('');
  });
});

describe('splitLocation', () => {
  it('recognises provinces, states and countries', () => {
    expect(splitLocation('Windsor, ON')).toEqual({ city: 'Windsor', region: 'Ontario', country: 'CA' });
    expect(splitLocation('Austin, Texas, United States')).toEqual({ city: 'Austin', region: 'Texas', country: 'US' });
    expect(splitLocation('London, UK')).toEqual({ city: 'London', region: '', country: 'GB' });
    expect(splitLocation('Remote')).toEqual({ city: 'Remote', region: '', country: '' });
  });
});

describe('skills and languages from a resume', () => {
  it('tells spoken languages from skills, wherever the resume lists them', () => {
    const doc = sampleResumeDoc();
    doc.skills = [
      { category: 'Languages', items: ['Python', 'Java', 'English', 'Spanish (conversational)'] },
      { category: 'Tools', items: ['Git', 'git', 'Docker'] },
    ];
    doc.extras = [{ title: 'Languages', items: ['Fluent in Arabic and French', 'Mandarin – basic'] }];
    expect(skillsFromResume(doc)).toEqual(['Python', 'Java', 'Git', 'Docker']);
    expect(languagesFromResume(doc).map((l) => [l.language, l.level])).toEqual([
      ['Arabic', 'fluent'],
      ['French', 'fluent'],
      ['Mandarin', 'beginner'],
      ['English', ''],
      ['Spanish', 'intermediate'],
    ]);
  });

  it('reads levels as resumes write them', () => {
    expect(levelIn('English (Native)')).toBe('native');
    expect(levelIn('French – Full professional proficiency')).toBe('fluent');
    expect(levelIn('German: Professional working proficiency')).toBe('advanced');
    expect(levelIn('Spanish (Limited working proficiency)')).toBe('intermediate');
    expect(levelIn('Japanese (Elementary)')).toBe('beginner');
    expect(levelIn('Korean')).toBe('');
  });
});
