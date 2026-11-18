import { describe, expect, it } from 'vitest';
import { addButtonKind, addEntries, type EntryNeed } from '@/core/autofill/expand';

function button(html: string): Element {
  document.body.innerHTML = html;
  return document.querySelector('[data-test]')!;
}

describe('addButtonKind', () => {
  it('reads what a button adds from its words, or from its section’s heading', () => {
    expect(addButtonKind(button('<button data-test>+ Add another job</button>'))).toBe('experience');
    expect(addButtonKind(button('<button data-test>Add Education</button>'))).toBe('education');
    expect(addButtonKind(button('<section><h3>Languages</h3><button data-test>Add</button></section>'))).toBe('languages');
    expect(addButtonKind(button('<section><h2>Work Experience</h2><div><button data-test>+ Add Another</button></div></section>'))).toBe('experience');
    expect(addButtonKind(button('<button data-test aria-label="Add Another Work Experience">Add Another</button>'))).toBe('experience');
  });

  it('leaves alone buttons that add something else, or say too little', () => {
    expect(addButtonKind(button('<button data-test>Add to cart</button>'))).toBeNull();
    expect(addButtonKind(button('<section><h3>Work Experience</h3><button data-test>Upload resume</button></section>'))).toBeNull();
    expect(addButtonKind(button('<section><h3>Websites</h3><button data-test>Add</button></section>'))).toBeNull();
    expect(addButtonKind(button('<section><h3>Work Experience</h3><button data-test>Add a reference</button></section>'))).toBeNull();
    expect(addButtonKind(button('<button data-test>Add</button>'))).toBeNull();
  });
});

describe('addEntries', () => {
  it('presses each add button until there are enough blocks, and stops at the limit', async () => {
    const have: EntryNeed = { experience: 1, education: 0, languages: 0 };
    const presses: string[] = [];
    const fake = (kind: keyof EntryNeed) => {
      const el = document.createElement('button');
      el.addEventListener('click', () => {
        presses.push(kind);
        have[kind]++;
      });
      return el;
    };
    const buttons = { experience: fake('experience'), education: fake('education') };
    const added = await addEntries({ experience: 3, education: 1, languages: 2 }, () => ({ ...have }), () => buttons);
    expect(added).toBe(3);
    expect(presses).toEqual(['experience', 'experience', 'education']);
    // No button for languages: nothing pressed for them.
    expect(have.languages).toBe(0);
  });

  it('gives up on a button that adds nothing', async () => {
    const dud = document.createElement('button');
    const added = await addEntries({ experience: 2, education: 0, languages: 0 }, () => ({ experience: 0, education: 0, languages: 0 }), () => ({ experience: dud }));
    expect(added).toBe(0);
  }, 10_000);
});
