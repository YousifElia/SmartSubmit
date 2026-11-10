/** Small shared component kit for the dashboard and popup. */
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ───────────────────────────── Button ─────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:outline-brand-600 disabled:bg-brand-300',
  secondary:
    'bg-white text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-brand-600 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-ink focus-visible:outline-brand-600 disabled:text-slate-300',
  danger:
    'bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 focus-visible:outline-red-600 disabled:text-red-300',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  busy?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed',
        size === 'sm' ? 'px-2.5 py-1.5 text-[13px]' : 'px-3.5 py-2 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ───────────────────────────── Fields ─────────────────────────────

const INPUT =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink shadow-sm outline-none ring-1 ring-inset ring-slate-300 ' +
  'placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-500';

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  wrapClassName?: string;
}

export function TextField({ label, hint, error, value, onChange, wrapClassName, className, id, ...rest }: TextFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId} className={wrapClassName}>
      <input
        id={fieldId}
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(INPUT, error && 'ring-red-400', className)}
      />
    </Field>
  );
}

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  label?: string;
  hint?: ReactNode;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  wrapClassName?: string;
}

export function TextArea({ label, hint, error, value, onChange, wrapClassName, className, id, ...rest }: TextAreaProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId} className={wrapClassName}>
      <textarea
        id={fieldId}
        rows={4}
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(INPUT, 'leading-relaxed', className)}
      />
    </Field>
  );
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label?: string;
  hint?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  /** Label for the empty choice. Pass null to omit it. */
  placeholder?: string | null;
  wrapClassName?: string;
}

export function SelectField({
  label,
  hint,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  wrapClassName,
  className,
  id,
  ...rest
}: SelectFieldProps) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} hint={hint} htmlFor={fieldId} className={wrapClassName}>
      <select
        id={fieldId}
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(INPUT, 'pr-8', !value && 'text-slate-400', className)}
      >
        {placeholder !== null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-ink">
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Three-way choice rendered as a segmented control. */
export function Segmented<V extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  className,
}: {
  label?: string;
  hint?: ReactNode;
  value: V | '';
  onChange: (value: V | '') => void;
  options: readonly { value: V; label: string }[];
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      <div className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              // Clicking the active choice clears it.
              onClick={() => onChange(active ? '' : o.value)}
              className={cx(
                'rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                active ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:text-ink',
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-6 py-1">
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 accent-brand-600"
      />
      {label}
    </label>
  );
}

// ───────────────────────────── Layout ─────────────────────────────

export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70', className)}>
      {(title || actions) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'sky';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-700',
  sky: 'bg-sky-50 text-sky-700',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', TONES[tone])}>
      {children}
    </span>
  );
}

export function Notice({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cx('rounded-xl px-4 py-3 text-[13px] leading-relaxed', TONES[tone])}>{children}</div>;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children && <div className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-slate-500">{children}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx(
          'ss-fade-in relative flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-xl outline-none',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

export function Grid({ cols = 2, children }: { cols?: 2 | 3; children: ReactNode }) {
  return <div className={cx('grid gap-4', cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>{children}</div>;
}
