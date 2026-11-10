import { describe, expect, it } from 'vitest';
import { DECLINE_FORMS, DEGREES, DISABILITY, GENDERS, NO_FORMS, RACES, VETERAN, YES_FORMS, choiceForms } from '@/core/data/choices';
import { countryForms, regionForms } from '@/core/data/geo';
import { isYesNo, matchOption, matchOptions } from '@/core/autofill/options';

const pick = (forms: readonly string[], options: string[]) => {
  const m = matchOption(forms, options);
  return m ? options[m.index] : null;
};

describe('matchOption', () => {
  it('matches yes/no options, including elaborated ones', () => {
    expect(pick(YES_FORMS, ['Select...', 'Yes', 'No'])).toBe('Yes');
    expect(pick(NO_FORMS, ['Yes', 'No'])).toBe('No');
    expect(pick(YES_FORMS, ['Yes, I am authorized to work', 'No, I am not'])).toBe('Yes, I am authorized to work');
    expect(pick(NO_FORMS, ['Yes - I will require sponsorship', 'No - I will not require sponsorship'])).toBe(
      'No - I will not require sponsorship',
    );
  });

  it('never confuses "No" with "Non-binary"', () => {
    expect(pick(NO_FORMS, ['Non-binary', 'Male', 'Female'])).toBeNull();
  });

  it('ignores placeholder options', () => {
    expect(pick(['Select'], ['Select...', 'Yes', 'No'])).toBeNull();
    expect(pick(YES_FORMS, ['--', 'Yes', 'No'])).toBe('Yes');
  });

  it('matches countries however the form words them', () => {
    expect(pick(countryForms('US'), ['Canada', 'United States of America', 'Mexico'])).toBe('United States of America');
    expect(pick(countryForms('US'), ['CA', 'US', 'MX'])).toBe('US');
    expect(pick(countryForms('CA'), ['United States', 'Canada', 'California'])).toBe('Canada');
    expect(pick(countryForms('GB'), ['United States', 'United Kingdom', 'United Arab Emirates'])).toBe('United Kingdom');
    expect(pick(countryForms('US'), ['United States +1', 'Canada +1'])).toBe('United States +1');
  });

  it('matches provinces and states by name or abbreviation', () => {
    expect(pick(regionForms('Ontario', 'CA'), ['AB', 'BC', 'ON', 'QC'])).toBe('ON');
    expect(pick(regionForms('ON', 'CA'), ['Alberta', 'Ontario', 'Quebec'])).toBe('Ontario');
    expect(pick(regionForms('Quebec', 'CA'), ['Ontario', 'Québec'])).toBe('Québec');
    expect(pick(regionForms('California', 'US'), ['CA - California', 'NY - New York'])).toBe('CA - California');
  });

  it('matches degree levels', () => {
    const forms = choiceForms(DEGREES, 'bachelor');
    expect(pick(forms, ["Associate's Degree", "Bachelor's Degree", "Master's Degree"])).toBe("Bachelor's Degree");
    expect(pick(forms, ['High School', 'Bachelor of Science (B.S.)', 'Master of Science (M.S.)'])).toBe(
      'Bachelor of Science (B.S.)',
    );
    expect(pick(forms, ['Bachelors', 'Masters', 'PhD'])).toBe('Bachelors');
    expect(pick(choiceForms(DEGREES, 'doctorate'), ['Bachelors', 'Masters', 'Doctor of Philosophy (Ph.D.)'])).toBe(
      'Doctor of Philosophy (Ph.D.)',
    );
    expect(pick(choiceForms(DEGREES, 'master'), ["Bachelor's Degree", "Master's Degree", 'Master of Business Administration (M.B.A.)'])).toBe(
      "Master's Degree",
    );
  });

  it('matches demographic choices in the usual EEO wordings', () => {
    expect(pick(choiceForms(GENDERS, 'male'), ['Male', 'Female', 'Decline To Self Identify'])).toBe('Male');
    expect(pick(choiceForms(GENDERS, 'female'), ['Man', 'Woman', 'Non-binary', 'I prefer not to say'])).toBe('Woman');
    expect(pick(choiceForms(GENDERS, 'non-binary'), ['Man', 'Woman', 'Non-Binary / Non-Conforming'])).toBe(
      'Non-Binary / Non-Conforming',
    );
    expect(pick(DECLINE_FORMS, ['Male', 'Female', 'Decline To Self Identify'])).toBe('Decline To Self Identify');
    expect(pick(DECLINE_FORMS, ['Yes', 'No', "I don't wish to answer"])).toBe("I don't wish to answer");
    expect(pick(choiceForms(RACES, 'asian'), ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'White'])).toBe('Asian');
    expect(pick(choiceForms(RACES, 'white'), ['Asian (Not Hispanic or Latino)', 'White (Not Hispanic or Latino)'])).toBe(
      'White (Not Hispanic or Latino)',
    );
    expect(
      pick(choiceForms(VETERAN, 'not-veteran'), [
        'I am not a protected veteran',
        'I identify as one or more of the classifications of a protected veteran',
        "I don't wish to answer",
      ]),
    ).toBe('I am not a protected veteran');
    expect(
      pick(choiceForms(DISABILITY, 'no'), [
        'Yes, I have a disability, or have had one in the past',
        'No, I do not have a disability and have not had one in the past',
        'I do not want to answer',
      ]),
    ).toBe('No, I do not have a disability and have not had one in the past');
    expect(
      pick(choiceForms(DISABILITY, 'decline'), [
        'Yes, I have a disability, or have had one in the past',
        'No, I do not have a disability and have not had one in the past',
        'I do not want to answer',
      ]),
    ).toBe('I do not want to answer');
  });

  it('returns null when nothing fits', () => {
    expect(pick(['Windsor'], ['Toronto', 'Vancouver'])).toBeNull();
    expect(pick([], ['Yes', 'No'])).toBeNull();
  });
});

describe('matchOptions', () => {
  it('picks several options for a checkbox group', () => {
    const options = ['Asian', 'Black or African American', 'White', 'Prefer not to say'];
    expect(matchOptions([choiceForms(RACES, 'asian'), choiceForms(RACES, 'white')], options)).toEqual([0, 2]);
  });
});

describe('isYesNo', () => {
  it('recognises yes/no questions', () => {
    expect(isYesNo(['Select...', 'Yes', 'No'])).toBe(true);
    expect(isYesNo(['Yes', 'No', 'Prefer not to say'])).toBe(true);
    expect(isYesNo(['Male', 'Female'])).toBe(false);
    expect(isYesNo(['Yes', 'No', 'Maybe', 'Sometimes', 'Never'])).toBe(false);
  });
});
