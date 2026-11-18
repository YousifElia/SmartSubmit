/**
 * The fixed choices in the profile, with the wordings application forms use
 * for each one.
 *
 * `label` is what the dashboard shows. `forms` are phrases a form's dropdown
 * or radio group might offer for the same meaning; the autofill option matcher
 * (`autofill/options.ts`) picks whichever option best matches one of them.
 */
import type {
  AuthStatus,
  DegreeLevel,
  EmploymentType,
  Gender,
  LanguageLevel,
  Race,
  TriDecline,
  VeteranStatus,
} from '../types';

export interface Choice<V extends string> {
  value: V;
  label: string;
  forms: string[];
}

/** Wordings for "I'd rather not say", shared by every demographic question. */
export const DECLINE_FORMS = [
  'Decline to self-identify',
  'Decline to self identify',
  'I decline to self-identify',
  'Decline to answer',
  'Decline to state',
  'Decline',
  "I don't wish to answer",
  'I do not wish to answer',
  "I don't want to answer",
  'I do not want to answer',
  'Prefer not to say',
  'Prefer not to answer',
  'Prefer not to disclose',
  'I prefer not to say',
  'I prefer not to answer',
  'Choose not to disclose',
  'I choose not to disclose',
  'Do not wish to disclose',
  'Not specified',
  'Rather not say',
];

export const YES_FORMS = ['Yes', 'Y', 'True', 'I do', 'I am', 'I will', 'I have'];
export const NO_FORMS = ['No', 'N', 'False', 'I do not', 'I am not', 'I will not', 'I have not'];

export const DEGREES: Choice<Exclude<DegreeLevel, ''>>[] = [
  {
    value: 'high-school',
    label: 'High school',
    forms: ['High School', 'High School Diploma', 'Secondary School', 'Secondary Education', 'GED', 'High School or equivalent'],
  },
  {
    value: 'associate',
    label: "Associate's degree",
    forms: ["Associate's Degree", 'Associate Degree', 'Associates', 'Associate of Arts', 'Associate of Science', 'A.A.', 'A.S.'],
  },
  {
    value: 'diploma',
    label: 'College diploma',
    forms: ['Diploma', 'College Diploma', 'Advanced Diploma', 'Post-secondary Diploma', 'Vocational'],
  },
  {
    value: 'bachelor',
    label: "Bachelor's degree",
    forms: [
      "Bachelor's Degree",
      'Bachelors Degree',
      "Bachelor's",
      'Bachelors',
      'Bachelor',
      'Bachelor of Science',
      'Bachelor of Arts',
      'Bachelor of Engineering',
      'Bachelor of Applied Science',
      'Bachelor of Computer Science',
      'Bachelor of Commerce',
      'Bachelor of Business Administration',
      'B.S.',
      'BS',
      'B.A.',
      'BA',
      'B.Sc.',
      'BSc',
      'B.Eng.',
      'BEng',
      'BASc',
      'BCS',
      'BBA',
      'Undergraduate',
      'Undergraduate Degree',
    ],
  },
  {
    value: 'master',
    label: "Master's degree",
    forms: [
      "Master's Degree",
      'Masters Degree',
      "Master's",
      'Masters',
      'Master',
      'Master of Science',
      'Master of Arts',
      'Master of Engineering',
      'Master of Applied Science',
      'M.S.',
      'MS',
      'M.A.',
      'MA',
      'M.Sc.',
      'MSc',
      'M.Eng.',
      'MEng',
      'MASc',
      'Graduate Degree',
    ],
  },
  {
    value: 'mba',
    label: 'MBA',
    forms: ['MBA', 'M.B.A.', 'Master of Business Administration', 'Master of Business Administration (M.B.A.)'],
  },
  { value: 'jd', label: 'JD', forms: ['JD', 'J.D.', 'Juris Doctor', 'Juris Doctor (J.D.)', 'Law Degree'] },
  { value: 'md', label: 'MD', forms: ['MD', 'M.D.', 'Doctor of Medicine', 'Doctor of Medicine (M.D.)'] },
  {
    value: 'doctorate',
    label: 'Doctorate',
    forms: ['Doctorate', 'Doctoral Degree', 'PhD', 'Ph.D.', 'Doctor of Philosophy', 'Doctor of Philosophy (Ph.D.)', 'Doctoral'],
  },
  {
    value: 'certificate',
    label: 'Certificate',
    forms: ['Certificate', 'Certification', 'Professional Certificate', 'Graduate Certificate'],
  },
  { value: 'other', label: 'Other', forms: ['Other'] },
];

export const EMPLOYMENT_TYPES: Choice<Exclude<EmploymentType, ''>>[] = [
  { value: 'full-time', label: 'Full-time', forms: ['Full-time', 'Full time', 'Permanent'] },
  { value: 'part-time', label: 'Part-time', forms: ['Part-time', 'Part time'] },
  { value: 'internship', label: 'Internship', forms: ['Internship', 'Intern'] },
  { value: 'co-op', label: 'Co-op', forms: ['Co-op', 'Coop', 'Co-operative education'] },
  { value: 'contract', label: 'Contract', forms: ['Contract', 'Contractor', 'Temporary', 'Freelance'] },
];

export const AUTH_STATUSES: Choice<Exclude<AuthStatus, ''>>[] = [
  { value: 'citizen', label: 'Citizen', forms: ['Citizen', 'Canadian Citizen', 'U.S. Citizen', 'US Citizen', 'Citizen or National'] },
  {
    value: 'permanent-resident',
    label: 'Permanent resident',
    forms: ['Permanent Resident', 'Lawful Permanent Resident', 'Green Card Holder', 'Green Card', 'PR'],
  },
  {
    value: 'work-permit',
    label: 'Work permit',
    forms: ['Work Permit', 'Open Work Permit', 'Employment Authorization', 'EAD', 'Work Visa', 'Temporary Worker'],
  },
  {
    value: 'study-permit',
    label: 'Study permit / student visa',
    forms: ['Study Permit', 'Student Visa', 'International Student', 'F-1', 'F1', 'Co-op Work Permit'],
  },
  { value: 'visa', label: 'Other visa', forms: ['Visa', 'Visa Holder', 'Other Visa', 'H-1B', 'TN'] },
  { value: 'none', label: 'Not authorized', forms: ['Not Authorized', 'None', 'No Authorization'] },
];

export const GENDERS: Choice<Exclude<Gender, ''>>[] = [
  { value: 'male', label: 'Man', forms: ['Male', 'Man', 'M', 'Cisgender Man', 'Cis Man'] },
  { value: 'female', label: 'Woman', forms: ['Female', 'Woman', 'F', 'Cisgender Woman', 'Cis Woman'] },
  {
    value: 'non-binary',
    label: 'Non-binary',
    forms: ['Non-binary', 'Nonbinary', 'Non binary', 'Gender non-conforming', 'Genderqueer', 'Non-binary/Non-conforming', 'Gender diverse', 'X'],
  },
  { value: 'other', label: 'Another identity', forms: ['Other', 'Another gender identity', 'Self-describe', 'I prefer to self-describe', 'Not listed'] },
  { value: 'decline', label: 'Decline to answer', forms: DECLINE_FORMS },
];

export const RACES: Choice<Race>[] = [
  {
    value: 'american-indian',
    label: 'American Indian or Alaska Native',
    forms: ['American Indian or Alaska Native', 'American Indian or Alaskan Native', 'American Indian/Alaska Native', 'Native American', 'Indigenous', 'First Nations'],
  },
  {
    value: 'asian',
    label: 'Asian',
    forms: ['Asian', 'Asian (Not Hispanic or Latino)', 'East Asian', 'South Asian', 'Southeast Asian', 'Asian or Asian American'],
  },
  {
    value: 'black',
    label: 'Black or African American',
    forms: ['Black or African American', 'Black or African American (Not Hispanic or Latino)', 'Black', 'African American', 'Black/African American'],
  },
  {
    value: 'hispanic',
    label: 'Hispanic or Latino',
    forms: ['Hispanic or Latino', 'Hispanic/Latino', 'Hispanic', 'Latino', 'Latinx', 'Hispanic or Latinx', 'Latin American'],
  },
  {
    value: 'middle-eastern',
    label: 'Middle Eastern or North African',
    forms: ['Middle Eastern or North African', 'Middle Eastern', 'North African', 'MENA', 'Arab', 'West Asian'],
  },
  {
    value: 'pacific-islander',
    label: 'Native Hawaiian or Other Pacific Islander',
    forms: [
      'Native Hawaiian or Other Pacific Islander',
      'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)',
      'Native Hawaiian or Pacific Islander',
      'Pacific Islander',
      'Native Hawaiian',
    ],
  },
  { value: 'white', label: 'White', forms: ['White', 'White (Not Hispanic or Latino)', 'Caucasian', 'White or Caucasian', 'European'] },
  {
    value: 'two-or-more',
    label: 'Two or more races',
    forms: ['Two or More Races', 'Two or More Races (Not Hispanic or Latino)', 'Two or more', 'Multiracial', 'Mixed', 'Multiple'],
  },
  { value: 'decline', label: 'Decline to answer', forms: DECLINE_FORMS },
];

export const TRI_DECLINE: Choice<Exclude<TriDecline, ''>>[] = [
  { value: 'yes', label: 'Yes', forms: YES_FORMS },
  { value: 'no', label: 'No', forms: NO_FORMS },
  { value: 'decline', label: 'Decline to answer', forms: DECLINE_FORMS },
];

export const VETERAN: Choice<Exclude<VeteranStatus, ''>>[] = [
  {
    value: 'veteran',
    label: 'I am a veteran',
    forms: [
      'I identify as one or more of the classifications of a protected veteran',
      'I identify as one or more of the classifications of protected veteran listed above',
      'I am a protected veteran',
      'I am a veteran',
      'Protected Veteran',
      'Veteran',
      'Yes',
    ],
  },
  {
    value: 'not-veteran',
    label: 'I am not a veteran',
    forms: ['I am not a protected veteran', 'I am not a veteran', 'Not a protected veteran', 'Not a Veteran', 'No', 'No military service'],
  },
  { value: 'decline', label: 'Decline to answer', forms: DECLINE_FORMS },
];

export const DISABILITY: Choice<Exclude<TriDecline, ''>>[] = [
  {
    value: 'yes',
    label: 'Yes, I have a disability',
    forms: [
      'Yes, I have a disability, or have had one in the past',
      'Yes, I have a disability (or previously had a disability)',
      'Yes, I have a disability',
      'I have a disability',
      'Yes',
    ],
  },
  {
    value: 'no',
    label: 'No, I do not have a disability',
    forms: [
      'No, I do not have a disability and have not had one in the past',
      "No, I don't have a disability and have not had one in the past",
      "No, I don't have a disability",
      'No, I do not have a disability',
      'I do not have a disability',
      'No',
    ],
  },
  { value: 'decline', label: 'Decline to answer', forms: DECLINE_FORMS },
];

export const WORK_MODES = [
  { value: 'remote', label: 'Remote', forms: ['Remote', 'Fully remote', 'Work from home'] },
  { value: 'hybrid', label: 'Hybrid', forms: ['Hybrid'] },
  { value: 'onsite', label: 'On-site', forms: ['On-site', 'Onsite', 'In office', 'In-person'] },
] as const;

/**
 * Language levels, with the wordings application forms use for them. Forms
 * scale differently ("Native", "Fluent", "Professional working
 * proficiency", "4 - Advanced"), so each level lists its own words first and
 * the nearest neighbours after.
 */
export const LANGUAGE_LEVELS: Choice<Exclude<LanguageLevel, ''>>[] = [
  {
    value: 'native',
    label: 'Native or bilingual',
    forms: ['Native', 'Native speaker', 'Native or bilingual proficiency', 'Native / Bilingual', 'Bilingual', 'Mother tongue', 'First language', 'Fluent', 'Expert'],
  },
  {
    value: 'fluent',
    label: 'Fluent',
    forms: ['Fluent', 'Full professional proficiency', 'Full professional', 'Expert', 'Excellent', 'Proficient', 'Advanced'],
  },
  {
    value: 'advanced',
    label: 'Advanced (professional)',
    forms: ['Advanced', 'Professional working proficiency', 'Professional working', 'Proficient', 'Very good', 'Upper intermediate'],
  },
  {
    value: 'intermediate',
    label: 'Intermediate (conversational)',
    forms: ['Intermediate', 'Limited working proficiency', 'Limited working', 'Conversational', 'Good', 'Working knowledge', 'Moderate'],
  },
  {
    value: 'beginner',
    label: 'Beginner',
    forms: ['Beginner', 'Elementary proficiency', 'Elementary', 'Basic', 'Novice', 'Limited', 'Fair'],
  },
];

/** Languages offered as suggestions in the profile; any other can be typed. */
export const COMMON_LANGUAGES = [
  'English',
  'French',
  'Spanish',
  'Mandarin',
  'Cantonese',
  'Arabic',
  'Hindi',
  'Punjabi',
  'Urdu',
  'Bengali',
  'Tamil',
  'Gujarati',
  'Tagalog',
  'Vietnamese',
  'Korean',
  'Japanese',
  'Portuguese',
  'Italian',
  'German',
  'Russian',
  'Ukrainian',
  'Polish',
  'Persian',
  'Turkish',
  'Greek',
  'Hebrew',
  'Dutch',
  'Somali',
  'Swahili',
  'American Sign Language',
];

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function choiceForms<V extends string>(choices: readonly Choice<V>[], value: string): string[] {
  return choices.find((c) => c.value === value)?.forms ?? [];
}

export function choiceLabel<V extends string>(choices: readonly Choice<V>[], value: string): string {
  return choices.find((c) => c.value === value)?.label ?? '';
}
