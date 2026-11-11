/**
 * Replica of a Workable application (apply.workable.com/<account>/j/<code>/apply/):
 * a React form with styled-component class names and `data-ui` attributes on
 * every field, sections for personal details, profile and details, and the
 * employer's own questions named QA_<id>: yes/no radios, a searchable
 * dropdown, a date, a checkbox list and a file. The content is invented.
 */
import { useId, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    __state: Record<string, unknown>;
    __submitted: boolean;
  }
}
window.__state = {};
window.__submitted = false;

function useField<T>(name: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  return [
    value,
    (next: T) => {
      window.__state[name] = next;
      setValue(next);
    },
  ] as const;
}

function Label({ htmlFor, required, children }: { htmlFor?: string; required?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="styles__Label-sc-1x4kk5h-0 kZpLPV">
      <span>{children}</span>
      {required && <span className="styles__Required-sc-1x4kk5h-1 dTlRqZ">*</span>}
    </label>
  );
}

function Text({ name, label, required, type = 'text', textarea }: { name: string; label: string; required?: boolean; type?: string; textarea?: boolean }) {
  const [value, set] = useField(name, '');
  return (
    <div className="styles__Field-sc-11ko3y2-0 fHvqZW">
      <Label htmlFor={name} required={required}>
        {label}
      </Label>
      {textarea ? (
        <textarea id={name} name={name} data-ui={name} rows={4} value={value} onChange={(e) => set(e.target.value)} />
      ) : (
        <input id={name} name={name} data-ui={name} type={type} required={required} value={value} onChange={(e) => set(e.target.value)} />
      )}
    </div>
  );
}

function YesNo({ name, label, required }: { name: string; label: string; required?: boolean }) {
  const [value, set] = useField(name, '');
  return (
    <fieldset data-ui={name} className="styles__Fieldset-sc-1r7tpj6-0">
      <legend>
        {label}
        {required && <span className="dTlRqZ">*</span>}
      </legend>
      {(
        [
          ['true', 'Yes'],
          ['false', 'No'],
        ] as const
      ).map(([v, text]) => (
        <label key={v} className="styles__Radio-sc-1r7tpj6-1">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => set(v)} /> {text}
        </label>
      ))}
    </fieldset>
  );
}

/** A searchable dropdown: an ARIA combobox with its own list. */
function Dropdown({ name, label, options, required }: { name: string; label: string; options: string[]; required?: boolean }) {
  const listId = useId();
  const [value, set] = useField(name, '');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const shown = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="styles__Field-sc-11ko3y2-0 fHvqZW" data-ui={name}>
      <Label htmlFor={`${name}-input`} required={required}>
        {label}
      </Label>
      <input
        id={`${name}-input`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Select…"
        value={open ? query : value}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul role="listbox" id={listId} className="styles__Menu-sc-ox5rbh-0">
          {shown.map((o) => (
            <li
              key={o}
              role="option"
              aria-selected={o === value}
              onMouseDown={(e) => {
                e.preventDefault();
                set(o);
                setQuery('');
                setOpen(false);
              }}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Checkboxes({ name, label, options }: { name: string; label: string; options: string[] }) {
  const [value, set] = useField<string[]>(name, []);
  return (
    <fieldset data-ui={name}>
      <legend>{label}</legend>
      {options.map((o) => (
        <label key={o}>
          <input type="checkbox" name={name} value={o} checked={value.includes(o)} onChange={(e) => set(e.target.checked ? [...value, o] : value.filter((v) => v !== o))} /> {o}
        </label>
      ))}
    </fieldset>
  );
}

function Upload({ name, label, required }: { name: string; label: string; required?: boolean }) {
  const [files, set] = useField<string[]>(name, []);
  const labelId = useId();
  return (
    <div className="styles__Field-sc-11ko3y2-0 fHvqZW" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="kZpLPV">
        {label}
        {required && <span className="dTlRqZ">*</span>}
      </span>
      <div className="styles__Dropzone-sc-17r5dbh-0">
        <span>Upload a file or drag and drop here</span>
        <input type="file" name={name} data-ui={name} accept=".pdf,.doc,.docx,.odt,.rtf" style={{ display: 'none' }} onChange={(e) => set([...(e.target.files ?? [])].map((f) => f.name))} />
      </div>
      {files.length > 0 && <p data-ui={`${name}-file`}>{files.join(', ')}</p>}
    </div>
  );
}

function Consent() {
  const [checked, set] = useField('gdpr', false);
  return (
    <label className="styles__Consent-sc-1u1n6t1-0">
      <input type="checkbox" name="gdpr" data-ui="gdpr" checked={checked} onChange={(e) => set(e.target.checked)} /> I agree to Northwind Freight’s privacy notice and the processing of my data.
    </label>
  );
}

function App() {
  return (
    <main className="styles__Main-sc-1e1d4kd-0">
      <h1 data-ui="job-title">Junior Backend Developer</h1>
      <p>Northwind Freight · Vancouver, British Columbia, Canada</p>
      <form
        data-ui="application-form"
        onSubmit={(e) => {
          e.preventDefault();
          window.__submitted = true;
        }}
      >
        <h2>Personal information</h2>
        <Text name="firstname" label="First name" required />
        <Text name="lastname" label="Last name" required />
        <Text name="email" label="Email" type="email" required />
        <Text name="headline" label="Headline" />
        <Text name="phone" label="Phone" type="tel" />
        <Text name="address" label="Address" />
        <h2>Profile</h2>
        <section data-ui="education">
          <h3>Education</h3>
          <button type="button" data-ui="add-education">+ Add</button>
        </section>
        <section data-ui="experience">
          <h3>Experience</h3>
          <button type="button" data-ui="add-experience">+ Add</button>
        </section>
        <Text name="summary" label="Summary" textarea />
        <Upload name="resume" label="Resume" required />
        <h2>Details</h2>
        <Text name="cover_letter" label="Cover letter" textarea />
        <h2>Questions</h2>
        <YesNo name="QA_1001" label="Are you legally entitled to work in Canada?" required />
        <YesNo name="QA_1002" label="Will you now or in the future require sponsorship to work in Canada?" required />
        <Dropdown name="QA_1003" label="How many years of professional experience do you have with Node.js?" options={['Less than 1', '1-2', '3-5', '5+']} required />
        <Text name="QA_1004" label="What is your expected salary (CAD)?" />
        <Text name="QA_1005" label="When can you start?" type="date" />
        <Checkboxes name="QA_1006" label="Which of these databases have you used?" options={['MongoDB', 'MySQL', 'PostgreSQL']} />
        <Upload name="QA_1007" label="Portfolio (optional)" />
        <Consent />
        <button type="submit" data-ui="apply-button">
          Submit application
        </button>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
