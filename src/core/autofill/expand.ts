/**
 * Making room for every entry. Forms that ask for jobs, schools or languages
 * one block at a time start with one block, or none, and an "Add" button.
 * Before filling, SmartSubmit presses it until there is a block for each
 * entry in the profile (up to a limit), so each one can be filled.
 *
 * Only buttons that clearly add such a block are pressed: one that says so
 * ("Add another job"), or a plain "Add" under a heading that does.
 */
import { classify } from './classify';
import type { FormField } from './fields';
import { clickLikeAUser, sleep, waitFor } from './fill';
import type { FieldKey } from './model';

export type EntryKind = 'experience' | 'education' | 'languages';
export type EntryNeed = Record<EntryKind, number>;

/** Never more blocks than this, whatever the profile holds. */
export const ENTRY_LIMIT: EntryNeed = { experience: 10, education: 6, languages: 8 };

const KIND_WORDS: Record<EntryKind, RegExp> = {
  experience: /\b(work experience|experience|employment|employer|work history|job history|positions?|jobs?)\b/i,
  education: /\b(education|schools?|degrees?|academic|universit(y|ies)|colleges?)\b/i,
  languages: /\blanguages?\b/i,
};

/** Which field, counted once per block, shows how many blocks a section has. */
const COUNTED: Record<EntryKind, FieldKey[]> = {
  experience: ['expTitle', 'expCompany'],
  education: ['eduSchool'],
  languages: ['language'],
};

const ADD = /^\+?\s*add\b|\badd (another|more|new)\b/i;
const NOT_ADD = /\b(add(ed)? to|address|additional|cart|upload|attach|file|resume|cover|photo|link|website|url|reference|question)\b/i;

function textOf(el: Element): string {
  return (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
}

function visible(el: Element): boolean {
  return el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
}

/** The nearest heading above a button, within its section. */
function headingFor(button: Element): string {
  let node: Element | null = button;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const heading = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > legend, :scope > [role="heading"]');
    if (heading && heading !== button) return textOf(heading);
  }
  return '';
}

/** The kind of block an add button makes, if it is one. */
export function addButtonKind(button: Element): EntryKind | null {
  const text = textOf(button);
  if (!ADD.test(text) || NOT_ADD.test(text) || text.length > 60) return null;
  for (const kind of Object.keys(KIND_WORDS) as EntryKind[]) if (KIND_WORDS[kind].test(text)) return kind;
  // A plain "Add" or "Add Another": the section's heading says what it adds.
  if (!/^\+?\s*add( another| more| new)?\s*\+?$/i.test(text)) return null;
  const heading = headingFor(button);
  for (const kind of Object.keys(KIND_WORDS) as EntryKind[]) if (KIND_WORDS[kind].test(heading)) return kind;
  return null;
}

/** How many blocks of each kind the page shows, by the fields in them. */
export function countEntries(fields: FormField[]): EntryNeed {
  const counts: EntryNeed = { experience: 0, education: 0, languages: 0 };
  for (const kind of Object.keys(COUNTED) as EntryKind[]) {
    for (const key of COUNTED[kind]) {
      const n = fields.filter((f) => (f.adapterKey ?? classify(f)?.key) === key).length;
      counts[kind] = Math.max(counts[kind], n);
    }
  }
  return counts;
}

/**
 * Press add buttons until each kind has as many blocks as needed. `count`
 * reads how many there are now; `buttons` finds the add buttons by kind.
 * Returns how many blocks were added.
 */
export async function addEntries(
  need: EntryNeed,
  count: () => EntryNeed,
  buttons: () => Partial<Record<EntryKind, HTMLElement>>,
): Promise<number> {
  let added = 0;
  for (const kind of Object.keys(need) as EntryKind[]) {
    const wanted = Math.min(need[kind], ENTRY_LIMIT[kind]);
    for (let guard = 0; guard < ENTRY_LIMIT[kind]; guard++) {
      const have = count()[kind];
      if (have >= wanted) break;
      const button = buttons()[kind];
      if (!button) break;
      clickLikeAUser(button);
      const grew = await waitFor(() => count()[kind] > have, 2000, 50);
      if (!grew) break;
      added++;
      await sleep(30);
    }
  }
  return added;
}

/** Add buttons anywhere under a root, by the kind of block they add. */
export function findAddButtons(root: ParentNode): Partial<Record<EntryKind, HTMLElement>> {
  const found: Partial<Record<EntryKind, HTMLElement>> = {};
  for (const el of root.querySelectorAll<HTMLElement>('button, [role="button"], a[href="#"], a:not([href])')) {
    if (!visible(el)) continue;
    const kind = addButtonKind(el);
    // The last one in a section is the one under its last block.
    if (kind) found[kind] = el;
  }
  return found;
}
