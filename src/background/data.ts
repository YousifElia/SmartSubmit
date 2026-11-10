import { browser } from 'wxt/browser';
import type { Handlers, Snapshot } from '@/core/messages';
import * as db from '@/core/storage/db';
import { openDashboard } from './tabs';

async function snapshot(): Promise<Snapshot> {
  const [profile, answers, resumes, settings] = await Promise.all([
    db.getProfile(),
    db.list('answers'),
    db.list('resumes'),
    db.getSettings(),
  ]);
  const ai = settings.ai;
  const aiReady =
    (ai.provider === 'ollama' && !!ai.ollamaModel) || (ai.provider === 'openai-compat' && !!ai.compatModel);
  return {
    profile,
    answers: answers.map((r) => r.data),
    resumes: resumes
      .map((r) => r.data)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt - b.createdAt)
      .map((r) => ({ id: r.id, name: r.name, isDefault: r.isDefault, structured: r.doc !== null })),
    settings: { autofill: settings.autofill, panel: settings.panel, aiReady, aiProvider: ai.provider },
    onboarded: settings.onboarded,
  };
}

export const dataHandlers = {
  'db.mutate': ({ mutations }) => db.mutate(mutations),
  snapshot: () => snapshot(),
  'dashboard.open': ({ route }) => openDashboard(route),
  'tab.open': async ({ url }) => {
    // Only ever open web pages on request, never extension or file URLs.
    if (!/^https:\/\//i.test(url)) throw new Error('Refusing to open a non-https URL.');
    await browser.tabs.create({ url });
  },
} satisfies Partial<Handlers>;
