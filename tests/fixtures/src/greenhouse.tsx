/**
 * Replica of a current Greenhouse application (job-boards.greenhouse.io).
 *
 * Mirrors the real page's ids, classes and structure, and uses the same widget
 * libraries: react-select for every dropdown and intl-tel-input for the phone
 * number. The content is invented.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import intlTelInput from 'intl-tel-input';
import 'intl-tel-input/styles';

type Option = { value: string; label: string };
const opts = (labels: string[]): Option[] => labels.map((label) => ({ value: label, label }));

const YES_NO = opts(['Yes', 'No']);
const COUNTRIES = opts(['Australia +61', 'Canada +1', 'France +33', 'Germany +49', 'India +91', 'United Kingdom +44', 'United States +1']);
const DEGREES = opts([
  'High School',
  "Associate's Degree",
  "Bachelor's Degree",
  "Master's Degree",
  'Master of Business Administration (M.B.A.)',
  'Juris Doctor (J.D.)',
  'Doctor of Medicine (M.D.)',
  'Doctor of Philosophy (Ph.D.)',
  "Engineer's Degree",
  'Other',
]);
const DISCIPLINES = opts(['Accounting', 'Biology', 'Business', 'Computer Engineering', 'Computer Science', 'Economics', 'Mathematics', 'Physics']);
const LOCATIONS = [
  'Windsor, England, United Kingdom',
  'Windsor, Ontario, Canada',
  'Windsor, Colorado, United States',
  'Toronto, Ontario, Canada',
  'San Francisco, California, United States',
];
const SCHOOLS = ['University of Windsor', 'University of Waterloo', 'University of Toronto', 'Windsor University School of Medicine', 'Western University'];

const search = (pool: string[]) => (input: string) =>
  new Promise<Option[]>((resolve) => {
    const q = input.trim().toLowerCase();
    // Like the real thing, results arrive a moment after typing.
    setTimeout(() => resolve(q.length < 2 ? [] : opts(pool.filter((item) => item.toLowerCase().includes(q)))), 250);
  });

type State = Record<string, unknown>;
declare global {
  interface Window {
    __state: State;
    __submitted: boolean;
  }
}
window.__state = {};
window.__submitted = false;

function useField(id: string) {
  const [value, setValue] = useState<unknown>('');
  return [
    value,
    (next: unknown) => {
      window.__state[id] = next;
      setValue(next);
    },
  ] as const;
}

function Text({ id, label, required, autoComplete, multiline }: { id: string; label: string; required?: boolean; autoComplete?: string; multiline?: boolean }) {
  const [value, set] = useField(id);
  const common = {
    id,
    'aria-label': label,
    'aria-required': required,
    'aria-invalid': false,
    value: value as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(e.target.value),
  };
  return (
    <div className="field-wrapper">
      <div className="text-input-wrapper">
        <div className={multiline ? 'input-wrapper input-wrapper__multi-line' : 'input-wrapper'}>
          <label id={`${id}-label`} htmlFor={id} className="label label">
            {label}
            {required && <span aria-hidden="true">*</span>}
          </label>
          {multiline ? (
            <textarea {...common} className="input input__multi-line" rows={4} />
          ) : (
            <input {...common} className="input input__single-line" type="text" autoComplete={autoComplete} />
          )}
        </div>
      </div>
    </div>
  );
}

function Dropdown({ id, label, required, options, load }: { id: string; label: string; required?: boolean; options?: Option[]; load?: (input: string) => Promise<Option[]> }) {
  const [, set] = useField(id);
  const shared = {
    inputId: id,
    instanceId: id,
    className: 'select-shell',
    classNamePrefix: 'select',
    placeholder: 'Select...',
    'aria-labelledby': `${id}-label`,
    isClearable: true,
    onChange: (option: Option | null) => set(option?.label ?? ''),
  };
  return (
    <div className="select">
      <div className="select__container">
        <label id={`${id}-label`} htmlFor={id} className="label select__label">
          {label}
          {required && <span aria-hidden="true">*</span>}
        </label>
        {load ? (
          <AsyncSelect<Option> {...shared} loadOptions={load} noOptionsMessage={() => 'No options'} loadingMessage={() => 'Loading...'} />
        ) : (
          <Select<Option> {...shared} options={options} />
        )}
        {/* react-select renders this for native required validation */}
        {required && <input className="remix-css-1a0ro4n-requiredInput" tabIndex={-1} aria-hidden="true" required style={{ opacity: 0, width: '100%', height: 1, position: 'absolute' }} readOnly value="" />}
      </div>
    </div>
  );
}

function Phone() {
  const ref = useRef<HTMLInputElement>(null);
  const [, set] = useField('phone');
  useEffect(() => {
    const input = ref.current!;
    const iti = intlTelInput(input, { initialCountry: 'us' });
    const update = () => {
      window.__state.phone = input.value;
      window.__state.phoneCountry = iti.getSelectedCountry()?.iso2 ?? '';
    };
    input.addEventListener('input', update);
    input.addEventListener('countrychange', update);
    return () => iti.destroy();
  }, []);
  return (
    <div className="field-wrapper">
      <div className="phone-input">
        <label id="phone-label" htmlFor="phone" className="label label">
          Phone<span aria-hidden="true">*</span>
        </label>
        <input ref={ref} id="phone" className="input input__single-line" type="tel" autoComplete="off" aria-label="Phone" aria-required="true" onChange={(e) => set(e.target.value)} />
      </div>
    </div>
  );
}

function Upload({ id, label }: { id: string; label: string }) {
  const [name, set] = useField(id);
  return (
    <div className="file-upload" role="group" aria-labelledby={`upload-label-${id}`}>
      <div id={`upload-label-${id}`} className="label upload-label">
        {label}
      </div>
      <div className="file-upload__wrapper">
        <div className="button-container">
          <div>
            <button type="button" className="btn btn--pill" onClick={() => document.getElementById(id)?.click()}>
              Attach
            </button>
            <label htmlFor={id} className="visually-hidden">
              Attach
            </label>
            <input id={id} className="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" onChange={(e) => set(e.target.files?.[0]?.name ?? '')} />
          </div>
        </div>
        {name ? <p className="chosen-file">{name as string}</p> : null}
      </div>
    </div>
  );
}

function Section({ title, id, children }: { title?: string; id?: string; children: ReactNode }) {
  return (
    <div id={id}>
      {title && <h3 className="section-header font-primary">{title}</h3>}
      {children}
    </div>
  );
}

function App() {
  const [consent, setConsent] = useField('gdpr_demographic_data_consent_given');
  return (
    <main className="main">
      <div className="job__header">
        <h1 className="section-header section-header--large font-primary">Software Developer Intern</h1>
        <div className="job__location">Windsor, Ontario</div>
      </div>
      <div className="job__description body">
        <p>Acme Robotics builds warehouse robots. We are looking for a software developer intern for the summer term.</p>
        <p>
          <strong>What you will do</strong>
        </p>
        <ul>
          <li>Build internal tools in TypeScript and React</li>
          <li>Write Python services that talk to our robots</li>
        </ul>
      </div>
      <form
        id="application-form"
        className="application--form"
        onSubmit={(e) => {
          e.preventDefault();
          window.__submitted = true;
        }}
      >
        <div className="application--questions">
          <Text id="first_name" label="First Name" required autoComplete="given-name" />
          <Text id="last_name" label="Last Name" required autoComplete="family-name" />
          <Text id="preferred_name" label="Preferred First Name" />
          <Text id="email" label="Email" required autoComplete="email" />
          <Dropdown id="country" label="Country" required options={COUNTRIES} />
          <Phone />
          <Dropdown id="candidate-location" label="Location (City)" required load={search(LOCATIONS)} />
          <Upload id="resume" label="Resume/CV" />
          <Upload id="cover_letter" label="Cover Letter" />

          <div className="education--container">
            <div className="education--header">
              <p className="body body--medium">Education</p>
            </div>
            <Dropdown id="school--0" label="School" load={search(SCHOOLS)} />
            <Dropdown id="degree--0" label="Degree" options={DEGREES} />
            <Dropdown id="discipline--0" label="Discipline" options={DISCIPLINES} />
          </div>

          <Text id="question_1001" label="Why do you want to work at Acme Robotics?" required multiline />
          <Text id="question_1002" label="LinkedIn Profile" />
          <Text id="question_1003" label="Website" />
          <Text id="question_1004" label="How did you hear about this job?" />
          <Dropdown id="question_1005" label="Are you legally authorized to work in Canada?" required options={YES_NO} />
          <Dropdown id="question_1006" label="Will you now or in the future require sponsorship for employment visa status in Canada?" required options={YES_NO} />
          <Dropdown id="question_1007" label="Are you legally authorized to work in the United States?" required options={YES_NO} />
          <Text id="question_1008" label="When do you graduate?" />
          <Dropdown id="question_1009" label="Which term are you applying for?" required options={opts(['Winter 2027', 'Summer 2027', 'Fall 2027'])} />
          <Text id="question_1010" label="What programming language are you strongest in?" />
        </div>
        <hr />
        <Section id="demographic-section" title="Voluntary Self Identification">
          <Dropdown id="4033064002" label="Gender" options={opts(['Male', 'Female', 'Decline To Self Identify'])} />
          <Dropdown id="4033063002" label="Are you Hispanic/Latino?" options={opts(['Yes', 'No', 'Decline To Self Identify'])} />
          <Dropdown
            id="4033065002"
            label="Race and Ethnicity"
            options={opts([
              'American Indian or Alaskan Native',
              'Asian',
              'Black or African American',
              'Hispanic or Latino',
              'White',
              'Native Hawaiian or Other Pacific Islander',
              'Two or More Races',
              'Decline To Self Identify',
            ])}
          />
          <Dropdown
            id="4033066002"
            label="Veteran Status"
            options={opts([
              'I am not a protected veteran',
              'I identify as one or more of the classifications of a protected veteran',
              "I don't wish to answer",
            ])}
          />
          <Dropdown
            id="4033067002"
            label="Disability Status"
            options={opts([
              'Yes, I have a disability, or have had one in the past',
              'No, I do not have a disability and have not had one in the past',
              'I do not want to answer',
            ])}
          />
          <div className="checkbox">
            <div className="checkbox__wrapper">
              <div className="checkbox__input">
                <input
                  id="gdpr_demographic_data_consent_given_1"
                  name="gdpr_demographic_data_consent_given"
                  className="checkbox--full-width"
                  type="checkbox"
                  checked={consent === true}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <label htmlFor="gdpr_demographic_data_consent_given_1">
                  By checking this box, I consent to Acme Robotics collecting, storing, and processing my responses to the demographic data surveys above.
                </label>
              </div>
            </div>
          </div>
        </Section>
        <div className="application--submit">
          <button type="submit" className="btn btn--pill">
            Submit application
          </button>
        </div>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
