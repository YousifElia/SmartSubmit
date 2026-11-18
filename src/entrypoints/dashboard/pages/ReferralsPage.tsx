/**
 * Referrals: find someone you know at the company a job is with, ask them,
 * and keep track of who said yes. People you know come from LinkedIn's own
 * export of your connections; SmartSubmit never visits LinkedIn for you.
 */
import { useMemo, useRef, useState } from 'react';
import { Check, ClipboardCopy, ExternalLink, Pencil, Plus, Sparkles, Trash2, Upload, UserRoundSearch, UsersRound } from 'lucide-react';
import { AiError, clientFor } from '@/core/ai/providers';
import { jobKeywords, matchResume, resumeText } from '@/core/jobs/keywords';
import { educationByRecency } from '@/core/profile';
import { fullName, linkedinSearches, readConnectionsFile } from '@/core/referrals/linkedin';
import { connectionsAt, rankForRole, referralsAt, type Ranked } from '@/core/referrals/match';
import {
  CHANNELS,
  finishMessage,
  messagePrompt,
  pickPrompt,
  pickSchema,
  readPicks,
  templateMessage,
  type Channel,
  type MessageInput,
  type ReferralJob,
} from '@/core/referrals/message';
import { parseResumeText } from '@/core/resume/heuristics';
import * as db from '@/core/storage/db';
import type { Connection, Connections, Job, Profile, Referral, ReferralStatus } from '@/core/types';
import { newId } from '@/core/util/id';
import { Handoff } from '@/ui/ai/Handoff';
import { copyText } from '@/ui/clipboard';
import { useCollection, useLive, useSettings } from '@/ui/hooks';
import { Badge, Button, Card, EmptyState, Modal, Notice, PageHeader, Segmented, SelectField, Spinner, TextArea, TextField } from '@/ui/kit';

const STATUSES: { value: ReferralStatus; label: string; tone: 'neutral' | 'brand' | 'green' | 'amber' | 'red' }[] = [
  { value: 'to-ask', label: 'To ask', tone: 'neutral' },
  { value: 'asked', label: 'Asked', tone: 'brand' },
  { value: 'agreed', label: 'Agreed to refer', tone: 'green' },
  { value: 'referred', label: 'Referred me', tone: 'green' },
  { value: 'declined', label: 'Declined', tone: 'red' },
];

const statusOf = (s: ReferralStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0]!;

function useConnections(): Connections | null | undefined {
  return useLive(
    () => db.getConnections(),
    (c) => c.kind === 'connections',
  );
}

function useProfile(): Profile | undefined {
  return useLive(
    () => db.getProfile(),
    (c) => c.kind === 'record' && c.collection === 'profile',
  );
}

function connectedOn(text: string): string {
  const time = Date.parse(text);
  return Number.isNaN(time) ? text : new Date(time).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

async function saveReferral(referral: Referral): Promise<void> {
  await db.put('referrals', referral.id, referral);
}

// ───────────────────────────── Connections ─────────────────────────────

function ConnectionsCard({ connections }: { connections: Connections | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const items = readConnectionsFile(file.name, new Uint8Array(await file.arrayBuffer()));
      if (items.length === 0) throw new Error('That file lists no connections.');
      await db.mutate([{ op: 'connections', value: { importedAt: Date.now(), items } }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card
      title="Your LinkedIn connections"
      description="SmartSubmit finds the people you know at a company from LinkedIn’s own copy of your connections. It never visits LinkedIn for you."
      actions={
        <>
          {connections && (
            <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => void db.mutate([{ op: 'connections', value: null }])}>
              Remove
            </Button>
          )}
          <Button variant={connections ? 'secondary' : 'primary'} busy={busy} icon={<Upload size={15} />} onClick={() => input.current?.click()}>
            {connections ? 'Import again' : 'Import connections'}
          </Button>
        </>
      }
    >
      <input
        ref={input}
        type="file"
        accept=".csv,.zip,text/csv,application/zip"
        className="hidden"
        data-testid="connections-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
      {connections ? (
        <p className="text-[13px] text-slate-600" data-testid="connections-status">
          {connections.items.length.toLocaleString()} connections, imported {new Date(connections.importedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}.
          They stay on this browser: never synced, never in a backup.
        </p>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-slate-600">
          <li>
            On LinkedIn, open{' '}
            <a className="font-medium text-brand-700 underline" href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer">
              Get a copy of your data
            </a>{' '}
            (Settings & Privacy, Data privacy).
          </li>
          <li>
            Choose <b className="font-medium text-ink">Connections</b> and request the archive. LinkedIn emails you a link, usually within about ten minutes.
          </li>
          <li>Download it and import it here: the .zip as it comes, or the Connections.csv inside it.</li>
        </ol>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="red">{error}</Notice>
        </div>
      )}
    </Card>
  );
}

// ───────────────────────────── Asking ─────────────────────────────

interface Ask {
  name: string;
  firstName: string;
  position: string;
  url: string;
  email: string;
  relationship: string;
}

function Composer({ ask, job, profile, onClose }: { ask: Ask; job: Job; profile: Profile; onClose: () => void }) {
  const [settings] = useSettings();
  const resumes = useCollection('resumes');
  const referrals = useCollection('referrals');
  const [channel, setChannel] = useState<Channel>(ask.email && !ask.url ? 'email' : 'linkedin');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [handoff, setHandoff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const client = settings ? clientFor(settings.ai) : null;
  const resume = (resumes ?? []).map((r) => r.data).sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0];
  const highlights = useMemo(() => {
    const doc = resume ? (resume.doc ?? parseResumeText(resume.text)) : null;
    const matched = doc ? matchResume(jobKeywords(job.blocks), resumeText(doc, resume!.text)).matched.filter((k) => k.kind === 'hard').map((k) => k.name) : [];
    return (matched.length > 0 ? matched : profile.skills).slice(0, 4);
  }, [resume, job, profile]);

  const input: MessageInput = {
    job: { title: job.title, company: job.company, url: job.url, description: job.description },
    channel,
    myName: profile.preferredName || profile.firstName,
    highlights,
    contact: { position: ask.position, relationship: ask.relationship },
  };

  const write = async (how: 'template' | 'model') => {
    setError('');
    setCopied(false);
    if (how === 'template' || !client) {
      setText(templateMessage({ ...input, firstName: ask.firstName }));
      return;
    }
    setBusy(true);
    try {
      setText(finishMessage(await client.chat({ prompt: messagePrompt(input) }), ask.firstName, channel));
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Your model couldn’t write the message. The plain version is below.');
      setText(templateMessage({ ...input, firstName: ask.firstName }));
    } finally {
      setBusy(false);
    }
  };

  const markAsked = async () => {
    const existing = (referrals ?? []).map((r) => r.data).find((r) => (ask.url && r.linkedin === ask.url) || (r.name === ask.name && referralsAt(job.company, [r]).length > 0));
    const now = Date.now();
    await saveReferral({
      ...(existing ?? {
        id: newId(),
        name: ask.name,
        company: job.company,
        title: ask.position,
        linkedin: ask.url,
        email: ask.email,
        relationship: ask.relationship,
        notes: '',
        createdAt: now,
      }),
      status: 'asked',
      askedAt: now,
      jobIds: [...new Set([...(existing?.jobIds ?? []), job.id])],
    } as Referral);
    setSaved(true);
  };

  const limit = CHANNELS.find((c) => c.value === channel)?.limit;
  return (
    <Modal open wide onClose={onClose} title={`Ask ${ask.name} for a referral`}>
      <div className="space-y-4">
        <p className="text-[13px] text-slate-600">
          {ask.position ? `${ask.position} at ${job.company}` : job.company} · for {job.title || 'this job'}
        </p>
        <Segmented<Channel>
          label="Where you’ll send it"
          value={channel}
          onChange={(v) => {
            setChannel(v || 'linkedin');
            setText('');
          }}
          options={CHANNELS}
          hint={CHANNELS.find((c) => c.value === channel)?.hint}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" busy={busy} disabled={!client} icon={<Sparkles size={15} />} onClick={() => void write('model')}>
            Write it with your model
          </Button>
          <Button onClick={() => void write('template')}>Use a plain template</Button>
          <Button variant="ghost" onClick={() => setHandoff(!handoff)}>
            {handoff ? 'Hide Claude' : 'Use Claude'}
          </Button>
        </div>
        {!client && <p className="text-xs text-slate-500">Set up a model on the AI page to have one write the message for free, on your computer.</p>}
        {handoff && (
          <Handoff
            request={`${messagePrompt(input).system}\n\n---\n\n${messagePrompt(input).user}\n\n---\n\nReply with only the message.`}
            onReply={(reply) => {
              setText(finishMessage(reply, ask.firstName, channel));
              setHandoff(false);
            }}
            replyLabel="Use this message"
          />
        )}
        {error && <Notice tone="amber">{error}</Notice>}
        {text && (
          <>
            <TextArea
              label="Message"
              rows={channel === 'note' ? 4 : 10}
              value={text}
              onChange={setText}
              hint={limit ? `${text.length} of ${limit} characters.` : undefined}
              data-testid="referral-message"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={copied ? <Check size={15} /> : <ClipboardCopy size={15} />} onClick={async () => setCopied(await copyText(text))}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
              {ask.url && (
                <a
                  href={ask.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
                >
                  <ExternalLink size={15} /> Open their LinkedIn
                </a>
              )}
              {ask.email && channel === 'email' && (
                <a
                  href={`mailto:${ask.email}?${new URLSearchParams({ subject: /^Subject: (.*)$/m.exec(text)?.[1] ?? '', body: text.replace(/^Subject: .*\n+/, '') }).toString().replace(/\+/g, '%20')}`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
                >
                  <ExternalLink size={15} /> Open in your email
                </a>
              )}
              <Button variant="ghost" disabled={saved} icon={saved ? <Check size={15} /> : undefined} onClick={() => void markAsked()}>
                {saved ? 'Saved as asked' : 'I sent it: save as asked'}
              </Button>
            </div>
            <p className="text-xs text-slate-500">SmartSubmit never sends anything for you: copy it, and send it yourself.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

// ───────────────────────────── Finding ─────────────────────────────

function FindCard({ jobs, job, onJob, connections, referrals, profile }: {
  jobs: Job[];
  job: Job | null;
  onJob: (id: string) => void;
  connections: Connections | null;
  referrals: Referral[];
  profile: Profile;
}) {
  const [settings] = useSettings();
  const [picked, setPicked] = useState<{ jobId: string; order: { index: number; reason: string }[] } | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);

  const client = settings ? clientFor(settings.ai) : null;
  const company = job?.company ?? '';
  const people = useMemo(() => (job && connections ? connectionsAt(company, connections.items) : []), [job, company, connections]);
  const ranked = useMemo<Ranked[]>(() => {
    const base = rankForRole(people, job?.title ?? '');
    if (!picked || picked.jobId !== job?.id) return base;
    // The model's picks first, with its reasons; everyone else after, as ranked.
    const chosen = picked.order.map((p) => ({ ...base[p.index]!, reason: p.reason || base[p.index]!.reason }));
    const rest = base.filter((_, i) => !picked.order.some((p) => p.index === i));
    return [...chosen, ...rest];
  }, [people, job, picked]);
  const saved = job ? referralsAt(company, referrals) : [];
  const school = educationByRecency(profile)[0]?.school ?? '';

  const askModel = async () => {
    if (!client || !job) return;
    setPicking(true);
    setError('');
    try {
      const base = rankForRole(people, job.title);
      const shortlist = base.slice(0, 25);
      const referralJob: ReferralJob = { title: job.title, company, url: job.url, description: job.description };
      const reply = await client.chat({ prompt: pickPrompt(referralJob, shortlist.map((r) => r.connection.position)), schema: pickSchema() });
      const order = readPicks(reply, shortlist.length);
      if (order.length === 0) throw new Error('Your model didn’t pick anyone. The list below is ranked by job title instead.');
      setPicked({ jobId: job.id, order });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your model couldn’t be reached.');
    } finally {
      setPicking(false);
    }
  };

  const askFor = (c: Connection, relationship = 'Connected on LinkedIn'): Ask => ({
    name: fullName(c),
    firstName: c.firstName,
    position: c.position,
    url: c.url,
    email: c.email,
    relationship,
  });

  return (
    <Card title="Find someone to refer you" description="Pick a job you’re applying for: SmartSubmit lists the people you know there, the best placed to refer you first.">
      {jobs.length === 0 ? (
        <EmptyState icon={<UserRoundSearch size={18} />} title="No applications yet">
          Jobs appear here once you autofill or save them from the SmartSubmit panel.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <SelectField
            label="Job"
            placeholder={null}
            value={job?.id ?? ''}
            onChange={onJob}
            options={jobs.map((j) => ({ value: j.id, label: [j.title, j.company].filter(Boolean).join(' at ') || j.url }))}
          />
          {job && (
            <>
              {saved.length > 0 && (
                <div className="space-y-1.5" data-testid="saved-at-company">
                  <p className="text-[13px] font-medium text-slate-700">Already on your list at {company}</p>
                  {saved.map((r) => (
                    <p key={r.id} className="flex items-center gap-2 text-[13px] text-slate-600">
                      <b className="font-medium text-ink">{r.name}</b> {r.title && `· ${r.title}`} <Badge tone={statusOf(r.status).tone}>{statusOf(r.status).label}</Badge>
                    </p>
                  ))}
                </div>
              )}

              {!connections ? (
                <Notice>Import your LinkedIn connections above to see who you know at {company || 'this company'}.</Notice>
              ) : people.length === 0 ? (
                <div className="space-y-2" data-testid="no-connections">
                  <p className="text-[13px] text-slate-600">None of your connections work at {company || 'this company'}. These LinkedIn searches can find someone; they open in a new tab.</p>
                  <ul className="space-y-1">
                    {linkedinSearches(company, school).map((link) => (
                      <li key={link.url}>
                        <a className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 underline" href={link.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={13} /> {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-slate-700">
                      {people.length === 1 ? '1 person you know works' : `${people.length} people you know work`} at {company}
                    </p>
                    <Button size="sm" busy={picking} disabled={!client} icon={<Sparkles size={14} />} onClick={() => void askModel()}>
                      Ask your model who’s best
                    </Button>
                  </div>
                  {!client && people.length > 1 && <p className="text-xs text-slate-500">With a model set up on the AI page, it can weigh their job titles against the posting. It sees job titles only, never names.</p>}
                  {error && <Notice tone="amber">{error}</Notice>}
                  <ul className="space-y-2" data-testid="people-at-company">
                    {ranked.slice(0, 15).map((r, i) => (
                      <li key={`${r.connection.url}-${i}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70" data-testid="person">
                        <div className="min-w-0 text-[13px]">
                          <p className="font-medium text-ink">
                            {fullName(r.connection)}
                            {picked?.jobId === job.id && i < picked.order.length && (
                              <span className="ml-2">
                                <Badge tone="brand">Your model’s pick</Badge>
                              </span>
                            )}
                          </p>
                          <p className="text-slate-500">
                            {r.connection.position || 'No job title listed'}
                            {r.connection.connectedOn && ` · connected ${connectedOn(r.connection.connectedOn)}`}
                          </p>
                          <p className="text-xs text-slate-500">{r.reason}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {r.connection.url && (
                            <a
                              href={r.connection.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${fullName(r.connection)}’s LinkedIn`}
                              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-ink"
                            >
                              <ExternalLink size={15} />
                            </a>
                          )}
                          <Button size="sm" variant="primary" onClick={() => setAsk(askFor(r.connection))}>
                            Ask for a referral
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {ask && job && <Composer ask={ask} job={job} profile={profile} onClose={() => setAsk(null)} />}
    </Card>
  );
}

// ───────────────────────────── Saved ─────────────────────────────

function ReferralForm({ initial, jobs, onClose }: { initial: Referral | null; jobs: Job[]; onClose: () => void }) {
  const [draft, setDraft] = useState<Referral>(
    initial ?? { id: newId(), name: '', company: '', title: '', linkedin: '', email: '', relationship: '', status: 'to-ask', jobIds: [], notes: '', askedAt: null, createdAt: Date.now() },
  );
  const set = (patch: Partial<Referral>) => setDraft({ ...draft, ...patch });
  const atCompany = jobs.filter((j) => draft.company && referralsAt(j.company, [draft]).length > 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `Edit ${initial.name}` : 'Add a referral'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!draft.name.trim() || !draft.company.trim()}
            onClick={async () => {
              await saveReferral({ ...draft, name: draft.name.trim(), company: draft.company.trim(), askedAt: draft.status !== 'to-ask' ? (draft.askedAt ?? Date.now()) : draft.askedAt });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={draft.name} onChange={(v) => set({ name: v })} />
          <TextField label="Company" value={draft.company} onChange={(v) => set({ company: v })} />
          <TextField label="Their job title" value={draft.title} onChange={(v) => set({ title: v })} />
          <TextField label="How you know them" placeholder="Former coworker, classmate…" value={draft.relationship} onChange={(v) => set({ relationship: v })} />
          <TextField label="LinkedIn" placeholder="https://www.linkedin.com/in/…" value={draft.linkedin} onChange={(v) => set({ linkedin: v })} />
          <TextField label="Email" type="email" value={draft.email} onChange={(v) => set({ email: v })} />
        </div>
        <SelectField label="Where it stands" placeholder={null} value={draft.status} onChange={(v) => set({ status: v as ReferralStatus })} options={STATUSES} />
        {atCompany.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-slate-700">For these applications</legend>
            {atCompany.map((j) => (
              <label key={j.id} className="flex items-center gap-2 text-[13px] text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.jobIds.includes(j.id)}
                  onChange={(e) => set({ jobIds: e.target.checked ? [...draft.jobIds, j.id] : draft.jobIds.filter((id) => id !== j.id) })}
                />
                {j.title || j.url}
              </label>
            ))}
          </fieldset>
        )}
        <TextArea label="Notes" rows={3} value={draft.notes} onChange={(v) => set({ notes: v })} />
      </div>
    </Modal>
  );
}

function SavedReferrals({ referrals, jobs }: { referrals: Referral[]; jobs: Job[] }) {
  const [editing, setEditing] = useState<Referral | 'new' | null>(null);
  const byCompany = useMemo(() => {
    const groups = new Map<string, Referral[]>();
    for (const r of [...referrals].sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name))) {
      const key = r.company.trim() || 'No company';
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.entries()];
  }, [referrals]);
  return (
    <Card
      title="Your referrals"
      description="Everyone you’ve asked, or mean to ask, at every company. Synced with your other browsers when sync is on."
      actions={
        <Button icon={<Plus size={15} />} onClick={() => setEditing('new')}>
          Add a referral
        </Button>
      }
    >
      {referrals.length === 0 ? (
        <EmptyState icon={<UsersRound size={18} />} title="No referrals yet">
          Ask someone from the list above, or add someone who already offered to refer you.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {byCompany.map(([company, list]) => (
            <section key={company} data-testid="referral-company">
              <h3 className="mb-2 text-[13px] font-semibold text-slate-700">{company}</h3>
              <ul className="space-y-2">
                {list.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/70" data-testid="referral">
                    <div className="min-w-0 text-[13px]">
                      <p className="font-medium text-ink">
                        {r.linkedin ? (
                          <a className="hover:underline" href={r.linkedin} target="_blank" rel="noreferrer">
                            {r.name}
                          </a>
                        ) : (
                          r.name
                        )}
                        {r.title && <span className="font-normal text-slate-500"> · {r.title}</span>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[
                          r.jobIds.map((id) => jobs.find((j) => j.id === id)?.title).filter(Boolean).join(', '),
                          r.askedAt ? `asked ${new Date(r.askedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '',
                          r.notes,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <select
                        aria-label={`Where it stands with ${r.name}`}
                        value={r.status}
                        onChange={(e) => void saveReferral({ ...r, status: e.target.value as ReferralStatus })}
                        className="rounded-lg border-0 bg-white py-1.5 pl-2 pr-7 text-[13px] ring-1 ring-inset ring-slate-300"
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <Button variant="ghost" size="sm" aria-label={`Edit ${r.name}`} icon={<Pencil size={14} />} onClick={() => setEditing(r)} />
                      <Button variant="ghost" size="sm" aria-label={`Delete ${r.name}`} icon={<Trash2 size={14} />} onClick={() => void db.remove('referrals', r.id)} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing && <ReferralForm initial={editing === 'new' ? null : editing} jobs={jobs} onClose={() => setEditing(null)} />}
    </Card>
  );
}

export function ReferralsPage({ jobId, navigate }: { jobId?: string; navigate: (route: string) => void }) {
  const connections = useConnections();
  const referralRecords = useCollection('referrals');
  const jobRecords = useCollection('jobs');
  const profile = useProfile();

  if (connections === undefined || !referralRecords || !jobRecords || !profile) return <Spinner className="h-6 w-6 text-slate-400" />;
  const jobs = jobRecords.map((r) => r.data).sort((a, b) => b.capturedAt - a.capturedAt);
  const referrals = referralRecords.map((r) => r.data);
  const job = jobs.find((j) => j.id === jobId) ?? jobs[0] ?? null;

  return (
    <>
      <PageHeader title="Referrals" description="Find someone you know at the company, ask them for a referral, and keep track of who said yes." />
      <div className="space-y-6">
        <ConnectionsCard connections={connections} />
        <FindCard jobs={jobs} job={job} onJob={(id) => navigate(`/referrals/${id}`)} connections={connections} referrals={referrals} profile={profile} />
        <SavedReferrals referrals={referrals} jobs={jobs} />
      </div>
    </>
  );
}
