/**
 * Entering answers into a page.
 *
 * Forms built with React, Vue or Angular keep their own copy of every value,
 * so setting `input.value` alone is ignored. Everything here goes through the
 * element's native setter and fires the same events a person's typing or
 * clicking would, so the page's own code sees the change.
 */
import { deepQueryAll, type FormField } from './fields';
import { isPlaceholderOption, matchOption, type OptionMatch } from './options';
import { norm } from './text';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Poll until `read` returns something truthy or time runs out. */
export async function waitFor<T>(read: () => T | null | undefined | false, timeoutMs: number, stepMs = 40): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() >= deadline) return null;
    await sleep(stepMs);
  }
}

function nativeSetter(el: HTMLElement): ((value: string) => void) | null {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  return setter ? (value) => setter.call(el, value) : null;
}

/** Set a value so that framework-controlled inputs register it. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const set = nativeSetter(el);
  if (set) set(value);
  else el.value = value;
}

// A person's typing raises an `input` event that crosses shadow-root
// boundaries (it is "composed"); `change` does not. Pages built from web
// components can listen for either, so these events do the same.
function fire(el: Element, type: string, init: EventInit = {}): void {
  el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, composed: type === 'input', ...init }));
}

function fireInput(el: Element, data: string): void {
  let event: Event;
  try {
    event = new InputEvent('input', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data });
  } catch {
    event = new Event('input', { bubbles: true, cancelable: true, composed: true });
  }
  el.dispatchEvent(event);
}

function mouse(el: Element, type: string): void {
  const view = el.ownerDocument.defaultView ?? undefined;
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, button: 0, view }));
}

/** The sequence a real click produces. Custom dropdowns listen to different parts of it. */
export function clickLikeAUser(el: HTMLElement): void {
  mouse(el, 'mouseover');
  mouse(el, 'mousemove');
  mouse(el, 'mousedown');
  mouse(el, 'mouseup');
  mouse(el, 'click');
}

// ───────────────────────────── Text ─────────────────────────────

export function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  const max = el.maxLength > 0 ? el.maxLength : Infinity;
  const text = value.length > max ? value.slice(0, max) : value;
  el.focus({ preventScroll: true });
  setNativeValue(el, text);
  fireInput(el, text);
  fire(el, 'change');
  el.blur();
  // Pages often reformat what was typed (phone widgets drop the dial code,
  // inputs trim or mask). Any non-empty result means the value was taken.
  return el.value.trim() !== '';
}

// ───────────────────────────── Native choices ─────────────────────────────

export function fillSelect(el: HTMLSelectElement, index: number): boolean {
  const option = el.options[index];
  if (!option) return false;
  el.focus({ preventScroll: true });
  setNativeValue(el, option.value);
  // Selects whose options share a value need the index set as well.
  if (el.selectedIndex !== index) el.selectedIndex = index;
  fire(el, 'input');
  fire(el, 'change');
  el.blur();
  return el.selectedIndex === index;
}

/** Choose one radio. Clicking is what makes framework handlers run. */
export function fillRadio(option: HTMLInputElement): boolean {
  if (!option.checked) option.click();
  return option.checked;
}

export function fillCheckbox(el: HTMLInputElement, checked: boolean): boolean {
  if (el.checked !== checked) el.click();
  return el.checked === checked;
}

/** Make a checkbox group match exactly the wanted set. */
export async function fillCheckboxes(options: HTMLInputElement[], wanted: number[]): Promise<boolean> {
  const want = new Set(wanted);
  for (const [i, el] of options.entries()) {
    if (el.checked === want.has(i)) continue;
    fillCheckbox(el, want.has(i));
    // Let the page re-render between ticks: a list kept in a script's state
    // can otherwise lose all but the last one.
    await sleep(30);
  }
  return options.every((el, i) => el.checked === want.has(i));
}

/** Toggle buttons (for example Yes / No rendered as two buttons). */
export async function fillButtons(options: HTMLElement[], index: number): Promise<boolean> {
  const button = options[index];
  if (!button) return false;
  const pressed = () => button.getAttribute('aria-pressed') === 'true' || button.getAttribute('aria-checked') === 'true';
  if (!pressed()) button.click();
  await sleep(30);
  // Not every toggle exposes its state; a click with no way to check counts as done.
  return pressed() || (!button.hasAttribute('aria-pressed') && !button.hasAttribute('aria-checked'));
}

// ───────────────────────────── Custom dropdowns ─────────────────────────────

interface OptionEl {
  el: HTMLElement;
  text: string;
}

function isShown(el: Element): boolean {
  return el.getClientRects().length > 0;
}

/**
 * The lists a combobox is currently showing. Deliberately narrow: only a list
 * the control points at, or one inside its own widget. Anything broader risks
 * mistaking a site menu for a dropdown and clicking a link in it.
 */
function comboLists(field: FormField): Element[] {
  const input = field.el;
  const doc = input.ownerDocument;

  // The list the input says it controls (react-select and most ARIA widgets do this while open).
  // Inside a web component, look in the component's own tree first.
  const tree = input.getRootNode() as Document | ShadowRoot;
  for (const attr of ['aria-controls', 'aria-owns']) {
    const id = input.getAttribute(attr);
    const el = id ? (tree.getElementById?.(id) ?? doc.getElementById(id)) : null;
    if (el && isShown(el)) return [el];
  }

  if (field.widget === 'react-select') {
    // The menu is rendered next to the control, inside the widget's container.
    const control = input.closest('[class*="select__control"], [class*="-control"]');
    const menu = control?.parentElement?.querySelector('[class*="select__menu"], [class*="-menu"]');
    return menu && isShown(menu) ? [menu] : [];
  }

  if (field.widget === 'lever-location') {
    const results = input.closest('.application-field')?.querySelector('.dropdown-results');
    return results && isShown(results) ? [results] : [];
  }

  // A listbox within the control's own wrapper.
  let node: HTMLElement | null = input.parentElement;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    const inner = node.querySelector('[role="listbox"]');
    if (inner && isShown(inner)) return [inner];
  }
  // A listbox rendered elsewhere on the page, if it is the only one showing.
  const shown = deepQueryAll(doc, '[role="listbox"]').filter(isShown);
  return shown.length === 1 ? [shown[0]!] : [];
}

/** The option elements currently offered by a combobox. */
function comboOptions(field: FormField): OptionEl[] {
  const out: OptionEl[] = [];
  const seen = new Set<Element>();
  for (const list of comboLists(field)) {
    let found = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
    if (found.length === 0) found = [...list.querySelectorAll<HTMLElement>('[class*="select__option"], [class*="__option"]')];
    // A bare list of rows with no roles: take its direct children.
    if (found.length === 0) found = [...list.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    for (const el of found) {
      if (seen.has(el) || !isShown(el)) continue;
      if (el.getAttribute('aria-disabled') === 'true') continue;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      seen.add(el);
      out.push({ el, text });
    }
  }
  return out;
}

const NO_RESULTS = /^(no (options|results|matches|location)|loading|searching|type to search|start typing)/i;

function realOptions(options: OptionEl[]): OptionEl[] {
  return options.filter((o) => !NO_RESULTS.test(o.text) && !isPlaceholderOption(o.text));
}

function openCombo(field: FormField): void {
  const input = field.el;
  if (field.widget === 'react-select') {
    // react-select opens on a mousedown on its control: it focuses its own
    // input and opens the menu from that focus. Focusing the input first would
    // defeat this, because the widget would see a click on an already-focused
    // control before its own state had caught up.
    const control = input.closest<HTMLElement>('[class*="select__control"], [class*="-control"]') ?? input;
    mouse(control, 'mousedown');
    mouse(control, 'mouseup');
    return;
  }
  input.focus({ preventScroll: true });
  clickLikeAUser(input);
  if (input.getAttribute('aria-expanded') !== 'true') {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true, cancelable: true }));
  }
}

function closeCombo(field: FormField): void {
  const input = field.el;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  input.blur();
}

function typeInto(input: HTMLInputElement, text: string): void {
  input.focus({ preventScroll: true });
  setNativeValue(input, text);
  fireInput(input, text);
}

/** What a combobox currently shows as chosen, or '' if nothing. */
export function comboValue(field: FormField): string {
  const input = field.el as HTMLInputElement;
  if (field.widget === 'listbox-button') {
    // The button shows the choice, or "Select One".
    const shown = (input.textContent ?? '').replace(/\s+/g, ' ').trim();
    return isPlaceholderOption(shown) ? '' : shown;
  }
  if (field.widget === 'workday-prompt') {
    // Choices appear as removable items beside the search box.
    const scope = input.closest('[data-automation-id^="formField-"]') ?? input.parentElement;
    const chosen = scope ? [...scope.querySelectorAll('[data-automation-id="selectedItem"]')] : [];
    return chosen.map((c) => (c.textContent ?? '').replace(/[×✕]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(', ');
  }
  if (field.widget === 'react-select') {
    const shell = input.closest('[class*="select__control"], [class*="-control"]') ?? input.parentElement;
    const multi = shell ? [...shell.querySelectorAll('[class*="multi-value__label"], [class*="multiValue"] > div:first-child')] : [];
    if (multi.length > 0) return multi.map((m) => (m.textContent ?? '').trim()).filter(Boolean).join(', ');
    const single = shell?.querySelector('[class*="single-value"], [class*="singleValue"]');
    return (single?.textContent ?? '').trim();
  }
  return (input.value ?? '').trim();
}

export interface ComboFill {
  forms: string[];
  /** Text to type when the list must be searched. */
  query?: string;
  text: string;
}

/**
 * Choose an option in a custom dropdown or autocomplete. Opens the list, and
 * if the wanted option is not there, types to search for it.
 * Returns the chosen option's text, or null if nothing suitable was offered.
 */
export async function fillCombobox(field: FormField, value: ComboFill): Promise<string | null> {
  const input = field.el as HTMLInputElement;
  const forms = value.forms.length > 0 ? value.forms : [value.text];
  const read = () => {
    const options = realOptions(comboOptions(field));
    return options.length > 0 ? options : null;
  };

  let pick: { option: OptionEl; match: OptionMatch } | null = null;
  const choose = (options: OptionEl[], minScore: number) => {
    const match = matchOption(forms, options.map((o) => o.text), minScore);
    return match ? { option: options[match.index]!, match } : null;
  };

  openCombo(field);
  let options = await waitFor(read, 600);
  if (!options && field.widget === 'react-select') {
    // Already focused from an earlier interaction: a second press opens it.
    openCombo(field);
    options = await waitFor(read, 400);
  }
  // A long static list (countries, schools) is quicker and safer to search than to scan.
  if (options && options.length <= 400) pick = choose(options, 0.7);

  if (!pick && input instanceof HTMLInputElement && !input.readOnly) {
    const queries = [...new Set([value.query ?? '', forms[0] ?? '', value.text].map((q) => q.trim()).filter(Boolean))];
    for (const query of queries.slice(0, 2)) {
      const before = options?.map((o) => o.text).join('|') ?? '';
      const changed = () => {
        const now = read();
        return now && now.map((o) => o.text).join('|') !== before ? now : null;
      };
      typeInto(input, query);
      // Wait for the list to react to the typing (it may load from a server).
      // Workday's prompts search when Enter is pressed.
      if (field.widget === 'workday-prompt') {
        options = await waitFor(changed, 700, 80);
        if (!options) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      }
      options = options ?? (await waitFor(changed, 3000, 80));
      options ??= read();
      if (!options) continue;
      pick = choose(options, 0.7);
      // A search-as-you-type list ranks by relevance: if the top result begins
      // with what was typed, it is the one a person would click.
      if (!pick && value.query && norm(options[0]!.text).startsWith(norm(value.query))) {
        pick = { option: options[0]!, match: { index: 0, score: 0.6 } };
      }
      if (pick) break;
    }
  }

  if (!pick) {
    if (input instanceof HTMLInputElement && !input.readOnly && input.value) {
      setNativeValue(input, '');
      fireInput(input, '');
    }
    closeCombo(field);
    return null;
  }

  clickLikeAUser(pick.option.el);
  await sleep(60);
  // A prompt option can be a category that opens a further list (Workday's
  // "Job Board" → "Indeed"). Choose within it.
  if (field.widget === 'workday-prompt' && !comboValue(field)) {
    const inner = await waitFor(read, 800);
    const deeper = inner ? choose(inner, 0.7) : null;
    if (deeper) {
      clickLikeAUser(deeper.option.el);
      await sleep(60);
      pick = deeper;
    }
    if (!comboValue(field)) {
      closeCombo(field);
      return null;
    }
  }
  // Some lists stay open after a choice; make sure this one is closed.
  if (input.getAttribute('aria-expanded') === 'true') closeCombo(field);
  return pick.option.text;
}

// ───────────────────────────── Files ─────────────────────────────

/** Attach a file to a file input, as if the user had picked it. */
export function attachFile(input: HTMLInputElement, file: File): boolean {
  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
  } catch {
    return false;
  }
  fire(input, 'input');
  fire(input, 'change');
  return input.files?.length === 1 && input.files[0]!.name === file.name;
}

// ───────────────────────────── Reading back ─────────────────────────────

/**
 * The answer currently on the page for a field: text, the chosen option's
 * text, several option texts, or a checkbox state. Null means unanswered.
 */
export function readValue(field: FormField): string | string[] | boolean | null {
  switch (field.kind) {
    case 'text': {
      const value = (field.el as HTMLInputElement).value?.trim() ?? '';
      return value || null;
    }
    case 'select': {
      const el = field.el as HTMLSelectElement;
      if (el.multiple) {
        const chosen = [...el.selectedOptions].map((o) => (o.textContent ?? '').trim()).filter((t) => !isPlaceholderOption(t));
        return chosen.length > 0 ? chosen : null;
      }
      const option = el.selectedOptions[0];
      const text = (option?.textContent ?? '').trim();
      return option && !isPlaceholderOption(text) && option.value !== '' ? text : null;
    }
    case 'radio': {
      const i = (field.optionEls as HTMLInputElement[]).findIndex((o) => o.checked);
      return i >= 0 ? (field.options[i] ?? null) : null;
    }
    case 'checkboxes': {
      const chosen = field.options.filter((_, i) => (field.optionEls[i] as HTMLInputElement | undefined)?.checked);
      return chosen.length > 0 ? chosen : null;
    }
    case 'checkbox':
      return (field.el as HTMLInputElement).checked ? true : null;
    case 'buttons': {
      const i = field.optionEls.findIndex(
        (o) => o.getAttribute('aria-pressed') === 'true' || o.getAttribute('aria-checked') === 'true',
      );
      return i >= 0 ? (field.options[i] ?? null) : null;
    }
    case 'combobox':
      return comboValue(field) || null;
    case 'file': {
      const files = (field.el as HTMLInputElement).files;
      return files && files.length > 0 ? files[0]!.name : null;
    }
  }
}
