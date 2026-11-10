import { describe, expect, it } from 'vitest';
import { emptyProfile } from '@/core/defaults';
import { profileFromResume, splitLocation, toYearMonth } from '@/core/resume/toProfile';
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
    expect(filled).toEqual(['name', 'email', 'phone', 'location', 'LinkedIn', 'GitHub', 'education', 'work experience']);
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
