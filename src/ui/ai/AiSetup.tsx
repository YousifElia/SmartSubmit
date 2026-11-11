/** Setting up AI: the claude.ai handoff (always available) and an optional local model. */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Copy, Cpu, MessageSquareQuote, RefreshCw } from 'lucide-react';
import { browser } from 'wxt/browser';
import { AiError, clientFor, isLocal } from '@/core/ai/providers';
import type { AiProvider, Settings } from '@/core/types';
import { copyText } from '../clipboard';
import { useSettings } from '../hooks';
import { Badge, Button, cx, Field, Notice, Segmented, Spinner, TextField } from '../kit';

function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative mt-1.5">
      <pre className="overflow-x-auto rounded-lg bg-ink px-3 py-2.5 pr-10 font-mono text-[12px] leading-relaxed text-slate-100">{text}</pre>
      <button
        type="button"
        aria-label="Copy command"
        className="absolute right-2 top-2 rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
        onClick={async () => {
          setCopied(await copyText(text));
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

type Os = 'mac' | 'windows' | 'linux';

function guessOs(): Os {
  const platform = navigator.userAgent.toLowerCase();
  if (platform.includes('win')) return 'windows';
  if (platform.includes('mac')) return 'mac';
  return 'linux';
}

const ORIGINS = 'chrome-extension://*,moz-extension://*';

/** How to let SmartSubmit talk to Ollama, per operating system. */
export function OllamaOriginsHelp() {
  const [os, setOs] = useState<Os>(guessOs());
  const steps: Record<Os, ReactNode> = {
    mac: (
      <>
        <p>Run this in Terminal, then quit Ollama from the menu bar and open it again:</p>
        <Command text={`launchctl setenv OLLAMA_ORIGINS "${ORIGINS}"`} />
      </>
    ),
    windows: (
      <>
        <p>Run this in PowerShell, then quit Ollama from the taskbar and start it again from the Start menu:</p>
        <Command text={`[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "${ORIGINS}", "User")`} />
      </>
    ),
    linux: (
      <>
        <p>If Ollama runs as a system service, add the setting to it and restart it:</p>
        <Command text="sudo systemctl edit ollama.service" />
        <p className="mt-2">Add these two lines in the editor that opens, save, then:</p>
        <Command text={`[Service]\nEnvironment="OLLAMA_ORIGINS=${ORIGINS}"`} />
        <Command text="sudo systemctl daemon-reload && sudo systemctl restart ollama" />
        <p className="mt-2">If you start it yourself instead:</p>
        <Command text={`OLLAMA_ORIGINS="${ORIGINS}" ollama serve`} />
      </>
    ),
  };
  return (
    <div className="rounded-xl bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
      <p className="font-semibold">Ollama needs to be told to accept SmartSubmit</p>
      <p className="mt-1">
        For safety, Ollama only answers browser extensions you allow. This is a one-time setting on your computer.
      </p>
      <div className="mt-3 inline-flex gap-1 rounded-lg bg-amber-100/70 p-1" role="tablist" aria-label="Your operating system">
        {(['mac', 'windows', 'linux'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={os === key}
            onClick={() => setOs(key)}
            className={cx('rounded-md px-2.5 py-1 text-xs font-medium', os === key ? 'bg-white shadow-sm' : 'text-amber-800 hover:text-amber-950')}
          >
            {{ mac: 'macOS', windows: 'Windows', linux: 'Linux' }[key]}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-1">{steps[os]}</div>
    </div>
  );
}

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'ok'; models: string[] } | { state: 'error'; error: AiError | Error };

const PROVIDERS: { value: Exclude<AiProvider, 'none'>; label: string }[] = [
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai-compat', label: 'Other local server' },
];

/** Ask for access to a model server that isn't on this computer. */
async function ensureAccess(url: string): Promise<boolean> {
  if (isLocal(url)) return true;
  try {
    const origin = `${new URL(url).origin}/*`;
    if (await browser.permissions.contains({ origins: [origin] })) return true;
    return await browser.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

function LocalModel({ settings, update }: { settings: Settings; update: (fn: (s: Settings) => Settings) => Promise<void> }) {
  const ai = settings.ai;
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const setAi = (patch: Partial<Settings['ai']>) => void update((s) => ({ ...s, ai: { ...s.ai, ...patch } }));
  const url = ai.provider === 'ollama' ? ai.ollamaUrl : ai.compatUrl;
  const model = ai.provider === 'ollama' ? ai.ollamaModel : ai.compatModel;

  const run = async () => {
    setCheck({ state: 'checking' });
    if (!(await ensureAccess(url))) {
      setCheck({ state: 'error', error: new Error(`SmartSubmit needs your permission to reach ${url}.`) });
      return;
    }
    const client = clientFor({ ...ai, ollamaModel: '', compatModel: '' });
    try {
      const models = (await client?.listModels()) ?? [];
      setCheck({ state: 'ok', models });
      // Pick a model automatically when there is an obvious choice.
      if (models.length > 0 && !models.includes(model)) setAi(ai.provider === 'ollama' ? { ollamaModel: models[0] } : { compatModel: models[0] });
    } catch (error) {
      setCheck({ state: 'error', error: error as Error });
    }
  };

  // Check once when the section opens with a provider already chosen.
  useEffect(() => {
    if (ai.provider !== 'none') void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai.provider]);

  if (ai.provider === 'none') {
    return (
      <Button icon={<Cpu size={15} />} onClick={() => setAi({ provider: 'ollama' })}>
        Set up a local model
      </Button>
    );
  }

  const models = check.state === 'ok' ? check.models : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Segmented<Exclude<AiProvider, 'none'>> label="Server" value={ai.provider} onChange={(v) => setAi({ provider: v || 'none' })} options={PROVIDERS} />
        <Button variant="ghost" size="sm" onClick={() => setAi({ provider: 'none' })}>
          Turn off
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Address"
          value={url}
          onChange={(v) => setAi(ai.provider === 'ollama' ? { ollamaUrl: v } : { compatUrl: v })}
          hint={ai.provider === 'ollama' ? 'Ollama’s usual address is http://localhost:11434.' : 'For example LM Studio at http://localhost:1234/v1.'}
        />
        {ai.provider === 'openai-compat' ? (
          <TextField label="API key" type="password" autoComplete="off" hint="Only if your server asks for one. Stored on this device only." value={ai.compatKey} onChange={(v) => setAi({ compatKey: v })} />
        ) : (
          <div />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Model" className="min-w-[240px] flex-1">
          {models.length > 0 ? (
            <select
              aria-label="Model"
              value={model}
              onChange={(e) => setAi(ai.provider === 'ollama' ? { ollamaModel: e.target.value } : { compatModel: e.target.value })}
              className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-brand-600"
            >
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          ) : (
            <input
              aria-label="Model"
              placeholder={ai.provider === 'ollama' ? 'qwen2.5:7b' : 'model name'}
              value={model}
              onChange={(e) => setAi(ai.provider === 'ollama' ? { ollamaModel: e.target.value } : { compatModel: e.target.value })}
              className="block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600"
            />
          )}
        </Field>
        <Button icon={check.state === 'checking' ? <Spinner /> : <RefreshCw size={15} />} disabled={check.state === 'checking'} onClick={() => void run()}>
          Check connection
        </Button>
      </div>

      {check.state === 'ok' &&
        (check.models.length > 0 ? (
          <Notice tone="green">
            <span className="inline-flex items-center gap-1.5">
              <Check size={14} /> Connected. {check.models.length} model{check.models.length === 1 ? '' : 's'} available
              {model ? `; SmartSubmit will use ${model}.` : '.'}
            </span>
          </Notice>
        ) : (
          <Notice tone="amber">
            Connected, but no models are installed yet. In a terminal, install one:
            <Command text="ollama pull qwen2.5:7b" />
            <p className="mt-2">About 4.7 GB and good at following instructions. On a computer with 8 GB of memory or less, try llama3.2:3b (about 2 GB) instead.</p>
          </Notice>
        ))}
      {check.state === 'error' &&
        (check.error instanceof AiError && check.error.kind === 'origin' ? (
          <OllamaOriginsHelp />
        ) : (
          <Notice tone="red">
            <span className="inline-flex items-start gap-1.5">
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
              <span>
                {check.error.message}
                {ai.provider === 'ollama' && check.error instanceof AiError && check.error.kind === 'unreachable' && (
                  <> If you haven’t installed Ollama yet, get it from ollama.com, then come back and check again.</>
                )}
              </span>
            </span>
          </Notice>
        ))}
    </div>
  );
}

export function AiSetup({ compact }: { compact?: boolean }) {
  const [settings, update] = useSettings();
  if (!settings) return <Spinner className="h-5 w-5 text-slate-400" />;
  const localReady =
    (settings.ai.provider === 'ollama' && !!settings.ai.ollamaModel) || (settings.ai.provider === 'openai-compat' && !!settings.ai.compatModel);

  return (
    <div className="space-y-4">
      <section className={cx('rounded-xl p-4 ring-1', compact ? 'bg-slate-50/70 ring-slate-200/70' : 'bg-white shadow-sm ring-slate-200/70')}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <MessageSquareQuote size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">Claude, by copy and paste</h3>
              <Badge tone="green">Always available</Badge>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
              SmartSubmit writes the request for you. You paste it into claude.ai, send it, and paste Claude’s reply back. It uses
              your own claude.ai plan and needs no setup. SmartSubmit never signs in to or controls claude.ai.
            </p>
          </div>
        </div>
      </section>

      <section className={cx('rounded-xl p-4 ring-1', compact ? 'bg-slate-50/70 ring-slate-200/70' : 'bg-white shadow-sm ring-slate-200/70')}>
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Cpu size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-ink">A model on your computer</h3>
              {localReady ? <Badge tone="green">Set up</Badge> : <Badge>Optional</Badge>}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
              Fully automatic: tailoring and drafting happen in one click, and nothing leaves your computer. Works with Ollama, or
              any server with an OpenAI-style API such as LM Studio.
            </p>
          </div>
        </div>
        <LocalModel settings={settings} update={update} />
      </section>
    </div>
  );
}
