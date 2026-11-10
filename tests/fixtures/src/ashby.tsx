/**
 * Replica of an Ashby application (jobs.ashbyhq.com/<company>/<id>/application).
 * Mirrors the stable `ashby-application-form-*` classes, the hashed-looking
 * module classes beside them, and the behaviour of Ashby's own controls:
 * Yes/No buttons backed by a hidden checkbox, and a search-as-you-type
 * location box. The content is invented.
 */
import { useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    __state: Record<string, unknown>;
    __submitted: boolean;
  }
}
window.__state = {};
window.__submitted = false;

function useField<T>(id: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  return [
    value,
    (next: T) => {
      window.__state[id] = next;
      setValue(next);
    },
  ] as const;
}

function Entry({ path, label, required, htmlFor, children }: { path: string; label: string; required?: boolean; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="_fieldEntry_1e3gg_28 ashby-application-form-field-entry" data-field-path={path}>
      <label className={`_heading_f7cvd_52 ${required ? '_required_f7cvd_91' : ''} _label_1e3gg_42 ashby-application-form-question-title`} htmlFor={htmlFor ?? path}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Text({ id, label, required, type = 'text', placeholder = 'Type here...' }: { id: string; label: string; required?: boolean; type?: string; placeholder?: string }) {
  const [value, set] = useField(id, '');
  return (
    <Entry path={id} label={label} required={required}>
      <input className="_input_80epu_28 _input_1e3gg_32 ashby-application-form-input-text" id={id} name={id} type={type} placeholder={placeholder} required={required} value={value} onChange={(e) => set(e.target.value)} />
    </Entry>
  );
}

function LongText({ id, label, required }: { id: string; label: string; required?: boolean }) {
  const [value, set] = useField(id, '');
  return (
    <Entry path={id} label={label} required={required}>
      <textarea className="_input_zf0lr_28 _input_1e3gg_32 ashby-application-form-input-textarea" id={id} name={id} placeholder="Type here..." required={required} value={value} onChange={(e) => set(e.target.value)} />
    </Entry>
  );
}

function YesNo({ id, label, required }: { id: string; label: string; required?: boolean }) {
  const [value, set] = useField<'' | 'yes' | 'no'>(id, '');
  return (
    <Entry path={id} label={label} required={required}>
      <div className="_container_1svni_28 _yesno_1e3gg_148 ashby-application-form-input-yesno">
        {(['yes', 'no'] as const).map((option) => (
          <button key={option} type="button" className="_container_pjyt6_1 _option_1svni_32 ashby-application-form-input-yesno-option" aria-pressed={value === option} data-option={option} onClick={() => set(option)}>
            {option === 'yes' ? 'Yes' : 'No'}
          </button>
        ))}
        <input type="checkbox" className="_input_1svni_78" tabIndex={-1} name={id} checked={value === 'yes'} readOnly style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} />
      </div>
    </Entry>
  );
}

const PLACES = ['Windsor, Ontario, Canada', 'Windsor, England, United Kingdom', 'Windsor, Connecticut, United States', 'Toronto, Ontario, Canada'];

function Location() {
  const [value, set] = useField('_systemfield_location', '');
  const [text, setText] = useState('');
  const [results, setResults] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const open = results !== null;
  return (
    <Entry path="_systemfield_location" label="Where do you plan on working from (for payroll tax purposes)?" required htmlFor="_systemfield_location">
      <div className="_inputContainer_d7ago_28" style={{ position: 'relative' }}>
        <input
          className="_input_d7ago_28 ashby-application-form-input-autocomplete"
          placeholder="Start typing..."
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? 'location-results' : undefined}
          role="combobox"
          value={text}
          onChange={(e) => {
            const q = e.target.value;
            setText(q);
            if (value) set('');
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setResults(q.trim().length < 2 ? null : PLACES.filter((p) => p.toLowerCase().includes(q.trim().toLowerCase()))), 300);
          }}
          onKeyDown={(e) => e.key === 'Escape' && setResults(null)}
        />
        {open && (
          <div id="location-results" role="listbox" className="_resultContainer_d7ago_70" style={{ position: 'absolute', zIndex: 5, background: '#fff', border: '1px solid #ccc', width: '100%' }}>
            {results.length === 0 ? (
              <div className="_noResults_d7ago_90">No results</div>
            ) : (
              results.map((place) => (
                <div
                  key={place}
                  role="option"
                  aria-selected={false}
                  className="_result_d7ago_82"
                  style={{ padding: '6px 10px', cursor: 'pointer' }}
                  onClick={() => {
                    set(place);
                    setText(place);
                    setResults(null);
                  }}
                >
                  {place}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Entry>
  );
}

function File({ id, label, required }: { id: string; label: string; required?: boolean }) {
  const [name, set] = useField(id, '');
  return (
    <Entry path={id} label={label} required={required}>
      <div role="presentation" className="_container_10xk4_70 ashby-application-form-input-file">
        <input
          accept="application/pdf,.pdf,application/msword,.doc,.docx,text/plain,.txt"
          type="file"
          tabIndex={-1}
          id={id}
          required={required}
          style={{ border: 0, clip: 'rect(0px, 0px, 0px, 0px)', clipPath: 'inset(50%)', height: 1, margin: '0 -1px -1px 0', overflow: 'hidden', padding: 0, position: 'absolute', width: 1, whiteSpace: 'nowrap' }}
          onChange={(e) => set(e.target.files?.[0]?.name ?? '')}
        />
        <div className="_instructions_10xk4_33 ashby-application-form-input-file-dropzone">
          <button type="button" className="_button_zyh3g_28 ashby-application-form-input-file-dropzone-upload" onClick={() => document.getElementById(id)?.click()}>
            Upload File
          </button>
          <span>{name || 'or drag and drop here'}</span>
        </div>
      </div>
    </Entry>
  );
}

function Choice({ id, label, options, multiple }: { id: string; label: string; options: string[]; multiple?: boolean }) {
  const [value, set] = useField<string[]>(id, []);
  return (
    <Entry path={id} label={label} htmlFor={`${id}-0`}>
      <fieldset className="_container_y2cw4_28" style={{ border: 0, padding: 0, margin: 0 }}>
        {options.map((option, i) => (
          <div key={option} className="_option_y2cw4_32">
            <label className="_label_1rwuy_6" htmlFor={`${id}-${i}`}>
              <input
                id={`${id}-${i}`}
                className={multiple ? '_input_1v5e2_28' : '_radio_1rwuy_12'}
                type={multiple ? 'checkbox' : 'radio'}
                name={id}
                value={option}
                checked={value.includes(option)}
                onChange={(e) => set(multiple ? (e.target.checked ? [...value, option] : value.filter((v) => v !== option)) : [option])}
              />
              <span>{option}</span>
            </label>
          </div>
        ))}
      </fieldset>
    </Entry>
  );
}

function App() {
  return (
    <div className="_container_101oc_29 ashby-application-form-container">
      <h1 className="ashby-job-posting-heading">Software Developer Intern</h1>
      <div className="ashby-application-form-autofill-pane">
        <div className="_root_xd2v0_1 ashby-application-form-autofill-input-root">
          <p>Autofill from resume</p>
          <input type="file" id="autofill-trap" onChange={() => (window.__state.autofillTrap = true)} />
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          window.__submitted = true;
        }}
      >
        <div className="_section_101oc_37 ashby-application-form-section-container">
          <Text id="_systemfield_name" label="Legal Name" required />
          <Text id="_systemfield_email" label="Email" required type="email" placeholder="hello@example.com..." />
          <Text id="4b71793a-c95c-4cc9-9d06-02e6ef7c5777" label="Phone" required type="tel" placeholder="1-415-555-1234..." />
          <Location />
          <File id="_systemfield_resume" label="Resume" required />
          <Text id="dc915b3a-c535-49df-abd6-dc8f3ddf6728" label="LinkedIn Profile" />
          <Text id="a1a1a1a1-0000-4000-8000-000000000001" label="GitHub" />
          <File id="6686ff1d-a7f9-484b-af56-4c32ff8cd99f" label="Cover Letter" />
          <YesNo id="3080cfba-13cc-4441-94b9-159da1278e66" label="Are you legally authorized to work in Canada?" required />
          <YesNo id="66d3b6e2-6cef-4cf8-9193-87200193ab98" label="Will you require sponsorship to work in Canada?" required />
          <YesNo id="77e4c7f3-7df0-5d09-a2a4-98311204bc09" label="Have you completed at least two years of your degree?" required />
          <Choice id="b2b2b2b2-0000-4000-8000-000000000002" label="Which work arrangement do you prefer?" options={['Remote', 'Hybrid', 'On-site']} />
          <Choice id="c3c3c3c3-0000-4000-8000-000000000003" label="Which languages have you used professionally?" options={['Python', 'TypeScript', 'Go', 'Rust']} multiple />
          <LongText id="0086e069-bc0c-467b-8d38-c3f023146e79" label="Tell us about a project you are proud of" required />
          <Text id="3e666775-f7f9-4eab-bbdb-1a3bb13bc8a4" label="Expected graduation date" />
        </div>
        <div className="ashby-application-form-submit">
          <button type="submit" className="_button_zyh3g_28 ashby-application-form-submit-button">
            Submit Application
          </button>
        </div>
      </form>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
