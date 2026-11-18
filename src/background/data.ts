import { browser } from 'wxt/browser';
import { makeAnswer, normalizeQuestion } from '@/core/autofill/answers';
import type { Handlers, Snapshot } from '@/core/messages';
import { connectionsAt, referralsAt } from '@/core/referrals/match';
import { ACCOUNT_SITES, siteFromHost } from '@/core/sites';
import * as db from '@/core/storage/db';
import type { SavedAnswer } from '@/core/types';
import { newId } from '@/core/util/id';
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
  'answers.save': async ({ items, host }) => {
    const existing = await db.list('answers');
    const saved: SavedAnswer[] = [];
    const mutations: db.Mutation[] = [];
    for (const item of items) {
      const norm = normalizeQuestion(item.question);
      if (!norm) continue;
      // The same question saved again replaces the earlier answer.
      const previous = existing.find((r) => r.data.norm === norm);
      const record = makeAnswer({ ...item, id: previous?.id ?? newId(), host, now: Date.now() });
      if (previous) record.uses = previous.data.uses;
      mutations.push({ op: 'put', collection: 'answers', id: record.id, data: record });
      saved.push(record);
    }
    await db.mutate(mutations);
    return saved;
  },
  'answers.used': async ({ ids }) => {
    const mutations: db.Mutation[] = [];
    for (const id of new Set(ids)) {
      const answer = await db.get('answers', id);
      if (answer) mutations.push({ op: 'put', collection: 'answers', id, data: { ...answer, uses: answer.uses + 1 } });
    }
    await db.mutate(mutations);
  },
  'account.credentials': async (_payload, sender) => {
    // Only for the sign-in pages of the systems that have accounts, over HTTPS.
    let url: URL;
    try {
      url = new URL(sender.url ?? '');
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' || !ACCOUNT_SITES.has(siteFromHost(url.hostname))) return null;
    const [saved, profile] = await Promise.all([db.getJobSiteAccount(), db.getProfile()]);
    return { email: saved?.email.trim() || profile.email, password: saved?.password ?? '' };
  },
  'referrals.summary': async ({ company }) => {
    const [connections, referrals] = await Promise.all([db.getConnections(), db.list('referrals')]);
    const saved = referralsAt(company, referrals.map((r) => r.data));
    const order = ['referred', 'agreed', 'asked', 'to-ask', 'declined'] as const;
    const best = order.find((status) => saved.some((r) => r.status === status)) ?? null;
    return { people: connections ? connectionsAt(company, connections.items).length : 0, saved: saved.length, best };
  },
  'panel.hideHost': async ({ host }) => {
    const settings = await db.getSettings();
    if (settings.panel.hiddenHosts.includes(host)) return;
    await db.saveSettings({ ...settings, panel: { ...settings.panel, hiddenHosts: [...settings.panel.hiddenHosts, host] } });
  },
  'tab.open': async ({ url }) => {
    // Only ever open web pages on request, never extension or file URLs.
    if (!/^https:\/\//i.test(url)) throw new Error('Refusing to open a non-https URL.');
    await browser.tabs.create({ url });
  },
} satisfies Partial<Handlers>;
