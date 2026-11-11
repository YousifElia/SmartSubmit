/**
 * The claude.ai handoff: SmartSubmit prepares a request, the user pastes it
 * into claude.ai themselves and pastes the reply back. Nothing here signs in
 * to, or automates, claude.ai.
 */
import { useState } from 'react';
import { Check, ClipboardCopy, ExternalLink } from 'lucide-react';
import { CLAUDE_URL } from '@/core/ai/prompts';
import { copyText } from '../clipboard';
import { Button, Notice, TextArea } from '../kit';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{n}</span>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

export function Handoff({ request, onReply, replyLabel = 'Use this reply' }: { request: string; onReply: (reply: string) => Promise<void> | void; replyLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        <Step n={1} title="Copy the request">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon={copied ? <Check size={15} /> : <ClipboardCopy size={15} />}
              onClick={async () => setCopied(await copyText(request))}
            >
              {copied ? 'Copied' : 'Copy request'}
            </Button>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer select-none">See what will be sent ({Math.round(request.length / 100) / 10}k characters)</summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[11px] text-slate-600 ring-1 ring-slate-200">{request}</pre>
            </details>
          </div>
        </Step>
        <Step n={2} title="Paste it into a new chat on claude.ai and send it">
          <Button icon={<ExternalLink size={15} />} onClick={() => window.open(CLAUDE_URL, '_blank', 'noopener')}>
            Open claude.ai
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            This shares your resume and the job posting with Claude through your own account, under your claude.ai plan.
          </p>
        </Step>
        <Step n={3} title="Copy Claude’s whole reply and paste it here">
          <TextArea
            aria-label="Claude’s reply"
            rows={7}
            placeholder="Use the copy button under Claude’s reply, then paste here."
            value={reply}
            onChange={(v) => {
              setReply(v);
              setError('');
            }}
            className="font-mono text-[12px]"
          />
          <div className="mt-2">
            <Button
              variant="primary"
              busy={busy}
              disabled={!reply.trim()}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await onReply(reply);
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'That reply could not be read.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {replyLabel}
            </Button>
          </div>
        </Step>
      </ol>
      {error && <Notice tone="red">{error}</Notice>}
    </div>
  );
}
