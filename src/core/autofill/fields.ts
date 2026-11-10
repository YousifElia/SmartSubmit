/**
 * Field discovery: turning a page's controls into a list of questions.
 *
 * A "field" is one question, however it is rendered: a text box, a dropdown,
 * a whole radio group, a custom combobox. Each carries its label, options and
 * the elements needed to answer it.
 */
import type { ControlKind, FieldInfo, FieldKey } from './model';
import { cleanLabel } from './text';

/** Custom widgets that need their own way of being driven. */
export type Widget = '' | 'react-select' | 'aria-combobox' | 'intl-tel' | 'lever-location';

export interface FormField extends FieldInfo {
  /** Stable for the lifetime of the page. */
  uid: string;
  /** The main control. */
  el: HTMLElement;
  /** The element to scroll to and outline: the control, or its visible wrapper. */
  anchor: HTMLElement;
  /** One element per entry in `options`, for radio groups, checkbox groups and button groups. */
  optionEls: HTMLElement[];
  widget: Widget;
  /** Which repeated entry this belongs to (second education block → 1). */
  group: number;
  /** A profile field assigned directly by the site adapter, bypassing the classifier. */
  adapterKey: FieldKey | null;
}

/** Site-specific knowledge layered over the generic scan. */
export interface DiscoveryHooks {
  /** A better label for a control than the generic search finds. Return '' to fall through. */
  labelFor?: (el: HTMLElement) => string;
  /** Controls the generic scan must ignore. */
  ignore?: (el: HTMLElement) => boolean;
  /** Fields only this site has (custom toggles and so on), with the elements they cover. */
  extra?: (root: ParentNode) => { fields: Partial<FormField>[]; claimed: Element[] };
  /** Adjust a discovered field: assign a profile key, a widget, a group. */
  refine?: (field: FormField) => void;
}

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'date', 'month', 'week', 'time', 'datetime-local', '']);
const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search', 'range', 'color']);

let uidCounter = 0;
const UID_ATTR = 'data-smartsubmit-id';

function uidFor(el: HTMLElement): string {
  let uid = el.getAttribute(UID_ATTR);
  if (!uid) {
    uid = `ss${++uidCounter}`;
    el.setAttribute(UID_ATTR, uid);
  }
  return uid;
}

/** All matching elements under a root, descending into open shadow roots. */
export function deepQueryAll<T extends Element>(root: ParentNode, selector: string): T[] {
  const out: T[] = [...root.querySelectorAll<T>(selector)];
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const shadow = (node as Element).shadowRoot;
    if (shadow) out.push(...deepQueryAll<T>(shadow, selector));
  }
  return out;
}

function text(node: Node | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Rendered and able to hold a user's answer. Hidden file inputs count, since they sit behind upload buttons. */
function isUsable(el: HTMLElement): boolean {
  if ((el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el instanceof HTMLInputElement && el.type === 'file') return true;
  if (el.getClientRects().length === 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** Radios and checkboxes are often visually replaced; they count if their label is visible. */
function isUsableChoice(el: HTMLInputElement): boolean {
  if (el.disabled) return false;
  if (el.getClientRects().length > 0) return true;
  const label = el.closest('label') ?? (el.id ? el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
  return !!label && label.getClientRects().length > 0;
}

function byId(el: Element, id: string): Element | null {
  const root = el.getRootNode() as Document | ShadowRoot;
  return root.getElementById?.(id) ?? el.ownerDocument.getElementById(id);
}

/** Text of a label element, without the text of any control nested inside it. */
function labelText(label: Element): string {
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll('input, select, textarea, button, script, style, [role="listbox"], [aria-hidden="true"]').forEach((n) => n.remove());
  return text(clone);
}

function labelledBy(el: Element): string {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => text(byId(el, id)))
    .filter(Boolean)
    .join(' ');
}

function labelForControl(el: HTMLElement): string {
  if (el.id) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const label = root.querySelector?.(`label[for="${CSS.escape(el.id)}"]`);
    if (label) {
      const t = labelText(label);
      if (t) return t;
    }
  }
  return '';
}

/**
 * The text that sits between the previous control and this one: on a form
 * with no proper labels, that is the question. Looks no further than a few
 * ancestors up, and keeps only the closest block of text.
 */
function precedingText(el: HTMLElement, previous: HTMLElement | null): string {
  let container: HTMLElement | null = el.parentElement;
  for (let depth = 0; container && depth < 5; depth++, container = container.parentElement) {
    const chunks: string[] = [];
    const walker = el.ownerDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const position = el.compareDocumentPosition(node);
      // Stop at the control itself and anything after it.
      if (!(position & Node.DOCUMENT_POSITION_PRECEDING)) break;
      // Ignore anything at or before the previous control.
      if (previous && !(previous.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (previous?.contains(node)) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest('script, style, option, select, [aria-hidden="true"]')) continue;
      const t = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (t) chunks.push(t);
    }
    // Drop trailing fragments that are only punctuation or required markers.
    while (chunks.length > 0 && !/[a-z0-9]/i.test(chunks[chunks.length - 1]!)) chunks.pop();
    if (chunks.length > 0) {
      const last = chunks[chunks.length - 1]!;
      // A lone required marker was already dropped; a very short tail likely continues the chunk before it.
      return last.length < 3 && chunks.length > 1 ? `${chunks[chunks.length - 2]} ${last}` : last;
    }
    // If this ancestor already holds the previous control, climbing higher will not help.
    if (previous && container.contains(previous)) break;
  }
  return '';
}

/** Button captions that say nothing about which file is wanted. */
const UPLOAD_CAPTION = /^(attach|upload|browse|choose|select|add)( a| the| your)?( file| files| document)?$/i;

/** The question a file input belongs to, when its own label is only a button caption. */
function fileLabel(el: HTMLElement, previous: HTMLElement | null): string {
  const group = el.closest('[role="group"][aria-labelledby], [role="group"][aria-label]');
  if (group) {
    const named = labelledBy(group) || group.getAttribute('aria-label') || '';
    if (named) return named;
  }
  // Otherwise the text before the whole upload control.
  let wrapper: HTMLElement = el;
  for (let depth = 0; depth < 4 && wrapper.parentElement; depth++) {
    wrapper = wrapper.parentElement;
    const before = precedingText(wrapper, previous);
    if (before && !UPLOAD_CAPTION.test(cleanLabel(before))) return before;
  }
  return '';
}

function questionLabel(el: HTMLElement, previous: HTMLElement | null, hooks: DiscoveryHooks): string {
  const candidates = [
    () => hooks.labelFor?.(el) ?? '',
    () => labelledBy(el),
    () => labelForControl(el),
    () => {
      const wrap = el.closest('label');
      return wrap ? labelText(wrap) : '';
    },
    () => el.getAttribute('aria-label') ?? '',
    () => precedingText(el, previous),
    () => (el as HTMLInputElement).placeholder ?? '',
    () => el.getAttribute('title') ?? '',
  ];
  const isFile = el instanceof HTMLInputElement && el.type === 'file';
  for (const candidate of candidates) {
    const value = cleanLabel(candidate());
    if (!value) continue;
    if (isFile && UPLOAD_CAPTION.test(value)) {
      const better = cleanLabel(fileLabel(el, previous));
      if (better) return better.slice(0, 400);
    }
    return value.slice(0, 400);
  }
  return '';
}

/** The label of one option in a radio or checkbox group. */
function optionLabel(el: HTMLInputElement): string {
  const own = labelForControl(el);
  if (own) return cleanLabel(own);
  const wrap = el.closest('label');
  if (wrap) {
    const t = labelText(wrap);
    if (t) return cleanLabel(t);
  }
  const aria = el.getAttribute('aria-label') ?? labelledBy(el);
  if (aria) return cleanLabel(aria);
  // Text right after the control: `<input type=radio> Yes`.
  let sibling = el.nextSibling;
  while (sibling) {
    const t = text(sibling);
    if (t) return cleanLabel(t);
    sibling = sibling.nextSibling;
  }
  return cleanLabel(el.value);
}

/** The question a group of radios or checkboxes belongs to. */
function groupLabel(controls: HTMLInputElement[], previous: HTMLElement | null, hooks: DiscoveryHooks): string {
  const first = controls[0]!;
  const hooked = hooks.labelFor?.(first);
  if (hooked) return cleanLabel(hooked);

  const fieldset = first.closest('fieldset');
  if (fieldset && controls.every((c) => fieldset.contains(c))) {
    const legend = fieldset.querySelector('legend');
    if (legend && text(legend)) return cleanLabel(text(legend));
  }
  const group = first.closest('[role="radiogroup"], [role="group"]');
  if (group && controls.every((c) => group.contains(c))) {
    const t = labelledBy(group) || group.getAttribute('aria-label') || '';
    if (t) return cleanLabel(t);
  }
  // Otherwise: the text just before the first option.
  const firstOption = (first.closest('label') as HTMLElement | null) ?? first;
  return cleanLabel(precedingText(firstOption, previous));
}

function headingsOf(root: ParentNode): HTMLElement[] {
  return deepQueryAll<HTMLElement>(root, 'h1, h2, h3, h4, h5, h6, legend, [role="heading"]').filter(
    (h) => text(h).length > 0 && text(h).length < 120,
  );
}

function sectionFor(el: HTMLElement, headings: HTMLElement[]): string {
  let found = '';
  for (const heading of headings) {
    if (heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) found = text(heading);
    else break;
  }
  return found;
}

function groupIndex(name: string, id: string): number {
  const match = /(?:--|_|-|\[)(\d{1,2})\]?$/.exec(id) ?? /\[(\d{1,2})\]/.exec(name) ?? /(?:--|_|-)(\d{1,2})$/.exec(name);
  return match ? Number(match[1]) : 0;
}

function baseInfo(el: HTMLElement): Pick<FieldInfo, 'name' | 'id' | 'autocomplete' | 'placeholder' | 'required' | 'maxLength' | 'accept'> {
  const input = el as HTMLInputElement;
  return {
    name: el.getAttribute('name') ?? '',
    id: el.id ?? '',
    autocomplete: el.getAttribute('autocomplete') ?? '',
    placeholder: input.placeholder ?? '',
    required: input.required === true || el.getAttribute('aria-required') === 'true',
    maxLength: typeof input.maxLength === 'number' && input.maxLength > 0 ? input.maxLength : null,
    accept: el.getAttribute('accept') ?? '',
  };
}

function isCaptchaOrTrap(el: HTMLElement): boolean {
  const marker = `${el.getAttribute('name') ?? ''} ${el.id} ${typeof el.className === 'string' ? el.className : ''}`.toLowerCase();
  return /captcha|honeypot|hp-field|_gotcha/.test(marker);
}

/**
 * Find every question under `root`.
 *
 * The result is in page order. Radio and checkbox inputs that share a name
 * are merged into one field.
 */
export function discoverFields(root: ParentNode, hooks: DiscoveryHooks = {}): FormField[] {
  const headings = headingsOf(root);
  const extra = hooks.extra?.(root) ?? { fields: [], claimed: [] };
  const claimed = new Set<Element>(extra.claimed);

  const controls = deepQueryAll<HTMLElement>(root, 'input, textarea, select, [role="combobox"]').filter((el) => {
    if (claimed.has(el) || [...claimed].some((c) => c.contains(el))) return false;
    if (hooks.ignore?.(el)) return false;
    if (isCaptchaOrTrap(el)) return false;
    if (el instanceof HTMLInputElement) {
      if (SKIP_INPUT_TYPES.has(el.type)) return false;
      if (el.type === 'radio' || el.type === 'checkbox') return isUsableChoice(el);
      if (el.readOnly && el.getAttribute('role') !== 'combobox') return false;
    }
    // A combobox role on a non-input wrapper is handled through its inner input.
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      if (el.querySelector('input')) return false;
    }
    return isUsable(el);
  });

  interface Draft {
    order: HTMLElement;
    build: (previous: HTMLElement | null) => FormField | null;
  }
  const drafts: Draft[] = [];
  const grouped = new Set<HTMLElement>();

  for (const el of controls) {
    if (grouped.has(el)) continue;

    if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox')) {
      const type = el.type;
      const scope = (el.form ?? root) as ParentNode;
      const mates = el.name
        ? controls.filter(
            (c): c is HTMLInputElement =>
              c instanceof HTMLInputElement && c.type === type && c.name === el.name && (c.form ?? root) === scope,
          )
        : [el];
      mates.forEach((m) => grouped.add(m));

      if (type === 'checkbox' && mates.length === 1) {
        drafts.push({
          order: el,
          build: (previous) => {
            const own = optionLabel(el);
            return make(el, 'checkbox', hooks.labelFor?.(el) || own || questionLabel(el, previous, hooks), {
              options: [],
              optionEls: [el],
              anchor: (el.closest('label') as HTMLElement | null) ?? el.parentElement ?? el,
              inputType: 'checkbox',
            });
          },
        });
        continue;
      }

      drafts.push({
        order: el,
        build: (previous) =>
          make(el, type === 'radio' ? 'radio' : 'checkboxes', groupLabel(mates, previous, hooks), {
            options: mates.map(optionLabel),
            optionEls: mates,
            multiple: type === 'checkbox',
            anchor: commonAncestor(mates) ?? el,
            inputType: type,
            required: mates.some((m) => m.required),
          }),
      });
      continue;
    }

    if (el instanceof HTMLSelectElement) {
      drafts.push({
        order: el,
        build: (previous) =>
          make(el, 'select', questionLabel(el, previous, hooks), {
            options: [...el.options].map((o) => text(o)),
            multiple: el.multiple,
            inputType: 'select',
          }),
      });
      continue;
    }

    if (el instanceof HTMLInputElement && el.type === 'file') {
      drafts.push({
        order: el,
        build: (previous) =>
          make(el, 'file', questionLabel(el, previous, hooks), {
            inputType: 'file',
            multiple: el.multiple,
            anchor: visibleAncestor(el),
          }),
      });
      continue;
    }

    const isCombo = el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list';
    if (isCombo) {
      drafts.push({
        order: el,
        build: (previous) =>
          make(el, 'combobox', questionLabel(el, previous, hooks), {
            inputType: 'combobox',
            widget: el.closest('[class*="select__control"], [class*="-control"]') ? 'react-select' : 'aria-combobox',
            multiple: el.getAttribute('aria-multiselectable') === 'true',
            anchor: (el.closest('[class*="select__control"], [class*="-control"]') as HTMLElement | null) ?? el,
          }),
      });
      continue;
    }

    if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(el.type))) {
      drafts.push({
        order: el,
        build: (previous) =>
          make(el, 'text', questionLabel(el, previous, hooks), {
            inputType: el instanceof HTMLTextAreaElement ? 'textarea' : el.type || 'text',
            widget: el.classList.contains('iti__tel-input') || el.hasAttribute('data-intl-tel-input-id') ? 'intl-tel' : '',
          }),
      });
    }
  }

  function make(el: HTMLElement, kind: ControlKind, label: string, over: Partial<FormField>): FormField {
    const info = baseInfo(el);
    const field: FormField = {
      uid: uidFor(el),
      kind,
      label,
      description: '',
      ...info,
      inputType: 'text',
      options: [],
      section: sectionFor(el, headings),
      multiple: false,
      el,
      anchor: el,
      optionEls: [],
      widget: '',
      group: groupIndex(info.name, info.id),
      adapterKey: null,
      ...over,
    };
    return field;
  }

  const fields: FormField[] = [];
  let previous: HTMLElement | null = null;
  for (const draft of drafts) {
    const field = draft.build(previous);
    if (field) {
      hooks.refine?.(field);
      fields.push(field);
    }
    previous = draft.order;
  }

  // Site-specific fields, completed with defaults and merged in page order.
  for (const partial of extra.fields) {
    if (!partial.el) continue;
    const field = make(partial.el, partial.kind ?? 'buttons', partial.label ?? '', partial);
    hooks.refine?.(field);
    fields.push(field);
  }
  fields.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return fields;
}

function commonAncestor(elements: HTMLElement[]): HTMLElement | null {
  let node: HTMLElement | null = elements[0]?.parentElement ?? null;
  while (node && !elements.every((e) => node!.contains(e))) node = node.parentElement;
  return node;
}

/** The nearest ancestor that is actually drawn, for outlining a hidden control. */
function visibleAncestor(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el;
  while (node && node.getClientRects().length === 0) node = node.parentElement;
  // A 1px clipped input reports a rect; step out to its wrapper.
  if (node === el && (el.offsetWidth <= 2 || el.offsetHeight <= 2) && el.parentElement) return el.parentElement;
  return node ?? el;
}
