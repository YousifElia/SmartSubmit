/**
 * Colour-coding fields on the page. The styles live in the page itself (the
 * fields are the page's own elements), kept to an outline so nothing shifts.
 */
import type { FormField } from '@/core/autofill/fields';
import type { FillStatus } from '@/core/autofill/model';

const STYLE_ID = 'smartsubmit-highlight-style';
const ATTR = 'data-smartsubmit-state';

const CSS = `
[${ATTR}] { outline-offset: 2px !important; border-radius: 6px; }
[${ATTR}="filled"] { outline: 2px solid rgba(16, 185, 129, .75) !important; }
[${ATTR}="review"] { outline: 2px solid rgba(245, 158, 11, .9) !important; }
[${ATTR}="needs"] { outline: 2px dashed rgba(14, 165, 233, .85) !important; }
@keyframes smartsubmit-flash {
  0%, 100% { box-shadow: 0 0 0 0 rgba(95, 58, 233, 0); }
  30% { box-shadow: 0 0 0 6px rgba(95, 58, 233, .35); }
}
[data-smartsubmit-flash] { animation: smartsubmit-flash 900ms ease-out 1; }
`;

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head ?? doc.documentElement).appendChild(style);
}

function stateFor(status: FillStatus): string | null {
  if (status === 'filled') return 'filled';
  if (status === 'review') return 'review';
  if (status === 'unknown' || status === 'failed') return 'needs';
  return null;
}

export function highlight(field: FormField, status: FillStatus): void {
  ensureStyle(field.anchor.ownerDocument);
  const state = stateFor(status);
  if (state) field.anchor.setAttribute(ATTR, state);
  else field.anchor.removeAttribute(ATTR);
}

export function clearHighlights(doc: Document): void {
  doc.querySelectorAll(`[${ATTR}]`).forEach((el) => el.removeAttribute(ATTR));
}

/** Scroll a field into view and pulse it so the eye finds it. */
export function reveal(field: FormField): void {
  ensureStyle(field.anchor.ownerDocument);
  field.anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  field.anchor.setAttribute('data-smartsubmit-flash', '');
  setTimeout(() => field.anchor.removeAttribute('data-smartsubmit-flash'), 1000);
  const focusable = field.kind === 'text' || field.kind === 'select' || field.kind === 'combobox' ? field.el : field.optionEls[0];
  setTimeout(() => focusable?.focus({ preventScroll: true }), 350);
}
