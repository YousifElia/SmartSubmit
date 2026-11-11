/**
 * State and actions behind the on-page panel. Kept apart from the React
 * components so the same logic can be driven by the toolbar popup.
 */
import { adapterFor, type SiteAdapter } from '@/core/autofill/adapters';
import {
  autofill,
  collectCandidates,
  summarize,
  type Candidate,
  type FieldResult,
  type Summary,
} from '@/core/autofill/engine';
import { discoverFields, type FormField } from '@/core/autofill/fields';
import { captureJob as captureFromPage, jobCountry, postingKey, type JobCapture } from '@/core/jobs/extract';
import type { MatchReport } from '@/core/jobs/keywords';
import { send, type ResumeRef, type Snapshot } from '@/core/messages';
import type { SiteId } from '@/core/sites';
import type { Job, JobStatus, TailoredResume } from '@/core/types';
import { fillText } from '@/core/autofill/fill';
import { CLAUDE_URL } from '@/core/ai/prompts';
import { base64ToBytes } from '@/core/util/base64';
import { clearHighlights, highlight, reveal } from './highlight';

/** Buttons that send an application. */
const SUBMIT = /^(submit( my| your)?( application)?|send( my)?( application)?|apply( now)?|complete application|finish( application)?)$/i;

export interface PanelState {
  site: SiteId;
  open: boolean;
  phase: 'idle' | 'working' | 'done';
  snapshot: Snapshot | null;
  fieldCount: number;
  results: FieldResult[];
  summary: Summary | null;
  candidates: Candidate[];
  /** Which resume to attach: a resume id, or '' for none. */
  resumeId: string;
  /** Set when the choice is a version tailored for this job. */
  tailoredId: string;
  /** Versions of the user's resumes tailored for this job. */
  tailored: TailoredResume[];
  /** AI drafts for open-ended questions, by field. */
  drafts: Record<string, Draft>;
  progress: { done: number; total: number } | null;
  error: string;
  /** Short confirmation shown after an action ("3 answers saved"). */
  notice: string;
  /** The posting this application is for, once read from the page. */
  capture: JobCapture | null;
  /** Its record in the tracker, once tracked. */
  job: Job | null;
  match: MatchReport | null;
  /** An action on the job in progress. */
  jobBusy: '' | 'pdf' | 'track';
}

export type Draft =
  | { state: 'working' }
  | { state: 'ready'; text: string }
  | { state: 'handoff'; text: string }
  | { state: 'error'; error: string };

export class Controller {
  private state: PanelState;
  private listeners = new Set<() => void>();
  private fields: FormField[] = [];
  private dismissed = new Set<string>();
  private adapter: SiteAdapter;
  private watch: ReturnType<typeof setInterval> | null = null;
  private captured: { key: string; promise: Promise<JobCapture | null> } | null = null;
  /** SmartSubmit filled this application, so pressing Submit is worth recording. */
  private used = false;
  private submitWatch: (() => void) | null = null;
  private matchFor = '';

  constructor(site: SiteId, private doc: Document) {
    this.adapter = adapterFor(site);
    this.state = {
      site,
      open: false,
      phase: 'idle',
      snapshot: null,
      fieldCount: 0,
      results: [],
      summary: null,
      candidates: [],
      resumeId: '',
      tailoredId: '',
      tailored: [],
      drafts: {},
      progress: null,
      error: '',
      notice: '',
      capture: null,
      job: null,
      match: null,
      jobBusy: '',
    };
  }

  // ── Store plumbing for React ──
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = (): PanelState => this.state;
  private set(patch: Partial<PanelState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** The form on this page, or null if there is none right now. */
  formRoot(): ParentNode | null {
    return this.adapter.formRoot(this.doc);
  }

  async loadSnapshot(): Promise<Snapshot> {
    const snapshot = await send('snapshot');
    const current = this.state.resumeId;
    const stillThere = snapshot.resumes.some((r) => r.id === current);
    this.set({
      snapshot,
      resumeId: stillThere ? current : (snapshot.resumes.find((r) => r.isDefault)?.id ?? snapshot.resumes[0]?.id ?? ''),
    });
    return snapshot;
  }

  scan(): FormField[] {
    const root = this.formRoot();
    this.fields = root ? discoverFields(root, this.adapter) : [];
    this.set({ fieldCount: this.fields.length });
    return this.fields;
  }

  setOpen(open: boolean): void {
    this.set({ open, notice: '' });
    if (open) {
      void this.loadSnapshot()
        .then(() => this.captureJob())
        .then(() => this.refreshMatch())
        .catch((e) => this.fail(e));
    }
  }

  /** Choose what to attach: `resume:<id>`, `tailored:<id>` or '' for nothing. */
  setResume(choice: string): void {
    const [kind, id = ''] = choice.split(':');
    if (kind === 'tailored') this.set({ tailoredId: id, match: null });
    else this.set({ resumeId: kind === 'resume' ? id : '', tailoredId: '', match: null });
    void this.refreshMatch();
  }

  /** The current choice in the form `setResume` takes. */
  resumeChoice(): string {
    if (this.state.tailoredId) return `tailored:${this.state.tailoredId}`;
    return this.state.resumeId ? `resume:${this.state.resumeId}` : '';
  }

  private resumeRef(): ResumeRef | null {
    if (this.state.tailoredId) return { kind: 'tailored', id: this.state.tailoredId };
    return this.state.resumeId ? { kind: 'resume', id: this.state.resumeId } : null;
  }

  /** Load the versions tailored for this job, and attach the one chosen for it. */
  private async loadTailored(job: Job): Promise<void> {
    const tailored = await send('tailored.forJob', { jobId: job.id }).catch(() => [] as TailoredResume[]);
    tailored.sort((a, b) => b.createdAt - a.createdAt);
    const chosen = job.resumeRef?.kind === 'tailored' && tailored.some((t) => t.id === job.resumeRef!.id) ? job.resumeRef.id : '';
    this.set({ tailored, ...(chosen && !this.state.tailoredId ? { tailoredId: chosen } : {}) });
  }

  /** Open the tailoring page for this job, adding it to the tracker if needed. */
  async openTailor(): Promise<void> {
    try {
      const job = this.state.job ?? (await this.track());
      if (!job) throw new Error('No job posting was found on this page.');
      this.openDashboard(`/tailor/${job.id}`);
    } catch (error) {
      this.fail(error);
    }
  }

  // ───────────────────────────── Drafts ─────────────────────────────

  private setDraft(uid: string, draft: Draft | null): void {
    const drafts = { ...this.state.drafts };
    if (draft) drafts[uid] = draft;
    else delete drafts[uid];
    this.set({ drafts });
  }

  /** Write a first draft for an open-ended question. Nothing goes into the form until the user inserts it. */
  async draft(uid: string): Promise<void> {
    const field = this.fields.find((f) => f.uid === uid);
    if (!field) return;
    const capture = this.state.capture;
    const request = {
      question: field.label,
      job: capture ? { title: capture.title, company: capture.company, location: capture.location, description: capture.description } : null,
      resume: this.resumeRef(),
      maxLength: field.maxLength,
    };
    if (this.state.snapshot?.settings.aiReady) {
      this.setDraft(uid, { state: 'working' });
      try {
        const text = await send('ai.draftAnswer', request);
        this.setDraft(uid, { state: 'ready', text });
      } catch (error) {
        this.setDraft(uid, { state: 'error', error: error instanceof Error ? error.message : 'The draft could not be written.' });
      }
      return;
    }
    // No local model: prepare the request for claude.ai instead.
    try {
      const text = await send('ai.draftPrompt', request);
      await copyToClipboard(text, this.doc);
      await send('tab.open', { url: CLAUDE_URL });
      this.setDraft(uid, { state: 'handoff', text: '' });
    } catch (error) {
      this.setDraft(uid, { state: 'error', error: error instanceof Error ? error.message : 'The request could not be prepared.' });
    }
  }

  updateDraft(uid: string, text: string): void {
    const draft = this.state.drafts[uid];
    if (draft && (draft.state === 'ready' || draft.state === 'handoff')) this.setDraft(uid, { ...draft, text });
  }

  dismissDraft(uid: string): void {
    this.setDraft(uid, null);
  }

  /** Put a draft the user approved into its field. */
  insertDraft(uid: string): void {
    const field = this.fields.find((f) => f.uid === uid);
    const draft = this.state.drafts[uid];
    if (!field || !draft || (draft.state !== 'ready' && draft.state !== 'handoff') || !draft.text.trim()) return;
    if (field.kind !== 'text') return;
    fillText(field.el as HTMLInputElement | HTMLTextAreaElement, draft.text.trim());
    if (this.state.snapshot?.settings.autofill.highlight) highlight(field, 'review');
    const results = this.state.results.map((r) => (r.uid === uid ? { ...r, status: 'review' as const, value: draft.text.trim(), note: 'Drafted with AI. Read it over and make it yours.' } : r));
    this.setDraft(uid, null);
    this.set({ results, summary: summarize(results) });
    this.refreshCandidates();
  }

  /** Whether a question is open-ended enough for a drafted answer. */
  canDraft(uid: string): boolean {
    const field = this.fields.find((f) => f.uid === uid);
    if (!field || field.kind !== 'text' || !field.label) return false;
    if (field.inputType === 'textarea') return true;
    return field.label.length >= 25 && /\?$|\b(why|describe|tell us|explain|what|how)\b/i.test(field.label);
  }

  // ───────────────────────────── The job ─────────────────────────────

  /** Read the posting behind this page, once per posting (single-page sites change it in place). */
  captureJob(): Promise<JobCapture | null> {
    const href = this.doc.location.href;
    const key = postingKey(this.state.site, new URL(href));
    if (this.captured?.key !== key) {
      const promise = captureFromPage(this.doc, this.state.site, href, (url) => fetch(url, { credentials: 'omit' })).catch(() => null);
      this.captured = { key, promise };
      this.set({ capture: null, job: null, match: null });
      void promise.then(async (capture) => {
        if (this.captured?.key !== key || !capture) return;
        this.set({ capture });
        // Already tracked from an earlier visit? Show its record. Looking at a
        // job never adds it to the tracker.
        const job = await send('job.find', { key: capture.key }).catch(() => null);
        if (job && this.captured?.key === key) {
          this.set({ job });
          await this.loadTailored(job);
        }
      });
    }
    return this.captured.promise;
  }

  /** Add the job to the tracker, or move it forward. */
  async track(status?: JobStatus): Promise<Job | null> {
    const capture = await this.captureJob();
    if (!capture) return null;
    const job = await send('job.upsert', { job: capture, status, resume: this.resumeRef() });
    this.set({ job });
    if (this.state.tailored.length === 0) await this.loadTailored(job);
    return job;
  }

  async refreshMatch(): Promise<void> {
    const capture = this.state.capture ?? (await this.captureJob());
    const resume = this.resumeRef();
    if (!capture || !resume || capture.blocks.length === 0) {
      this.set({ match: null });
      return;
    }
    const tag = `${capture.key}|${resume.id}`;
    this.matchFor = tag;
    try {
      const match = await send('job.match', this.state.job ? { jobId: this.state.job.id, resume } : { blocks: capture.blocks, resume });
      if (this.matchFor === tag) this.set({ match });
    } catch {
      if (this.matchFor === tag) this.set({ match: null });
    }
  }

  /** Save the posting as a PDF to the user's downloads. */
  async savePostingPdf(): Promise<void> {
    this.set({ jobBusy: 'pdf', error: '' });
    try {
      const job = this.state.job ?? (await this.track());
      if (!job) throw new Error('No job posting was found on this page.');
      const file = await send('pdf.job', { jobId: job.id });
      if (!file) throw new Error('The PDF could not be made.');
      const url = URL.createObjectURL(new Blob([base64ToBytes(file.base64)], { type: file.mime }));
      const a = this.doc.createElement('a');
      a.href = url;
      a.download = file.name;
      a.style.display = 'none';
      this.doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this.set({ notice: `Saved ${file.name} to your downloads.` });
    } catch (error) {
      this.fail(error);
    } finally {
      this.set({ jobBusy: '' });
    }
  }

  async markApplied(): Promise<void> {
    this.set({ jobBusy: 'track' });
    try {
      await this.track('applied');
      this.set({ notice: 'Marked as applied in your tracker.' });
    } catch (error) {
      this.fail(error);
    } finally {
      this.set({ jobBusy: '' });
    }
  }

  /**
   * Record the application as sent when the user presses the form's submit
   * button. SmartSubmit only listens; it never presses anything itself.
   */
  private watchForSubmit(): void {
    if (this.submitWatch) return;
    const onSubmit = (event: Event) => {
      if (!this.used || this.state.job?.status === 'applied') return;
      const root = this.formRoot();
      const target = event.target as Element | null;
      if (!root || !target || !(root as Node).contains(target)) return;
      if (event.type === 'click') {
        const button = target.closest('button, input[type="submit"], [role="button"]');
        const label = (button?.textContent || (button as HTMLInputElement | null)?.value || button?.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        if (!button || !(SUBMIT.test(label) || (button as HTMLButtonElement).type === 'submit')) return;
      }
      void this.track('applied').catch(() => undefined);
    };
    this.doc.addEventListener('submit', onSubmit, true);
    this.doc.addEventListener('click', onSubmit, true);
    this.submitWatch = () => {
      this.doc.removeEventListener('submit', onSubmit, true);
      this.doc.removeEventListener('click', onSubmit, true);
    };
  }

  private fail(error: unknown): void {
    this.set({ phase: this.state.results.length > 0 ? 'done' : 'idle', progress: null, error: error instanceof Error ? error.message : String(error) });
  }

  async autofill(options: { skipFiles?: boolean } = {}): Promise<FieldResult[]> {
    if (this.state.phase === 'working') return this.state.results;
    this.set({ phase: 'working', error: '', notice: '', progress: { done: 0, total: 0 } });
    try {
      const snapshot = await this.loadSnapshot();
      // The job's location settles questions like "authorized to work in the
      // country of this job". Don't hold up filling for a slow page, though.
      const capture = await Promise.race([this.captureJob(), new Promise<null>((r) => setTimeout(() => r(null), 2500))]);
      const fields = this.scan();
      clearHighlights(this.doc);
      this.dismissed.clear();

      // Filling moves focus down the form; put the page back where the user had it.
      const view = this.doc.defaultView;
      const scroll = view ? { x: view.scrollX, y: view.scrollY } : null;

      const ref = this.resumeRef();
      const company = capture?.company;
      let resume: File | null | undefined;
      const results = await autofill(
        fields,
        {
          snapshot,
          jobCountry: capture ? jobCountry(capture.location) : '',
          skipFiles: options.skipFiles,
          resumeFile: async () => {
            if (resume !== undefined) return resume;
            if (!ref) return (resume = null);
            const payload = await send('resume.file', { kind: ref.kind, id: ref.id, company });
            resume = payload ? new File([base64ToBytes(payload.base64)], payload.name, { type: payload.mime }) : null;
            return resume;
          },
        },
        {
          onProgress: (done, total, latest) => {
            const field = fields.find((f) => f.uid === latest.uid);
            if (field && snapshot.settings.autofill.highlight) highlight(field, latest.status);
            this.set({ progress: { done, total } });
          },
        },
      );

      (this.doc.activeElement as HTMLElement | null)?.blur?.();
      if (view && scroll) view.scrollTo(scroll.x, scroll.y);

      const used = results.filter((r) => r.answerId && (r.status === 'filled' || r.status === 'review')).map((r) => r.answerId!);
      if (used.length > 0) void send('answers.used', { ids: used }).catch(() => undefined);

      this.set({ phase: 'done', results, summary: summarize(results), progress: null });
      this.refreshCandidates();
      this.startWatching();

      // Log the application in the tracker and keep an eye out for the submit.
      this.used = true;
      this.watchForSubmit();
      void this.track('started')
        .then(() => this.refreshMatch())
        .catch(() => undefined);
      return results;
    } catch (error) {
      this.fail(error);
      return [];
    }
  }

  /** Re-read the page for answers the user has typed since. */
  refreshCandidates(): void {
    const snapshot = this.state.snapshot;
    if (!snapshot || !snapshot.settings.autofill.learn) return;
    const found = collectCandidates(this.fields, this.state.results, snapshot.answers).filter((c) => !this.dismissed.has(c.uid));
    // A form in steps replaces its questions as it moves on. Answers given on
    // an earlier step stay on offer until they are saved or dismissed.
    const departed = this.state.candidates.filter(
      (c) => !found.some((f) => f.uid === c.uid) && !this.dismissed.has(c.uid) && !this.fields.find((f) => f.uid === c.uid)?.el.isConnected,
    );
    const next = [...departed, ...found];
    const same = JSON.stringify(next) === JSON.stringify(this.state.candidates);
    if (!same) this.set({ candidates: next });
  }

  private startWatching(): void {
    if (this.watch) return;
    this.watch = setInterval(() => {
      if (this.state.open && this.state.phase === 'done') this.refreshCandidates();
    }, 1500);
  }

  dispose(): void {
    if (this.watch) clearInterval(this.watch);
    this.watch = null;
    this.submitWatch?.();
    this.submitWatch = null;
    clearHighlights(this.doc);
  }

  async saveCandidates(uids: string[]): Promise<void> {
    const items = this.state.candidates.filter((c) => uids.includes(c.uid));
    if (items.length === 0) return;
    try {
      await send('answers.save', {
        host: this.doc.location.hostname,
        items: items.map(({ question, kind, answer, options }) => ({ question, kind, answer, options })),
      });
      // Saved: no longer on offer, even for questions no longer on the page.
      this.set({ candidates: this.state.candidates.filter((c) => !uids.includes(c.uid)) });
      await this.loadSnapshot();
      // Saved questions now count as known.
      const results = this.state.results.map((r) =>
        uids.includes(r.uid) && (r.status === 'unknown' || r.status === 'failed')
          ? { ...r, status: 'filled' as const, source: 'saved' as const, note: '', value: displayAnswer(items.find((i) => i.uid === r.uid)!.answer) }
          : r,
      );
      for (const uid of uids) {
        const field = this.fields.find((f) => f.uid === uid);
        if (field && this.state.snapshot?.settings.autofill.highlight) highlight(field, 'filled');
      }
      this.set({
        results,
        summary: summarize(results),
        notice: items.length === 1 ? 'Answer saved for next time.' : `${items.length} answers saved for next time.`,
      });
      this.refreshCandidates();
    } catch (error) {
      this.fail(error);
    }
  }

  dismissCandidate(uid: string): void {
    this.dismissed.add(uid);
    this.set({ candidates: this.state.candidates.filter((c) => c.uid !== uid) });
  }

  jump(uid: string): void {
    const field = this.fields.find((f) => f.uid === uid);
    if (field?.el.isConnected) reveal(field);
  }

  async hideOnThisSite(): Promise<void> {
    await send('panel.hideHost', { host: this.doc.location.hostname }).catch(() => undefined);
  }

  openDashboard(route = '/'): void {
    void send('dashboard.open', { route }).catch(() => undefined);
  }
}

async function copyToClipboard(text: string, doc: Document): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = doc.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    area.select();
    doc.execCommand('copy');
    area.remove();
  }
}

function displayAnswer(answer: string | string[]): string {
  return Array.isArray(answer) ? answer.join(', ') : answer;
}
