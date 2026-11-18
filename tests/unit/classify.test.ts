import { describe, expect, it } from 'vitest';
import { classify } from '@/core/autofill/classify';
import type { ControlKind, FieldInfo, FieldKey } from '@/core/autofill/model';

function field(label: string, extra: Partial<FieldInfo> = {}): FieldInfo {
  return {
    kind: 'text',
    label,
    description: '',
    name: '',
    id: '',
    autocomplete: '',
    placeholder: '',
    inputType: 'text',
    required: false,
    options: [],
    section: '',
    multiple: false,
    maxLength: null,
    accept: '',
    ...extra,
  };
}
const keyOf = (label: string, extra: Partial<FieldInfo> = {}) => classify(field(label, extra))?.key ?? null;
const choice = (kind: ControlKind = 'select', options = ['Yes', 'No']): Partial<FieldInfo> => ({ kind, options });

describe('classify: identity and contact', () => {
  const cases: [string, FieldKey | null, Partial<FieldInfo>?][] = [
    ['First Name', 'firstName'],
    ['First name *', 'firstName'],
    ['Legal First Name', 'firstName'],
    ['Given Name(s)', 'firstName'],
    ['Last Name', 'lastName'],
    ['Family Name', 'lastName'],
    ['Surname', 'lastName'],
    ['Middle Name', 'middleName'],
    ['Preferred First Name', 'preferredName'],
    ['Preferred Name', 'preferredName'],
    ['Full name✱', 'fullName'],
    ['Legal Name', 'fullName'],
    ['Name', 'fullName'],
    ['Your full legal name', 'fullName'],
    ['Email', 'email'],
    ['Email Address', 'email'],
    ['E-mail', 'email'],
    ['Phone', 'phone'],
    ['Phone Number', 'phone'],
    ['Mobile Phone Number', 'phone'],
    ['Phone Device Type', 'phoneType'],
    ['Country Phone Code', 'phoneCountryCode'],
    ['Pronouns', 'pronouns'],
    ['LinkedIn Profile', 'linkedin'],
    ['LinkedIn URL', 'linkedin'],
    ['GitHub URL', 'github'],
    ['Portfolio URL', 'portfolio'],
    ['Website', 'website'],
    ['Personal Website', 'website'],
    ['Twitter URL', 'twitter'],
    ['Current company', 'currentCompany'],
    ['Current Employer', 'currentCompany'],
    ['Current Job Title', 'currentTitle'],
  ];
  it.each(cases)('%s → %s', (label, expected, extra) => {
    expect(keyOf(label, extra)).toBe(expected);
  });
});

describe('classify: address', () => {
  const cases: [string, FieldKey | null][] = [
    ['Address', 'addressLine1'],
    ['Street Address', 'addressLine1'],
    ['Address Line 1', 'addressLine1'],
    ['Address Line 2', 'addressLine2'],
    ['Apartment, suite, etc.', 'addressLine2'],
    ['City', 'city'],
    ['State', 'region'],
    ['Province', 'region'],
    ['State / Province', 'region'],
    ['Zip Code', 'postalCode'],
    ['Postal Code', 'postalCode'],
    ['ZIP / Postal Code', 'postalCode'],
    ['Country', 'country'],
    ['Country of residence', 'country'],
    ['Location (City)', 'location'],
    ['Current location ✱', 'location'],
    ['City, State', 'location'],
    ['Where are you currently located?', 'location'],
  ];
  it.each(cases)('%s → %s', (label, expected) => {
    expect(keyOf(label)).toBe(expected);
  });
});

describe('classify: questions answered from the profile', () => {
  const yn = choice();
  const cases: [string, FieldKey | null, Partial<FieldInfo>?][] = [
    ['Are you legally authorized to work in the United States for our Company?', 'authorized', yn],
    ['Are you legally authorized to work in the country for which you are applying?', 'authorized', yn],
    ['Are you authorised to work in Canada?', 'authorized', yn],
    ['Do you have the legal right to work in the UK?', 'authorized', yn],
    ['Are you eligible to work in Canada?', 'authorized', yn],
    ['Will you now or in the future require sponsorship for employment visa status (e.g., H-1B, etc.)?', 'sponsorship', yn],
    ['Do you require visa sponsorship?', 'sponsorship', yn],
    ['Will you require sponsorship to work in Canada?', 'sponsorship', yn],
    ['How did you hear about this job?', 'howHeard'],
    ['How did you hear about us?', 'howHeard', choice('select', ['LinkedIn', 'Indeed', 'Referral'])],
    ['How did you find out about this opportunity?', 'howHeard'],
    ['Are you willing to relocate?', 'relocate', yn],
    ['Are you open to relocation?', 'relocate', yn],
    ['Are you at least 18 years of age?', 'over18', yn],
    ['Are you 18 years of age or older?', 'over18', yn],
    ['Desired Salary', 'salary'],
    ['What are your salary expectations?', 'salary'],
    ['Salary requirements', 'salary'],
    ['When can you start?', 'startDate'],
    ['Earliest start date', 'startDate'],
    ['What is your notice period?', 'noticePeriod'],
    ['Years of experience', 'yearsExperience'],
    ['Total years of professional experience', 'yearsExperience'],
  ];
  it.each(cases)('%s → %s', (label, expected, extra) => {
    expect(keyOf(label, extra)).toBe(expected);
  });
});

describe('classify: education and work history', () => {
  it('recognises Greenhouse education fields by id', () => {
    expect(keyOf('School', { kind: 'combobox', id: 'school--0' })).toBe('eduSchool');
    expect(keyOf('Degree', { kind: 'combobox', id: 'degree--0' })).toBe('eduDegree');
    expect(keyOf('Discipline', { kind: 'combobox', id: 'discipline--0' })).toBe('eduField');
  });

  it('recognises education wording without a section', () => {
    expect(keyOf('University')).toBe('eduSchool');
    expect(keyOf('School Name')).toBe('eduSchool');
    expect(keyOf('Highest level of education completed', choice('select', ["Bachelor's", "Master's"]))).toBe('eduDegree');
    expect(keyOf('Major')).toBe('eduField');
    expect(keyOf('Field of Study')).toBe('eduField');
    expect(keyOf('GPA')).toBe('eduGpa');
    expect(keyOf('Expected Graduation Date')).toBe('eduEnd');
    expect(keyOf('When will you graduate?')).toBe('eduEnd');
    expect(keyOf('Graduation Year')).toBe('eduEndYear');
    expect(keyOf('Graduation Month', choice('select', ['January', 'February', 'March', 'April', 'May', 'June', 'July']))).toBe('eduEndMonth');
  });

  it('uses the section to tell education dates from job dates and availability', () => {
    expect(keyOf('Start date', { section: 'Education' })).toBe('eduStart');
    expect(keyOf('End date', { section: 'Education' })).toBe('eduEnd');
    expect(keyOf('Start date', { section: 'Work Experience' })).toBe('expStart');
    expect(keyOf('End Date Year', { section: 'Work Experience' })).toBe('expEndYear');
    expect(keyOf('Start date')).toBe('startDate');
  });

  it('maps work-history fields only inside an experience section', () => {
    expect(keyOf('Company', { section: 'Employment History' })).toBe('expCompany');
    expect(keyOf('Title', { section: 'Employment History' })).toBe('expTitle');
    expect(keyOf('Description', { section: 'Work Experience' })).toBe('expDescription');
    expect(keyOf('I currently work here', { section: 'Work Experience', kind: 'checkbox' })).toBe('expCurrent');
    expect(keyOf('Description')).toBeNull();
  });
});

describe('classify: voluntary self-identification', () => {
  const cases: [string, FieldKey | null, Partial<FieldInfo>?][] = [
    ['Gender', 'gender', choice('combobox', [])],
    ['Gender Identity (optional)', 'gender', choice('combobox', [])],
    ['Race and Ethnicity', 'race', choice('combobox', [])],
    ['Race or Ethnicity (optional)', 'race', choice('combobox', [])],
    ['Are you Hispanic/Latino?', 'hispanic', choice()],
    ['Veteran Status', 'veteran', choice('combobox', [])],
    ['Disability Status', 'disability', choice('combobox', [])],
    ['Do you identify as Indigenous?', 'indigenous', choice()],
    ['Are you a member of a visible minority?', 'visibleMinority', choice()],
    ['I consider myself a member of the LGBTQ+ community. (optional)', null, choice('combobox', [])],
    ['Do you identify as transgender?', null, choice()],
  ];
  it.each(cases)('%s → %s', (label, expected, extra) => {
    expect(keyOf(label, extra)).toBe(expected);
  });
});

describe('classify: files', () => {
  it('tells resume and cover letter uploads apart', () => {
    expect(keyOf('Resume/CV', { kind: 'file' })).toBe('resume');
    expect(keyOf('Attach', { kind: 'file', id: 'resume' })).toBe('resume');
    expect(keyOf('Attach', { kind: 'file', id: 'cover_letter' })).toBe('coverLetter');
    expect(keyOf('Cover Letter', { kind: 'file' })).toBe('coverLetter');
    expect(keyOf('Transcript', { kind: 'file' })).toBeNull();
  });
});

describe('classify: evidence other than the label', () => {
  it('uses autocomplete tokens', () => {
    expect(keyOf('', { autocomplete: 'given-name' })).toBe('firstName');
    expect(keyOf('', { autocomplete: 'section-a shipping postal-code' })).toBe('postalCode');
  });
  it('uses the input type', () => {
    expect(keyOf('', { inputType: 'email' })).toBe('email');
    expect(keyOf('', { inputType: 'tel' })).toBe('phone');
  });
  it('uses name and id when the label is missing', () => {
    expect(keyOf('', { name: 'first_name' })).toBe('firstName');
    expect(keyOf('', { name: 'urls[LinkedIn]' })).toBe('linkedin');
    expect(keyOf('', { name: 'org' })).toBe('currentCompany');
  });
});

describe('classify: questions it must leave alone', () => {
  const cases: [string, Partial<FieldInfo>?][] = [
    ['Why do you want to work at Discord?', { inputType: 'textarea' }],
    ['Company name of your most recent reference'],
    ["Recruiter's email"],
    ['Emergency contact phone'],
    ['Reference name'],
    ['Name of school counsellor'],
    ['Do you have a phone we can text?', choice()],
    ['Please describe a time you used the phone to resolve a customer issue in a previous role', { inputType: 'textarea' }],
    ['Are you licensed in the state of California?', choice()],
    ['Do you have active membership in good standing with at least one U.S. state bar?', choice()],
    ['How many years of experience do you have with Python?'],
    ['Have you graduated?', choice()],
    ['Do you have a Bachelor’s degree in Computer Science?', choice()],
    ['What is your current salary?'],
    ['Have you previously worked at this company?', choice()],
    ['Yes - I consent to receiving SMS text messages', { kind: 'radio' }],
    ['Are you currently located in the US?', choice()],
    ['Which office location do you prefer?', choice('select', ['Toronto', 'Vancouver'])],
    ['Are you legally authorized to work in the US without sponsorship?', choice()],
  ];
  it.each(cases)('%s', (label, extra) => {
    expect(keyOf(label, extra)).toBeNull();
  });
});

describe('classify: confidence', () => {
  it('is high for a tight label and lower for a guess from the name alone', () => {
    expect(classify(field('First Name'))!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(classify(field('Vorname', { name: 'first_name' }))!.confidence).toBeLessThan(0.8);
  });
  it('flags the indirect location question for review', () => {
    const c = classify(field('Where do you plan on working from (for payroll tax purposes)?', { kind: 'combobox' }));
    expect(c?.key).toBe('location');
    expect(c!.confidence).toBeLessThan(0.8);
  });
});

describe('classify: questions worded only in their choices', () => {
  it('reads the U.S. disability form’s “check one of the boxes” question', () => {
    const options = ['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer'];
    expect(keyOf('Please check one of the boxes below:', choice('checkboxes', options))).toBe('disability');
  });

  it('recognises veteran, gender and ethnicity choices behind a vague label', () => {
    expect(keyOf('Status', choice('select', ['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', 'I do not wish to answer']))).toBe('veteran');
    expect(keyOf('Please select', choice('radio', ['Male', 'Female', 'Decline to self-identify']))).toBe('gender');
    expect(keyOf('Please select', choice('select', ['Hispanic or Latino', 'Not Hispanic or Latino']))).toBe('hispanic');
  });

  it('recognises a phone’s type labelled just “Type”', () => {
    expect(keyOf('Type', choice('select', ['', 'Home', 'Mobile', 'Work']))).toBe('phoneType');
    expect(keyOf('Type', choice('select', ['Cell Phone', 'Home Phone', 'Business Phone']))).toBe('phoneType');
    expect(keyOf('Type', choice('select', ['Home', 'Work', 'Other']))).toBeNull();
  });

  it('leaves ordinary questions alone', () => {
    expect(keyOf('Please select one', choice('select', ['Yes', 'No']))).toBeNull();
    expect(keyOf('Which shift do you prefer?', choice('radio', ['Morning', 'Evening']))).toBeNull();
  });
});

describe('classify: degree questions', () => {
  it('reads long wordings of the highest-degree question', () => {
    const options = choice('select', ['High school', "Bachelor's degree", "Master's degree"]);
    expect(keyOf('What is the highest degree you have completed or are pursuing?', options)).toBe('eduDegree');
    expect(keyOf('What is the highest degree you have completed?', options)).toBe('eduDegree');
  });
});

describe('classify: skills, languages, pasted resumes', () => {
  it('finds skills questions', () => {
    expect(keyOf('Skills')).toBe('skills');
    expect(keyOf('Technical Skills')).toBe('skills');
    expect(keyOf('List your skills', { inputType: 'textarea' })).toBe('skills');
    expect(keyOf('Which programming languages do you know?', choice('checkboxes', ['Python', 'Go', 'Rust']))).toBe('skills');
    expect(keyOf('Describe a time your skills helped a team succeed', { inputType: 'textarea' })).toBeNull();
    // One language wanted, not the list.
    expect(keyOf('What programming language are you strongest in?')).toBeNull();
  });

  it('tells spoken languages from programming ones by the question, or by the choices', () => {
    expect(keyOf('What languages do you speak?')).toBe('languagesSpoken');
    expect(keyOf('Languages')).toBe('languagesSpoken');
    expect(keyOf('Which languages do you speak fluently?', choice('checkboxes', ['English (ENG)', 'French (FRA)', 'Spanish (SPA)']))).toBe('languagesSpoken');
    expect(keyOf('Which languages have you used professionally?', choice('checkboxes', ['Python', 'TypeScript', 'Go', 'Rust']))).toBe('skills');
  });

  it('reads a languages entry by its section', () => {
    const inLanguages = (label: string, extra: Partial<FieldInfo> = {}) => keyOf(label, { section: 'Languages', ...extra });
    expect(inLanguages('Language', choice('select', ['English', 'French']))).toBe('language');
    expect(inLanguages('Reading', choice('select', ['Beginner', 'Intermediate', 'Advanced', 'Fluent']))).toBe('languageLevel');
    expect(inLanguages('Proficiency', choice('select', ['Beginner', 'Fluent']))).toBe('languageLevel');
    expect(inLanguages('I am fluent in this language', { kind: 'checkbox' })).toBe('languageFluent');
  });

  it('asks "do you speak…?" only when a language is named, or bilingualism is', () => {
    expect(keyOf('Are you fluent in French?', choice('radio'))).toBe('speaksLanguage');
    expect(keyOf('Do you speak Spanish?', choice('select'))).toBe('speaksLanguage');
    expect(keyOf('Are you bilingual?', choice('radio'))).toBe('speaksLanguage');
    expect(keyOf('Do you speak up when you disagree?', choice('radio'))).toBeNull();
  });

  it('finds a box for pasting the resume, but not a file field or a cover letter', () => {
    expect(keyOf('Paste your resume here', { inputType: 'textarea' })).toBe('resumeText');
    expect(keyOf('Resume Text', { inputType: 'textarea' })).toBe('resumeText');
    expect(keyOf('Copy and paste your CV', { inputType: 'textarea' })).toBe('resumeText');
    expect(keyOf('Paste your resume here', { inputType: 'text' })).toBeNull();
    expect(keyOf('Paste your cover letter', { inputType: 'textarea' })).toBeNull();
  });
});
