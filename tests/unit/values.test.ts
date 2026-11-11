import { describe, expect, it } from 'vitest';
import { matchNumericRange, matchOption } from '@/core/autofill/options';
import type { FieldInfo, FieldKey } from '@/core/autofill/model';
import { countryInQuestion, formatYearMonth, profileValue } from '@/core/autofill/values';
import { emptyEducation, emptyExperience, emptyProfile } from '@/core/defaults';
import type { Profile } from '@/core/types';

function field(label: string, extra: Partial<FieldInfo> = {}): FieldInfo {
  return {
    kind: 'text', label, description: '', name: '', id: '', autocomplete: '', placeholder: '', inputType: 'text',
    required: false, options: [], section: '', multiple: false, maxLength: null, accept: '', ...extra,
  };
}

function profile(): Profile {
  const p = emptyProfile();
  p.firstName = 'Avery';
  p.middleName = 'Quinn';
  p.lastName = 'Testerson';
  p.email = 'avery@example.com';
  p.phone = '519 555 0142';
  p.phoneCountry = 'CA';
  p.address = { line1: '401 Sunset Ave', line2: '', city: 'Windsor', region: 'Ontario', postalCode: 'N9B 3P4', country: 'CA' };
  p.links.linkedin = 'https://www.linkedin.com/in/avery-testerson';
  p.education = [
    { ...emptyEducation(), school: 'University of Windsor', degree: 'bachelor', degreeName: 'Bachelor of Computer Science (Honours)', field: 'Computer Science', start: '2023-09', end: '2027-05', current: true, gpa: '3.8' },
    { ...emptyEducation(), school: 'Massey Secondary School', degree: 'high-school', degreeName: '', field: '', start: '2019-09', end: '2023-06', current: false },
  ];
  p.experience = [
    { ...emptyExperience(), company: 'Old Co', title: 'Intern', start: '2024-05', end: '2024-08', current: false, description: 'Built things.' },
    { ...emptyExperience(), company: 'New Co', title: 'Software Developer Co-op', start: '2025-01', end: '', current: true, description: 'Builds things.' },
  ];
  p.workAuth.CA = { authorized: 'yes', sponsorship: 'no', status: 'citizen', detail: '' };
  p.workAuth.US = { authorized: 'no', sponsorship: 'yes', status: 'none', detail: '' };
  p.preferences.over18 = 'yes';
  p.preferences.yearsExperience = '2';
  p.demographics = { gender: 'female', race: ['asian', 'white'], hispanic: 'no', veteran: 'not-veteran', disability: 'decline', indigenous: '', visibleMinority: 'yes' };
  return p;
}

const value = (key: FieldKey, f: FieldInfo, extra: Partial<Parameters<typeof profileValue>[2]> = {}) =>
  profileValue(key, profile(), { field: f, group: 0, jobCountry: '', demographics: true, ...extra });

describe('profileValue', () => {
  it('gives names in the form the label asks for', () => {
    expect(value('fullName', field('Full name'))?.text).toBe('Avery Testerson');
    expect(value('fullName', field('Legal Name'))?.text).toBe('Avery Quinn Testerson');
    expect(value('preferredName', field('Preferred name'))?.text).toBe('Avery');
    expect(value('middleName', field('Middle initial'))?.text).toBe('Q');
  });

  it('formats the phone for a plain box and for an international widget', () => {
    expect(value('phone', field('Phone'))?.text).toBe('(519) 555-0142');
    expect(value('phone', field('Phone'), { intlPhone: true })?.text).toBe('+15195550142');
  });

  it('offers every wording of the country and province', () => {
    const country = value('country', field('Country'))!;
    expect(matchOption(country.forms, ['United States', 'Canada'])?.index).toBe(1);
    const region = value('region', field('Province'))!;
    expect(matchOption(region.forms, ['AB', 'ON', 'QC'])?.index).toBe(1);
  });

  it('builds a location with a search query and ranked wordings', () => {
    const location = value('location', field('Location'))!;
    expect(location.text).toBe('Windsor, Ontario');
    expect(location.query).toBe('Windsor');
    expect(matchOption(location.forms, ['Windsor, England, United Kingdom', 'Windsor, Ontario, Canada', 'Windsor, Colorado, United States'])?.index).toBe(1);
  });

  it('uses the most recent education first, then earlier ones by group', () => {
    expect(value('eduSchool', field('School'))?.text).toBe('University of Windsor');
    expect(value('eduSchool', field('School'), { group: 1 })?.text).toBe('Massey Secondary School');
    expect(value('eduSchool', field('School'), { group: 2 })).toBeNull();
    const degree = value('eduDegree', field('Degree'))!;
    expect(matchOption(degree.forms, ["Associate's Degree", "Bachelor's Degree", "Master's Degree"])?.index).toBe(1);
  });

  it('formats graduation dates for the field in front of it', () => {
    expect(value('eduEnd', field('Graduation date'))?.text).toBe('May 2027');
    expect(value('eduEnd', field('Graduation date', { placeholder: 'MM/YYYY' }))?.text).toBe('05/2027');
    expect(value('eduEnd', field('Graduation date', { inputType: 'month' }))?.text).toBe('2027-05');
    expect(value('eduEnd', field('Graduation date', { inputType: 'date' }))?.text).toBe('2027-05-01');
    expect(value('eduEndYear', field('Graduation year'))?.text).toBe('2027');
    const month = value('eduEndMonth', field('Graduation month'))!;
    expect(matchOption(month.forms, ['01', '02', '03', '04', '05', '06'])?.index).toBe(4);
    expect(matchOption(month.forms, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'])?.index).toBe(4);
  });

  it('puts the current job first and leaves its end date empty', () => {
    expect(value('currentCompany', field('Current company'))?.text).toBe('New Co');
    expect(value('expCompany', field('Company'), { group: 0 })?.text).toBe('New Co');
    expect(value('expEnd', field('End date'), { group: 0 })).toBeNull();
    expect(value('expCurrent', field('I currently work here'), { group: 0 })?.checked).toBe(true);
    expect(value('expCompany', field('Company'), { group: 1 })?.text).toBe('Old Co');
    expect(value('expEnd', field('End date'), { group: 1 })?.text).toBe('August 2024');
  });

  it('answers work authorization for the country the question names', () => {
    expect(value('authorized', field('Are you authorized to work in Canada?'))?.text).toBe('Yes');
    expect(value('authorized', field('Are you legally authorized to work in the United States?'))?.text).toBe('No');
    expect(value('sponsorship', field('Will you require sponsorship to work in the US?'))?.text).toBe('Yes');
    expect(value('sponsorship', field('Do you require sponsorship to work in Canada?'))?.text).toBe('No');
  });

  it('falls back to the job country, then flags a guess when no country is known', () => {
    const q = field('Are you legally authorized to work in the country for which you are applying?');
    const withJob = value('authorized', q, { jobCountry: 'US' })!;
    expect(withJob.text).toBe('No');
    expect(withJob.certainty).toBeGreaterThan(0.9);
    const guess = value('authorized', q)!;
    expect(guess.text).toBe('Yes');
    expect(guess.certainty).toBeLessThan(0.8);
  });

  it('is confident without a country when the answer is the same everywhere', () => {
    const p = profile();
    p.workAuth.US = { ...p.workAuth.CA! };
    const v = profileValue('authorized', p, { field: field('Are you legally authorized to work?'), group: 0, jobCountry: '', demographics: true })!;
    expect(v.text).toBe('Yes');
    expect(v.certainty).toBeGreaterThanOrEqual(0.9);
  });

  it('handles demographic questions, including decline and several races', () => {
    const gender = value('gender', field('Gender', { kind: 'select' }))!;
    expect(matchOption(gender.forms, ['Male', 'Female', 'Decline To Self Identify'])?.index).toBe(1);

    const disability = value('disability', field('Disability Status', { kind: 'select' }))!;
    expect(matchOption(disability.forms, ['Yes, I have a disability', 'No, I do not have a disability', 'I do not want to answer'])?.index).toBe(2);

    const single = value('race', field('Race', { kind: 'select' }))!;
    const options = ['Asian', 'White', 'Two or More Races', 'Decline To Self Identify'];
    expect(matchOption(single.forms, options)?.index).toBe(2);
    // Without a "two or more" choice it falls back to the first race listed.
    expect(matchOption(single.forms, ['Asian', 'White'])?.index).toBe(0);

    const multi = value('race', field('Race', { kind: 'checkboxes', multiple: true }))!;
    expect(multi.multi).toHaveLength(2);

    expect(value('indigenous', field('Indigenous?', { kind: 'select' }))).toBeNull();
    expect(value('visibleMinority', field('Visible minority?', { kind: 'select' }))?.text).toBe('Yes');
  });

  it('leaves demographic questions alone when the setting is off', () => {
    expect(value('gender', field('Gender', { kind: 'select' }), { demographics: false })).toBeNull();
    expect(value('race', field('Race', { kind: 'select' }), { demographics: false })).toBeNull();
  });

  it('returns null for anything the profile has no value for', () => {
    expect(value('github', field('GitHub'))).toBeNull();
    expect(value('salary', field('Salary'))).toBeNull();
    expect(value('startDate', field('Start date'))).toBeNull();
  });
});

describe('countryInQuestion', () => {
  it('finds the country a question names', () => {
    expect(countryInQuestion('Are you authorized to work in the United States?')).toBe('US');
    expect(countryInQuestion('Are you legally authorized to work in the US?')).toBe('US');
    expect(countryInQuestion('Are you authorized to work in the U.S.?')).toBe('US');
    expect(countryInQuestion('Are you eligible to work in Canada?')).toBe('CA');
    expect(countryInQuestion('Do you have the right to work in the UK?')).toBe('GB');
    expect(countryInQuestion('Do you have the right to work in Germany?')).toBe('DE');
  });
  it('does not mistake the pronoun "us" for the country', () => {
    expect(countryInQuestion('Are you authorized to work for us?')).toBe('');
    expect(countryInQuestion('How did you hear about us?')).toBe('');
    expect(countryInQuestion('Are you authorized to work in the country where this job is located?')).toBe('');
  });
});

describe('formatYearMonth', () => {
  it('follows the placeholder', () => {
    expect(formatYearMonth('2027-05', field('', { placeholder: 'MM/DD/YYYY' }))).toBe('05/01/2027');
    expect(formatYearMonth('2027-05', field('', { placeholder: 'YYYY' }))).toBe('2027');
    expect(formatYearMonth('2027', field(''))).toBe('2027');
    expect(formatYearMonth('', field(''))).toBe('');
  });
});

describe('matchNumericRange', () => {
  const options = ['Select', 'Less than 1 year', '1-2 years', '3-5 years', '6-10 years', '10+ years'];
  it('picks the range containing the number', () => {
    expect(matchNumericRange(0, options)?.index).toBe(1);
    expect(matchNumericRange(2, options)?.index).toBe(2);
    expect(matchNumericRange(4, options)?.index).toBe(3);
    expect(matchNumericRange(12, options)?.index).toBe(5);
  });
  it('returns null for options that are not ranges', () => {
    expect(matchNumericRange(3, ['Yes', 'No'])).toBeNull();
  });
});

describe('highest degree', () => {
  const options = ['High school', "Bachelor's degree", "Master's degree", 'PhD'];
  const pick = (label: string) => {
    const v = value('eduDegree', field(label, { kind: 'select', options }));
    return v ? options[matchOption(v.forms, options)!.index] : null;
  };

  it('counts the degree in progress when the question allows it', () => {
    expect(pick('What is the highest degree you have completed or are pursuing?')).toBe("Bachelor's degree");
    expect(pick('Highest level of education')).toBe("Bachelor's degree");
  });

  it('gives only a finished one when the question asks for completed', () => {
    expect(pick('What is the highest degree you have completed?')).toBe('High school');
    expect(pick('Highest level of education obtained')).toBe('High school');
  });
});
