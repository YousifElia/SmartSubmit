/**
 * Checking a tailored resume against the original.
 *
 * The prompt tells the model not to invent anything, but models still slip:
 * a job title "improved", a skill the posting wanted, a made-up metric. This
 * puts every fact back to the original's wording and takes out anything the
 * original doesn't have, so what the user reviews is already honest.
 */
import { dice, norm } from '../autofill/text';
import { mentions } from '../jobs/keywords';
import type { ResumeDoc } from '../types';
import { deepEqual } from '../util/equal';

export interface GuardResult {
  doc: ResumeDoc;
  /** Taken out because the original resume doesn't have them. */
  removed: string[];
  /** Put back to the original's wording. */
  restored: string[];
}

const similarity = (a: string, b: string) => dice(norm(a), norm(b));

/** Numbers in a text, normalised: "2,000" and "2000" are the same number. */
function numbers(text: string): string[] {
  return (text.match(/\d[\d,.]*\d|\d/g) ?? []).map((n) => n.replace(/,/g, '').replace(/\.$/, ''));
}

/** The closest original bullet, to put back in place of one with an invented number. */
function closest(bullet: string, originals: string[]): string | null {
  let best: { text: string; score: number } | null = null;
  for (const text of originals) {
    const score = similarity(bullet, text);
    if (!best || score > best.score) best = { text, score };
  }
  return best && best.score >= 0.3 ? best.text : null;
}

interface Matchable {
  key: string;
}

/** Pair each tailored entry with the original it came from; each original pairs once. */
function pair<T, O extends Matchable>(tailored: T[], originals: O[], score: (t: T, o: O) => number, threshold: number): (O | null)[] {
  const used = new Set<O>();
  return tailored.map((t) => {
    let best: { o: O; s: number } | null = null;
    for (const o of originals) {
      if (used.has(o)) continue;
      const s = score(t, o);
      if (!best || s > best.s) best = { o, s };
    }
    if (best && best.s >= threshold) {
      used.add(best.o);
      return best.o;
    }
    return null;
  });
}

export function guardTailored(original: ResumeDoc, originalText: string, tailored: ResumeDoc): GuardResult {
  const removed: string[] = [];
  const restored: string[] = [];
  const known = new Set(numbers(originalText));
  const doc: ResumeDoc = structuredClone(tailored);

  // Contact details are never the model's to change.
  if (!deepEqual(doc.basics, original.basics)) restored.push('Contact details');
  doc.basics = structuredClone(original.basics);

  /** Bullets with a number the original doesn't have go back to their original wording. */
  const checkBullets = (bullets: string[], originals: string[], where: string): string[] => {
    const out: string[] = [];
    for (const bullet of bullets) {
      const invented = numbers(bullet).filter((n) => !known.has(n));
      if (invented.length === 0) {
        out.push(bullet);
        continue;
      }
      const fallback = closest(bullet, originals);
      if (fallback && !out.includes(fallback)) {
        out.push(fallback);
        restored.push(`${where}: a bullet with ${invented.join(', ')}, which your resume doesn't mention`);
      } else {
        removed.push(`${where}: “${bullet}” (${invented.join(', ')} isn't in your resume)`);
      }
    }
    return out;
  };

  // ── Experience ──
  const jobs = original.experience.map((e, i) => ({ ...e, key: `e${i}` }));
  const jobPairs = pair(doc.experience, jobs, (t, o) => 0.6 * similarity(t.company, o.company) + 0.4 * similarity(t.title, o.title), 0.55);
  doc.experience = doc.experience.flatMap((t, i) => {
    const o = jobPairs[i];
    if (!o) {
      removed.push(`A role your resume doesn't have: ${[t.title, t.company].filter(Boolean).join(' at ')}`);
      return [];
    }
    const label = [o.title, o.company].filter(Boolean).join(' at ');
    if (t.company !== o.company || t.title !== o.title || t.location !== o.location || t.start !== o.start || t.end !== o.end) {
      restored.push(`${label}: title, company, location and dates`);
    }
    return [{ company: o.company, title: o.title, location: o.location, start: o.start, end: o.end, bullets: checkBullets(t.bullets, o.bullets, label) }];
  });

  // ── Education ──
  const schools = original.education.map((e, i) => ({ ...e, key: `s${i}` }));
  const schoolPairs = pair(doc.education, schools, (t, o) => Math.max(similarity(t.school, o.school), 0.9 * similarity(t.degree, o.degree)), 0.6);
  doc.education = doc.education.flatMap((t, i) => {
    const o = schoolPairs[i];
    if (!o) {
      removed.push(`A school your resume doesn't have: ${t.school || t.degree}`);
      return [];
    }
    if (t.school !== o.school || t.degree !== o.degree || t.location !== o.location || t.start !== o.start || t.end !== o.end) {
      restored.push(`${o.school}: school, degree and dates`);
    }
    return [{ school: o.school, degree: o.degree, location: o.location, start: o.start, end: o.end, details: checkBullets(t.details, o.details, o.school) }];
  });

  // ── Projects ──
  const projects = original.projects.map((p, i) => ({ ...p, key: `p${i}` }));
  const projectPairs = pair(doc.projects, projects, (t, o) => similarity(t.name, o.name), 0.6);
  doc.projects = doc.projects.flatMap((t, i) => {
    const o = projectPairs[i];
    if (!o) {
      removed.push(`A project your resume doesn't have: ${t.name}`);
      return [];
    }
    if (t.name !== o.name || t.subtitle !== o.subtitle || t.start !== o.start || t.end !== o.end) restored.push(`${o.name}: name, technologies and dates`);
    return [{ name: o.name, subtitle: o.subtitle, start: o.start, end: o.end, bullets: checkBullets(t.bullets, o.bullets, o.name) }];
  });

  // ── Skills: only what the original shows, under any spelling ──
  doc.skills = doc.skills
    .map((group) => ({
      category: group.category,
      items: group.items.filter((item) => {
        const ok = mentions(item, originalText);
        if (!ok) removed.push(`Skill: ${item}`);
        return ok;
      }),
    }))
    .filter((group) => group.items.length > 0);

  // ── Other sections: awards and certifications must already be there ──
  doc.extras = doc.extras.flatMap((extra) => {
    const source = original.extras.find((o) => similarity(o.title, extra.title) >= 0.6);
    const pool = source ? source.items : original.extras.flatMap((o) => o.items);
    const items = extra.items.filter((item) => {
      const ok = pool.some((o) => similarity(o, item) >= 0.6 || norm(o).includes(norm(item)));
      if (!ok) removed.push(`${extra.title}: ${item}`);
      return ok;
    });
    return items.length > 0 ? [{ title: source?.title ?? extra.title, items }] : [];
  });

  // ── Summary: no new numbers ──
  const inventedInSummary = numbers(doc.summary).filter((n) => !known.has(n));
  if (inventedInSummary.length > 0) {
    removed.push(`Summary (it mentioned ${inventedInSummary.join(', ')}, which isn't in your resume)`);
    doc.summary = original.summary;
  }

  // Keep only section names that still exist.
  const valid = new Set(['summary', 'education', 'experience', 'projects', 'skills', ...doc.extras.map((e) => `extra:${e.title}`)]);
  doc.order = doc.order.filter((key) => valid.has(key));
  return { doc, removed, restored };
}
