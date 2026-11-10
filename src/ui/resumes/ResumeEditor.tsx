/**
 * Editor for a structured resume. Used for a user's own resumes and for
 * reviewing a tailored version before its PDF is built.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { sectionOrder } from '@/core/pdf/resumeTemplate';
import type { ResumeDoc } from '@/core/types';
import { Button, Grid, TextArea, TextField } from '../kit';

/**
 * A textarea editing a list, one item per line. It keeps its own text so
 * that blank lines and half-typed separators survive while typing; the list
 * it reports never contains empty items.
 */
function ListArea({
  label,
  hint,
  items,
  onChange,
  rows = 4,
  separator = '\n',
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  rows?: number;
  separator?: '\n' | ', ';
}) {
  const split = (text: string) =>
    text
      .split(separator === '\n' ? '\n' : /,|\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  const [text, setText] = useState(items.join(separator));
  // Pick up changes made elsewhere (a tailored version arriving, a reorder).
  useEffect(() => {
    if (JSON.stringify(split(text)) !== JSON.stringify(items)) setText(items.join(separator));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  return (
    <TextArea
      label={label}
      hint={hint}
      rows={rows}
      value={text}
      onChange={(next) => {
        setText(next);
        onChange(split(next));
      }}
    />
  );
}

function Block({ title, children, onAdd, addLabel }: { title: string; children: ReactNode; onAdd?: () => void; addLabel?: string }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <header className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {onAdd && (
          <Button size="sm" icon={<Plus size={14} />} onClick={onAdd}>
            {addLabel}
          </Button>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Entry({
  title,
  index,
  count,
  onMove,
  onRemove,
  children,
}: {
  title: string;
  index: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200/70">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="min-w-0 truncate text-[13px] font-semibold text-slate-700">{title}</h4>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="sm" aria-label="Move up" disabled={index === 0} icon={<ArrowUp size={14} />} onClick={() => onMove(-1)} />
          <Button variant="ghost" size="sm" aria-label="Move down" disabled={index === count - 1} icon={<ArrowDown size={14} />} onClick={() => onMove(1)} />
          <Button variant="ghost" size="sm" aria-label="Remove" icon={<Trash2 size={14} />} onClick={onRemove} />
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function move<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  education: 'Education',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
};

export function ResumeEditor({ doc, onChange }: { doc: ResumeDoc; onChange: (doc: ResumeDoc) => void }) {
  const set = (patch: Partial<ResumeDoc>) => onChange({ ...doc, ...patch });
  const setBasics = (patch: Partial<ResumeDoc['basics']>) => set({ basics: { ...doc.basics, ...patch } });
  const order = sectionOrder(doc);

  return (
    <div className="space-y-5">
      <Block title="Header">
        <Grid>
          <TextField label="Name" value={doc.basics.name} onChange={(v) => setBasics({ name: v })} />
          <TextField label="Location" placeholder="Windsor, ON" value={doc.basics.location} onChange={(v) => setBasics({ location: v })} />
        </Grid>
        <Grid>
          <TextField label="Email" value={doc.basics.email} onChange={(v) => setBasics({ email: v })} />
          <TextField label="Phone" value={doc.basics.phone} onChange={(v) => setBasics({ phone: v })} />
        </Grid>
        <ListArea label="Links" hint="One per line: LinkedIn, GitHub, portfolio." rows={2} items={doc.basics.links} onChange={(links) => setBasics({ links })} />
      </Block>

      <Block title="Summary">
        <TextArea label="Summary" hint="Optional. Leave empty to leave the section out." rows={3} value={doc.summary} onChange={(v) => set({ summary: v })} />
      </Block>

      <Block
        title="Experience"
        addLabel="Add a role"
        onAdd={() => set({ experience: [...doc.experience, { company: '', title: '', location: '', start: '', end: '', bullets: [] }] })}
      >
        {doc.experience.length === 0 && <p className="text-[13px] text-slate-500">No roles yet.</p>}
        {doc.experience.map((job, i) => {
          const update = (patch: Partial<typeof job>) => set({ experience: doc.experience.map((j, n) => (n === i ? { ...j, ...patch } : j)) });
          return (
            <Entry
              key={i}
              title={[job.title, job.company].filter(Boolean).join(' at ') || `Role ${i + 1}`}
              index={i}
              count={doc.experience.length}
              onMove={(d) => set({ experience: move(doc.experience, i, d) })}
              onRemove={() => set({ experience: doc.experience.filter((_, n) => n !== i) })}
            >
              <Grid>
                <TextField label="Job title" value={job.title} onChange={(v) => update({ title: v })} />
                <TextField label="Company" value={job.company} onChange={(v) => update({ company: v })} />
              </Grid>
              <Grid cols={3}>
                <TextField label="Location" value={job.location} onChange={(v) => update({ location: v })} />
                <TextField label="Start" placeholder="Jan 2025" value={job.start} onChange={(v) => update({ start: v })} />
                <TextField label="End" placeholder="Apr 2025 or Present" value={job.end} onChange={(v) => update({ end: v })} />
              </Grid>
              <ListArea label="Bullet points" hint="One per line." rows={Math.max(3, job.bullets.length + 1)} items={job.bullets} onChange={(bullets) => update({ bullets })} />
            </Entry>
          );
        })}
      </Block>

      <Block
        title="Education"
        addLabel="Add a school"
        onAdd={() => set({ education: [...doc.education, { school: '', degree: '', location: '', start: '', end: '', details: [] }] })}
      >
        {doc.education.length === 0 && <p className="text-[13px] text-slate-500">No education yet.</p>}
        {doc.education.map((edu, i) => {
          const update = (patch: Partial<typeof edu>) => set({ education: doc.education.map((e, n) => (n === i ? { ...e, ...patch } : e)) });
          return (
            <Entry
              key={i}
              title={edu.school || `School ${i + 1}`}
              index={i}
              count={doc.education.length}
              onMove={(d) => set({ education: move(doc.education, i, d) })}
              onRemove={() => set({ education: doc.education.filter((_, n) => n !== i) })}
            >
              <Grid>
                <TextField label="School" value={edu.school} onChange={(v) => update({ school: v })} />
                <TextField label="Degree" value={edu.degree} onChange={(v) => update({ degree: v })} />
              </Grid>
              <Grid cols={3}>
                <TextField label="Location" value={edu.location} onChange={(v) => update({ location: v })} />
                <TextField label="Start" placeholder="Sep 2023" value={edu.start} onChange={(v) => update({ start: v })} />
                <TextField label="End" placeholder="May 2027" value={edu.end} onChange={(v) => update({ end: v })} />
              </Grid>
              <ListArea label="Details" hint="One per line: GPA, coursework, honours." rows={2} items={edu.details} onChange={(details) => update({ details })} />
            </Entry>
          );
        })}
      </Block>

      <Block
        title="Projects"
        addLabel="Add a project"
        onAdd={() => set({ projects: [...doc.projects, { name: '', subtitle: '', start: '', end: '', bullets: [] }] })}
      >
        {doc.projects.length === 0 && <p className="text-[13px] text-slate-500">No projects yet.</p>}
        {doc.projects.map((project, i) => {
          const update = (patch: Partial<typeof project>) => set({ projects: doc.projects.map((p, n) => (n === i ? { ...p, ...patch } : p)) });
          return (
            <Entry
              key={i}
              title={project.name || `Project ${i + 1}`}
              index={i}
              count={doc.projects.length}
              onMove={(d) => set({ projects: move(doc.projects, i, d) })}
              onRemove={() => set({ projects: doc.projects.filter((_, n) => n !== i) })}
            >
              <Grid>
                <TextField label="Name" value={project.name} onChange={(v) => update({ name: v })} />
                <TextField label="Tech stack or link" value={project.subtitle} onChange={(v) => update({ subtitle: v })} />
              </Grid>
              <Grid>
                <TextField label="Start" value={project.start} onChange={(v) => update({ start: v })} />
                <TextField label="End" value={project.end} onChange={(v) => update({ end: v })} />
              </Grid>
              <ListArea label="Bullet points" hint="One per line." rows={Math.max(2, project.bullets.length + 1)} items={project.bullets} onChange={(bullets) => update({ bullets })} />
            </Entry>
          );
        })}
      </Block>

      <Block title="Skills" addLabel="Add a group" onAdd={() => set({ skills: [...doc.skills, { category: '', items: [] }] })}>
        {doc.skills.length === 0 && <p className="text-[13px] text-slate-500">No skills yet.</p>}
        {doc.skills.map((group, i) => {
          const update = (patch: Partial<typeof group>) => set({ skills: doc.skills.map((g, n) => (n === i ? { ...g, ...patch } : g)) });
          return (
            <div key={i} className="flex items-start gap-3">
              <TextField wrapClassName="w-44 shrink-0" label="Group" placeholder="Languages" value={group.category} onChange={(v) => update({ category: v })} />
              <div className="min-w-0 flex-1">
                <ListArea label="Skills" hint="Separated by commas." rows={2} separator=", " items={group.items} onChange={(items) => update({ items })} />
              </div>
              <Button variant="ghost" size="sm" className="mt-7" aria-label="Remove group" icon={<Trash2 size={14} />} onClick={() => set({ skills: doc.skills.filter((_, n) => n !== i) })} />
            </div>
          );
        })}
      </Block>

      <Block title="Other sections" addLabel="Add a section" onAdd={() => set({ extras: [...doc.extras, { title: 'New section', items: [] }] })}>
        {doc.extras.length === 0 && <p className="text-[13px] text-slate-500">Awards, certifications, volunteering and so on.</p>}
        {doc.extras.map((extra, i) => {
          const update = (patch: Partial<typeof extra>) => {
            const extras = doc.extras.map((e, n) => (n === i ? { ...e, ...patch } : e));
            // Keep the section's place in the order when it is renamed.
            const order = patch.title !== undefined ? doc.order.map((k) => (k === `extra:${extra.title}` ? `extra:${patch.title}` : k)) : doc.order;
            set({ extras, order });
          };
          return (
            <Entry
              key={i}
              title={extra.title || `Section ${i + 1}`}
              index={i}
              count={doc.extras.length}
              onMove={(d) => set({ extras: move(doc.extras, i, d) })}
              onRemove={() => set({ extras: doc.extras.filter((_, n) => n !== i) })}
            >
              <TextField label="Heading" value={extra.title} onChange={(v) => update({ title: v })} />
              <ListArea label="Items" hint="One per line." rows={Math.max(2, extra.items.length + 1)} items={extra.items} onChange={(items) => update({ items })} />
            </Entry>
          );
        })}
      </Block>

      {order.length > 1 && (
        <Block title="Section order">
          <ol className="space-y-1.5">
            {order.map((key, i) => (
              <li key={key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200/70">
                <span>
                  <span className="mr-2 text-slate-400">{i + 1}.</span>
                  {SECTION_LABELS[key] ?? key.replace(/^extra:/, '')}
                </span>
                <span className="flex gap-0.5">
                  <Button variant="ghost" size="sm" aria-label={`Move ${key} up`} disabled={i === 0} icon={<ArrowUp size={14} />} onClick={() => set({ order: move(order, i, -1) })} />
                  <Button variant="ghost" size="sm" aria-label={`Move ${key} down`} disabled={i === order.length - 1} icon={<ArrowDown size={14} />} onClick={() => set({ order: move(order, i, 1) })} />
                </span>
              </li>
            ))}
          </ol>
        </Block>
      )}
    </div>
  );
}
