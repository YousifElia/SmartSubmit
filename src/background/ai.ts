import { browser } from 'wxt/browser';
import { draftAnswerPrompt, handoffText, resumeAsText } from '@/core/ai/prompts';
import { AiError, clientFor } from '@/core/ai/providers';
import { runDraft } from '@/core/ai/run';
import type { DraftRequest, Handlers } from '@/core/messages';
import * as db from '@/core/storage/db';

let running: AbortController | null = null;

/**
 * Keep the background script awake while a model is writing: the browser
 * stops an idle background script after about 30 seconds, and a slow local
 * model can take longer than that.
 */
async function keepAwake<T>(work: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => void browser.runtime.getPlatformInfo(), 20_000);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

async function resumeTextFor(request: DraftRequest): Promise<string> {
  const ref = request.resume;
  if (ref?.kind === 'tailored') {
    const tailored = await db.get('tailored', ref.id);
    if (tailored) return resumeAsText(tailored.doc, '');
  }
  const resumes = (await db.list('resumes')).map((r) => r.data);
  const resume = (ref && resumes.find((r) => r.id === ref.id)) || resumes.find((r) => r.isDefault) || resumes[0];
  if (!resume) throw new Error('Add a resume in SmartSubmit first, so the draft has something to draw on.');
  return resumeAsText(resume.doc, resume.text);
}

async function promptFor(request: DraftRequest) {
  return draftAnswerPrompt({ question: request.question, resumeText: await resumeTextFor(request), job: request.job, maxLength: request.maxLength });
}

export const aiHandlers = {
  'ai.draftAnswer': async (request) => {
    const settings = await db.getSettings();
    const client = clientFor(settings.ai);
    if (!client) throw new AiError('model', 'No local model is set up. Use “Copy for Claude” instead, or set one up in SmartSubmit’s AI settings.');
    running?.abort();
    const controller = new AbortController();
    running = controller;
    try {
      const input = { question: request.question, resumeText: await resumeTextFor(request), job: request.job, maxLength: request.maxLength };
      return await keepAwake(() => runDraft(client, input, { signal: controller.signal }));
    } finally {
      if (running === controller) running = null;
    }
  },
  'ai.draftPrompt': async (request) => handoffText(await promptFor(request)),
  'ai.cancel': () => {
    running?.abort();
    running = null;
  },
} satisfies Partial<Handlers>;
