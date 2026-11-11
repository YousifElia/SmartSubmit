/**
 * Typed request/response messaging between the background script and every
 * other context (dashboard, popup, content scripts).
 *
 * Content scripts never read storage directly. They ask the background for
 * exactly what they need, and no handler ever returns a secret (sync session,
 * encryption key, or the OpenAI-compatible API key).
 */
import { browser } from 'wxt/browser';
import type { JobCapture } from './jobs/extract';
import type { MatchReport } from './jobs/keywords';
import type { SiteId } from './sites';
import type { Mutation } from './storage/db';
import type {
  Job,
  JobStatus,
  Profile,
  ResumeDoc,
  RichBlock,
  SavedAnswer,
  Settings,
  TailorChange,
  TailoredResume,
} from './types';

/** What a content script needs in order to fill a form. */
export interface Snapshot {
  profile: Profile;
  answers: SavedAnswer[];
  resumes: ResumeSummary[];
  settings: {
    autofill: Settings['autofill'];
    panel: Settings['panel'];
    aiReady: boolean;
    aiProvider: Settings['ai']['provider'];
  };
  onboarded: boolean;
}

export interface ResumeSummary {
  id: string;
  name: string;
  isDefault: boolean;
  /** True when the structured form exists, so it can be tailored. */
  structured: boolean;
}

/** What a tab's content script reports about its page. */
export interface PageStatus {
  site: SiteId;
  hasForm: boolean;
  fieldCount: number;
  /** Whether the reply came from the top frame rather than an embedded one. */
  top: boolean;
}

export interface NewAnswer {
  question: string;
  kind: SavedAnswer['kind'];
  answer: string | string[];
  options: string[];
}

export interface FilePayload {
  name: string;
  mime: string;
  base64: string;
}

export interface AiStatus {
  provider: Settings['ai']['provider'];
  ok: boolean;
  model: string;
  models: string[];
  error?: string;
}

export interface TailorResult {
  doc: ResumeDoc;
  changes: TailorChange[];
  gaps: string[];
}

export interface SyncStatus {
  configured: boolean;
  signedIn: boolean;
  email: string;
  /** Needs the password again on this device to unlock the encryption key. */
  locked: boolean;
  lastSyncAt: number | null;
  syncing: boolean;
  pending: number;
  error: string;
}

export type AuthResult =
  | { ok: true; needsConfirmation?: boolean }
  | { ok: false; error: string };

/** Every message the background understands: request payload → response. */
export interface Protocol {
  'db.mutate': [{ mutations: Mutation[] }, void];
  snapshot: [void, Snapshot];
  'tab.open': [{ url: string }, void];
  'dashboard.open': [{ route?: string }, void];

  /** Remember answers the user gave on a form. Returns the stored records. */
  'answers.save': [{ items: NewAnswer[]; host: string }, SavedAnswer[]];
  /** Note that saved answers were used, for the "times used" count. */
  'answers.used': [{ ids: string[] }, void];
  'panel.hideHost': [{ host: string }, void];
  /** Ask a tab whether it holds an application form. Null if SmartSubmit is not running there. */
  'page.status': [{ tabId: number }, PageStatus | null];
  /** Open the panel in a tab (injecting SmartSubmit first if needed) and optionally autofill. */
  'page.activate': [{ tabId: number; run: boolean }, PageStatus | null];

  /** The file to attach for a resume or a tailored version. */
  'resume.file': [{ kind: 'resume' | 'tailored'; id: string; company?: string }, FilePayload | null];
  'pdf.resume': [{ doc: ResumeDoc; fileName?: string }, FilePayload];
  'pdf.job': [{ jobId: string }, FilePayload | null];

  /**
   * Record a captured posting, or refresh the record of one seen before.
   * `status` only ever moves a job forward (saved → started → applied).
   */
  'job.upsert': [{ job: JobCapture; status?: JobStatus; resume?: ResumeRef | null }, Job];
  'job.update': [{ id: string; patch: JobPatch }, Job | null];
  /** The tracked record for a posting, if there is one. Never creates one. */
  'job.find': [{ key: string }, Job | null];
  /**
   * Keyword match between a resume and a job: a tracked one (its score is
   * stored) or a posting captured on the current page and not yet tracked.
   */
  'job.match': [{ jobId?: string; blocks?: RichBlock[]; resume: ResumeRef }, MatchReport];
  'tailored.forJob': [{ jobId: string }, TailoredResume[]];

  'ai.status': [{ probe?: Settings['ai'] } | void, AiStatus];
  'ai.tailor': [{ resumeId: string; jobId: string; strength: TailorStrength }, TailorResult];
  'ai.parseResume': [{ text: string }, ResumeDoc];
  'ai.draftAnswer': [{ question: string; jobId?: string; resumeId?: string; maxLength?: number }, string];
  'ai.cancel': [void, void];

  'sync.status': [void, SyncStatus];
  'sync.now': [void, SyncStatus];
  'auth.signUp': [{ email: string; password: string }, AuthResult];
  'auth.signIn': [{ email: string; password: string }, AuthResult];
  'auth.confirm': [{ email: string; code: string; password: string }, AuthResult];
  'auth.signOut': [void, void];
  'auth.changePassword': [{ current: string; next: string }, AuthResult];
  'auth.requestReset': [{ email: string }, AuthResult];
  'auth.completeReset': [{ email: string; code: string; password: string }, AuthResult];
  'auth.deleteAccount': [void, AuthResult];
}

export type TailorStrength = 'light' | 'balanced' | 'strong';

export type ResumeRef = NonNullable<Job['resumeRef']>;

/** The parts of a tracked job the user can change. */
export type JobPatch = Partial<Pick<Job, 'status' | 'appliedAt' | 'notes' | 'title' | 'company' | 'location' | 'resumeRef'>>;

export type MessageType = keyof Protocol;
type Req<K extends MessageType> = Protocol[K][0];
type Res<K extends MessageType> = Protocol[K][1];

interface Envelope {
  __smartsubmit: true;
  type: MessageType;
  payload: unknown;
}

type Reply = { ok: true; data: unknown } | { ok: false; error: string };

/** Send a request to the background script and wait for its answer. */
export async function send<K extends MessageType>(
  type: K,
  ...args: Req<K> extends void ? [] | [Req<K>] : [Req<K>]
): Promise<Res<K>> {
  const envelope: Envelope = { __smartsubmit: true, type, payload: args[0] };
  const reply = (await browser.runtime.sendMessage(envelope)) as Reply | undefined;
  if (!reply) throw new Error('SmartSubmit is restarting. Please try again.');
  if (!reply.ok) throw new Error(reply.error);
  return reply.data as Res<K>;
}

/**
 * Requests only extension pages (dashboard, popup) may make. A content script
 * runs inside a web page's process, so it is given the narrow requests it
 * needs and nothing that rewrites the store or touches the sync account.
 */
const PAGE_ONLY: ReadonlySet<MessageType> = new Set<MessageType>([
  'db.mutate',
  'auth.signUp',
  'auth.signIn',
  'auth.confirm',
  'auth.signOut',
  'auth.changePassword',
  'auth.requestReset',
  'auth.completeReset',
  'auth.deleteAccount',
  'sync.now',
]);

export type Handlers = {
  [K in MessageType]: (payload: Req<K>, sender: { tabId?: number; url?: string }) => Promise<Res<K>> | Res<K>;
};

/** Register the background's handlers. Call once, at the top level. */
export function serve(handlers: Partial<Handlers>): void {
  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    const envelope = message as Partial<Envelope> | null;
    if (!envelope || envelope.__smartsubmit !== true || typeof envelope.type !== 'string') return undefined;
    const handler = handlers[envelope.type] as
      | ((payload: unknown, sender: { tabId?: number; url?: string }) => unknown)
      | undefined;
    if (!handler) {
      sendResponse({ ok: false, error: `Unknown request: ${envelope.type}` } satisfies Reply);
      return undefined;
    }
    const fromExtensionPage = (sender.url ?? '').startsWith(browser.runtime.getURL(''));
    if (PAGE_ONLY.has(envelope.type) && !fromExtensionPage) {
      sendResponse({ ok: false, error: 'This request is only available from the SmartSubmit dashboard.' } satisfies Reply);
      return undefined;
    }
    Promise.resolve()
      .then(() => handler(envelope.payload, { tabId: sender.tab?.id, url: sender.url }))
      .then(
        (data) => sendResponse({ ok: true, data } satisfies Reply),
        (error: unknown) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          } satisfies Reply),
      );
    // Keep the channel open for the asynchronous reply.
    return true;
  });
}

/** Messages the background sends to a tab's content script. */
export type TabCommand = { __smartsubmit: true; command: 'toggle-panel' | 'autofill' | 'ping' };
