/**
 * Replica of a Workday application (<tenant>.wdN.myworkdayjobs.com/…/apply).
 *
 * The markup follows what Workday's public pages show: every question in a
 * `formField-<name>` wrapper with a label and an <abbr>*</abbr> marker,
 * controls carrying `data-automation-id`, and a step-by-step progress bar.
 * The widgets behave the way Workday's do: dropdowns are buttons whose list
 * opens in a popup at the end of the page; search prompts list categories,
 * search when Enter is pressed and show choices as removable items; dates
 * are separate month and year boxes. The content is invented.
 */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    __state: Record<string, unknown>;
    __step: number;
    __submitted: boolean;
  }
}
window.__state = {};
window.__step = 0;
window.__submitted = false;

let inputs = 0;
const nextId = () => `input-${++inputs}`;

/** Inside a repeated entry, its fields are stored as "<entry>.<field>". */
const Entry = createContext('');

function useField<T>(name: string, initial: T) {
  const prefix = useContext(Entry);
  const key = prefix ? `${prefix}.${name}` : name;
  const [value, setValue] = useState<T>(() => (key in window.__state ? (window.__state[key] as T) : initial));
  return [
    value,
    (next: T) => {
      window.__state[key] = next;
      setValue(next);
    },
  ] as const;
}

function Field({ id, label, required, htmlFor, children }: { id: string; label: string; required?: boolean; htmlFor?: string; children: ReactNode }) {
  return (
    <div data-automation-id={`formField-${id}`} className="css-1s0c1uz">
      <label htmlFor={htmlFor} className="css-1ud5i8o">
        <span>
          {label}
          {required && (
            <abbr aria-hidden="true" title="required" className="css-1kd3j4h">
              *
            </abbr>
          )}
        </span>
      </label>
      <div className="css-1h7w4o6">{children}</div>
    </div>
  );
}

function Text({ id, label, required, automation, textarea }: { id: string; label: string; required?: boolean; automation?: string; textarea?: boolean }) {
  const [inputId] = useState(nextId);
  const [value, set] = useField(id, '');
  return (
    <Field id={id} label={label} required={required} htmlFor={inputId}>
      {textarea ? (
        <textarea id={inputId} data-automation-id={automation ?? id} aria-required={required} value={value} onChange={(e) => set(e.target.value)} rows={4} />
      ) : (
        <input type="text" id={inputId} data-automation-id={automation ?? id} aria-required={required} value={value} onChange={(e) => set(e.target.value)} />
      )}
    </Field>
  );
}

/** A Workday dropdown: a button, and a list in a popup at the end of the page. */
function Dropdown({ id, label, options, required }: { id: string; label: string; options: string[]; required?: boolean }) {
  const [inputId] = useState(nextId);
  const [value, set] = useField(id, '');
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-automation-id="selectWidget-popup"]') && e.target !== button.current) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = () => {
    const r = button.current!.getBoundingClientRect();
    setPlace({ top: r.bottom + window.scrollY + 2, left: r.left + window.scrollX });
    setOpen((o) => !o);
  };

  return (
    <Field id={id} label={label} required={required} htmlFor={inputId}>
      <button
        ref={button}
        type="button"
        id={inputId}
        data-automation-id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} ${value || 'Select One'}${required ? ' Required' : ''}`}
        value={value}
        className="css-1sx2rkd"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        {value || 'Select One'}
      </button>
      {open &&
        createPortal(
          <div data-automation-id="selectWidget-popup" className="popup" style={{ top: place.top, left: place.left }}>
            <ul role="listbox" aria-label={label}>
              {options.map((o) => (
                <li
                  key={o}
                  role="option"
                  aria-selected={o === value}
                  data-value={o}
                  className="css-option"
                  onClick={() => {
                    set(o);
                    setOpen(false);
                    button.current?.focus();
                  }}
                >
                  <div>{o}</div>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </Field>
  );
}

type Tree = { name: string; children?: Tree }[];

const leaves = (tree: Tree): string[] => tree.flatMap((n) => (n.children ? leaves(n.children) : [n.name]));

/**
 * A Workday search prompt. Opening it lists the top categories; a category
 * opens its own list. Typing does nothing until Enter, which searches every
 * choice. A choice appears as a removable item.
 */
function Prompt({ id, label, tree, required, automation, multi }: { id: string; label: string; tree: Tree; required?: boolean; automation?: string; multi?: boolean }) {
  const [inputId] = useState(nextId);
  const listId = useId();
  const [chosen, set] = useField<string[]>(id, []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState<Tree>(tree);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (node: Tree[number]) => {
    if (node.children) {
      setShown(node.children);
      return;
    }
    set(multi ? [...chosen.filter((c) => c !== node.name), node.name] : [node.name]);
    setQuery('');
    setShown(tree);
    setOpen(false);
  };

  return (
    <Field id={id} label={label} required={required} htmlFor={inputId}>
      <div ref={wrap}>
        <ul data-automation-id="selectedItemList" className="chips">
          {chosen.map((c) => (
            <li key={c} data-automation-id="selectedItem" className="chip">
              <p>{c}</p>
              <button type="button" aria-label={`Remove ${c}`} data-automation-id="DELETE_charm" onClick={() => set(chosen.filter((x) => x !== c))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div data-automation-id="multiselectInputContainer">
          <input
            type="text"
            id={inputId}
            data-automation-id={automation ?? 'searchBox'}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            placeholder="Search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const q = query.trim().toLowerCase();
                setShown(q ? leaves(tree).filter((l) => l.toLowerCase().includes(q)).map((name) => ({ name })) : tree);
                setOpen(true);
              }
              if (e.key === 'Escape') setOpen(false);
            }}
          />
        </div>
        {open && (
          <div role="listbox" id={listId} data-automation-id="activeListContainer" className="prompt-list">
            {shown.length === 0 ? (
              <div data-automation-id="promptOption" className="empty">
                No Items.
              </div>
            ) : (
              shown.map((node) => (
                <div
                  key={node.name}
                  role="option"
                  aria-selected={chosen.includes(node.name)}
                  data-automation-id="promptOption"
                  data-automation-label={node.name}
                  className={node.children ? 'option category' : 'option'}
                  onClick={() => choose(node)}
                >
                  {node.name}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Field>
  );
}

function DateParts({ id, label, parts, required }: { id: string; label: string; parts: ('Month' | 'Day' | 'Year')[]; required?: boolean }) {
  const [first] = useState(nextId);
  return (
    <Field id={id} label={label} required={required} htmlFor={first}>
      <div data-automation-id="dateInputWrapper" role="group" className="date">
        {parts.map((part, i) => (
          <DatePart key={part} id={`${id}.${part}`} inputId={i === 0 ? first : undefined} part={part} />
        ))}
      </div>
    </Field>
  );
}

function DatePart({ id, inputId, part }: { id: string; inputId?: string; part: 'Month' | 'Day' | 'Year' }) {
  const [value, set] = useField(id, '');
  return (
    <input
      type="text"
      id={inputId}
      data-automation-id={`dateSection${part}-input`}
      role="spinbutton"
      aria-label={part}
      placeholder={part === 'Year' ? 'YYYY' : part === 'Month' ? 'MM' : 'DD'}
      inputMode="numeric"
      size={part === 'Year' ? 4 : 2}
      value={value}
      onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, part === 'Year' ? 4 : 2))}
    />
  );
}

function Radios({ id, label, options, required }: { id: string; label: string; options: string[]; required?: boolean }) {
  const [value, set] = useField(id, '');
  return (
    <fieldset data-automation-id={`formField-${id}`} className="css-radio">
      <legend>
        <label>
          <span>
            {label}
            {required && <abbr aria-hidden="true">*</abbr>}
          </span>
        </label>
      </legend>
      {options.map((o) => {
        const radioId = `${id}-${o}`;
        return (
          <div key={o}>
            <input type="radio" id={radioId} name={id} value={o} checked={value === o} onChange={() => set(o)} />
            <label htmlFor={radioId}>{o}</label>
          </div>
        );
      })}
    </fieldset>
  );
}

function Check({ id, label }: { id: string; label: string }) {
  const [inputId] = useState(nextId);
  const [value, set] = useField(id, false);
  return (
    <div data-automation-id={`formField-${id}`}>
      <input type="checkbox" id={inputId} data-automation-id={id} checked={value} onChange={(e) => set(e.target.checked)} />
      <label htmlFor={inputId}>{label}</label>
    </div>
  );
}

function Checks({ id, label, options }: { id: string; label: string; options: string[] }) {
  const [value, set] = useField<string[]>(id, []);
  return (
    <fieldset data-automation-id={`formField-${id}`}>
      <legend>
        <label>
          <span>{label}</span>
        </label>
      </legend>
      {options.map((o, i) => (
        <div key={o}>
          <input type="checkbox" id={`${id}-${i}`} name={id} checked={value.includes(o)} onChange={(e) => set(e.target.checked ? [...value, o] : value.filter((v) => v !== o))} />
          <label htmlFor={`${id}-${i}`}>{o}</label>
        </div>
      ))}
    </fieldset>
  );
}

function ResumeUpload() {
  const [files, set] = useField<string[]>('resume', []);
  const input = useRef<HTMLInputElement>(null);
  return (
    <section>
      <h3>Resume/CV</h3>
      <div data-automation-id="file-upload-drop-zone" className="drop">
        <p>Upload a file (5MB max) or drag and drop it here</p>
        <input
          ref={input}
          type="file"
          data-automation-id="file-upload-input-ref"
          accept=".pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={(e) => set([...(e.target.files ?? [])].map((f) => f.name))}
        />
        <button type="button" data-automation-id="select-files" onClick={() => input.current?.click()}>
          Select files
        </button>
      </div>
      {files.map((f) => (
        <div key={f} data-automation-id="file-upload-item">
          <div data-automation-id="file-upload-item-name">{f}</div>
        </div>
      ))}
    </section>
  );
}

const PROVINCES = ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan'];
const COUNTRIES = ['Canada', 'Mexico', 'United Kingdom', 'United States of America'];
const YES_NO = ['Yes', 'No'];

const SOURCES: Tree = [
  { name: 'Company Website' },
  { name: 'Job Board', children: [{ name: 'Glassdoor' }, { name: 'Indeed' }, { name: 'LinkedIn Jobs' }] },
  { name: 'Referral', children: [{ name: 'Employee Referral' }, { name: 'Friend or Family' }] },
  { name: 'Social Media', children: [{ name: 'Instagram' }, { name: 'LinkedIn' }, { name: 'Twitter / X' }] },
  { name: 'University', children: [{ name: 'Career Fair' }, { name: 'Co-op Office' }] },
];
const DIAL_CODES: Tree = [
  { name: 'Canada (+1)' },
  { name: 'Mexico (+52)' },
  { name: 'United Kingdom (+44)' },
  { name: 'United States of America (+1)' },
];
const SCHOOLS: Tree = [
  { name: 'Universities in Canada', children: [{ name: 'University of Toronto' }, { name: 'University of Waterloo' }, { name: 'University of Windsor' }, { name: 'Western University' }] },
  { name: 'Universities in the United States', children: [{ name: 'University of Michigan' }, { name: 'Wayne State University' }] },
];
const LANGUAGES = ['Arabic', 'English', 'French', 'German', 'Mandarin', 'Punjabi', 'Spanish'];
const LEVELS = ['1 - Elementary', '2 - Limited Working', '3 - Professional Working', '4 - Full Professional', '5 - Native or Bilingual'];
const SKILLS: Tree = ['C++', 'Docker', 'Java', 'JavaScript', 'Kubernetes', 'PostgreSQL', 'Python', 'Python (Programming Language)', 'React.js', 'SQL', 'TypeScript'].map((name) => ({ name }));
const FIELDS: Tree = [{ name: 'Computer Engineering' }, { name: 'Computer Science' }, { name: 'Mathematics' }, { name: 'Software Engineering' }];

/**
 * A section of entries that starts empty: "Add" makes the first, "Add Another"
 * each one after, as on Workday's My Experience page.
 */
function Entries({ section, prefix, title, children }: { section: string; prefix: string; title: string; children: ReactNode }) {
  const [count, setCount] = useState(0);
  return (
    <section data-automation-id={section}>
      <h3>{title}</h3>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} data-automation-id={`${prefix}-${i + 1}`} role="group" aria-labelledby={`${prefix}-${i + 1}-title`}>
          <h4 id={`${prefix}-${i + 1}-title`}>
            {title} {i + 1}
          </h4>
          <Entry.Provider value={`${prefix}-${i + 1}`}>{children}</Entry.Provider>
        </div>
      ))}
      <button type="button" data-automation-id="Add" aria-label={`${count ? 'Add Another' : 'Add'} ${title}`} onClick={() => setCount(count + 1)}>
        {count ? 'Add Another' : 'Add'}
      </button>
    </section>
  );
}

/** Before the application: create an account with this employer's Workday, or sign in. */
function PasswordBox({ id, label }: { id: string; label: string }) {
  const [inputId] = useState(nextId);
  const [value, set] = useField(id, '');
  return (
    <Field id={id} label={label} required htmlFor={inputId}>
      <input type="password" id={inputId} data-automation-id={id} aria-required value={value} onChange={(e) => set(e.target.value)} />
    </Field>
  );
}

function Account({ mode, onDone }: { mode: 'create' | 'signin'; onDone: () => void }) {
  const [trap, setTrap] = useField('beecatcher', '');
  return (
    <div data-automation-id={mode === 'create' ? 'createAccountPage' : 'signInPage'}>
      <h2>{mode === 'create' ? 'Create Account' : 'Sign In'}</h2>
      <Text id="email" label="Email Address" required />
      <PasswordBox id="password" label="Password" />
      {mode === 'create' && <PasswordBox id="verifyPassword" label="Verify New Password" />}
      {mode === 'create' && <Check id="createAccountCheckbox" label="Yes, I have read and consent to the terms and conditions" />}
      {/* For robots only: kept off-screen. */}
      <input type="text" data-automation-id="beecatcher" tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', left: -10000 }} value={trap} onChange={(e) => setTrap(e.target.value)} />
      <button type="button" data-automation-id={mode === 'create' ? 'createAccountSubmitButton' : 'signInSubmitButton'} onClick={onDone}>
        {mode === 'create' ? 'Create Account' : 'Sign In'}
      </button>
    </div>
  );
}

function MyInformation() {
  return (
    <div data-automation-id="applyFlowMyInfoPage">
      <h2>My Information</h2>
      <Prompt id="source" label="How Did You Hear About Us?" tree={SOURCES} required />
      <Radios id="candidateIsPreviousWorker" label="Have you previously worked for Acme Robotics?" options={YES_NO} required />
      <Dropdown id="countryDropdown" label="Country" options={COUNTRIES} required />
      <h3>Legal Name</h3>
      <Text id="legalNameSection_firstName" label="Given Name(s)" required />
      <Text id="legalNameSection_middleName" label="Middle Name" />
      <Text id="legalNameSection_lastName" label="Family Name" required />
      <Check id="preferredNameCheckbox" label="I have a preferred name" />
      <h3>Address</h3>
      <Text id="addressSection_addressLine1" label="Address Line 1" required />
      <Text id="addressSection_city" label="City" required />
      <Dropdown id="addressSection_countryRegion" label="Province or Territory" options={PROVINCES} required />
      <Text id="addressSection_postalCode" label="Postal Code" required />
      <h3>Email Address</h3>
      <Text id="email" label="Email Address" required />
      <h3>Phone</h3>
      <Dropdown id="phone-device-type" label="Phone Device Type" options={['Home', 'Mobile', 'Work']} required />
      <Prompt id="country-phone-code" label="Country Phone Code" tree={DIAL_CODES} required />
      <Text id="phone-number" label="Phone Number" required />
      <Text id="phone-extension" label="Phone Extension" />
    </div>
  );
}

function MyExperience() {
  return (
    <div data-automation-id="applyFlowMyExpPage">
      <h2>My Experience</h2>
      <Entries section="workExperienceSection" prefix="workExperience" title="Work Experience">
        <Text id="jobTitle" label="Job Title" required />
        <Text id="companyName" label="Company" required />
        <Text id="location" label="Location" />
        <Check id="currentlyWorkHere" label="I currently work here" />
        <DateParts id="startDate" label="From" parts={['Month', 'Year']} required />
        <DateParts id="endDate" label="To" parts={['Month', 'Year']} required />
        <Text id="roleDescription" label="Role Description" textarea />
      </Entries>
      <Entries section="educationSection" prefix="education" title="Education">
        <Prompt id="schoolName" label="School or University" tree={SCHOOLS} required />
        <Dropdown id="degree" label="Degree" options={['High School Diploma', "Associate's Degree", "Bachelor's Degree", "Master's Degree", 'Doctorate']} required />
        <Prompt id="fieldOfStudy" label="Field of Study" tree={FIELDS} />
        <Text id="gradeAverage" label="Overall Result (GPA)" />
        <DateParts id="firstYearAttended" label="From" parts={['Year']} />
        <DateParts id="lastYearAttended" label="To (Actual or Expected)" parts={['Year']} />
      </Entries>
      <Entries section="languageSection" prefix="language" title="Languages">
        <Dropdown id="language" label="Language" options={LANGUAGES} required />
        <Check id="nativeLanguage" label="I am fluent in this language." />
        <Dropdown id="languageProficiency-reading" label="Reading" options={LEVELS} />
        <Dropdown id="languageProficiency-speaking" label="Speaking" options={LEVELS} />
        <Dropdown id="languageProficiency-writing" label="Writing" options={LEVELS} />
      </Entries>
      <section data-automation-id="skillsSection">
        <h3>Skills</h3>
        <Prompt id="skills" label="Type to Add Skills" tree={SKILLS} multi />
      </section>
      <ResumeUpload />
      <section>
        <h3>Websites</h3>
        <Text id="linkedinQuestion" label="LinkedIn" />
      </section>
    </div>
  );
}

function Questions() {
  return (
    <div data-automation-id="applyFlowPrimaryQuestionnairePage">
      <h2>Application Questions</h2>
      <Dropdown id="primaryQuestionnaire--q1" label="Are you legally authorized to work in the country in which this position is located?" options={YES_NO} required />
      <Dropdown id="primaryQuestionnaire--q2" label="Will you now or in the future require sponsorship for employment visa status?" options={YES_NO} required />
      <Dropdown id="primaryQuestionnaire--q3" label="Are you willing to relocate for this role?" options={YES_NO} required />
      <Dropdown id="primaryQuestionnaire--q4" label="How many years of professional experience do you have with C++?" options={['0-1', '2-4', '5+']} required />
      <Text id="primaryQuestionnaire--q5" label="What are your salary expectations?" textarea required />
    </div>
  );
}

function Disclosures() {
  return (
    <div data-automation-id="applyFlowVoluntaryDisclosuresPage">
      <h2>Voluntary Disclosures</h2>
      <Dropdown id="gender" label="Gender" options={['Female', 'Male', 'Non-binary', 'I do not wish to answer']} />
      <Dropdown
        id="ethnicityDropdown"
        label="Ethnicity"
        options={[
          'American Indian or Alaska Native (Not Hispanic or Latino)',
          'Asian (Not Hispanic or Latino)',
          'Black or African American (Not Hispanic or Latino)',
          'Hispanic or Latino',
          'Two or More Races (Not Hispanic or Latino)',
          'White (Not Hispanic or Latino)',
          'I do not wish to answer',
        ]}
      />
      <Dropdown id="veteranStatus" label="Veteran Status" options={['I am not a protected veteran', 'I identify as one or more of the classifications of protected veteran', 'I do not wish to answer']} />
      <Check id="agreementCheckbox" label="I have read and consent to the terms and conditions" />
    </div>
  );
}

function SelfIdentify() {
  return (
    <div data-automation-id="applyFlowSelfIdentifyPage">
      <h2>Self Identify</h2>
      <p>Voluntary Self-Identification of Disability</p>
      <Text id="name" label="Name" required />
      <DateParts id="dateSignedOn" label="Date" parts={['Month', 'Day', 'Year']} required />
      <Checks
        id="disabilityStatus"
        label="Please check one of the boxes below:"
        options={['Yes, I have a disability, or have had one in the past', 'No, I do not have a disability and have not had one in the past', 'I do not want to answer']}
      />
    </div>
  );
}

const STEPS = ['My Information', 'My Experience', 'Application Questions', 'Voluntary Disclosures', 'Self Identify', 'Review'];

const ACCOUNT = new URLSearchParams(location.search).get('account');

function App() {
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<'create' | 'signin' | null>(ACCOUNT === 'create' || ACCOUNT === 'signin' ? ACCOUNT : null);
  window.__step = step;
  if (account) {
    return (
      <main data-automation-id="authPage">
        <h1 data-automation-id="jobPostingHeader">Software Developer, Robotics Platform</h1>
        <Account mode={account} onDone={() => setAccount(null)} />
      </main>
    );
  }
  return (
    <main data-automation-id="applyFlowPage">
      <h1 data-automation-id="jobPostingHeader">Software Developer, Robotics Platform</h1>
      <ol data-automation-id="progressBar" className="progress">
        {STEPS.map((name, i) => (
          <li key={name} data-automation-id={i === step ? 'progressBarActiveStep' : i < step ? 'progressBarCompletedStep' : 'progressBarInactiveStep'}>
            <label aria-live="polite">
              step {i + 1} of {STEPS.length}
            </label>
            <label>{name}</label>
          </li>
        ))}
      </ol>
      {step === 0 && <MyInformation />}
      {step === 1 && <MyExperience />}
      {step === 2 && <Questions />}
      {step === 3 && <Disclosures />}
      {step === 4 && <SelfIdentify />}
      {step === 5 && <h2>Review</h2>}
      <div data-automation-id="pageFooter" className="footer">
        {step > 0 && (
          <button type="button" data-automation-id="bottom-navigation-back-button" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 5 ? (
          <button type="button" data-automation-id="bottom-navigation-next-button" onClick={() => setStep(step + 1)}>
            Save and Continue
          </button>
        ) : (
          <button type="button" data-automation-id="bottom-navigation-next-button" onClick={() => (window.__submitted = true)}>
            Submit
          </button>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
