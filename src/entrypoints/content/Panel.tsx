import { useSyncExternalStore } from 'react';
import { Check, LoaderCircle, Minus, Wand2, X } from 'lucide-react';
import type { Candidate, FieldResult } from '@/core/autofill/engine';
import { SITE_NAMES } from '@/core/sites';
import type { Controller, PanelState } from './controller';

function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="ss-panel-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#4f2bcc" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#ss-panel-g)" />
      <rect x="14" y="17" width="24" height="5" rx="2.5" fill="#fff" opacity=".55" />
      <rect x="14" y="29.5" width="15" height="5" rx="2.5" fill="#fff" opacity=".55" />
      <path d="M15.5 45.5l7.2 7 26-27.5" fill="none" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function answerText(answer: string | string[]): string {
  return Array.isArray(answer) ? answer.join(', ') : answer;
}

function ResultItem({ result, tone, onJump }: { result: FieldResult; tone: 'green' | 'amber' | 'sky'; onJump: () => void }) {
  return (
    <li>
      <button type="button" className="item" onClick={onJump} title="Show this field">
        <span className={`dot ${tone}`} />
        <span className="text">
          <span className="q">
            {result.label}
            {result.required && tone === 'sky' ? <span className="req"> *</span> : null}
          </span>
          {result.value && tone !== 'sky' ? <span className="v">{result.value}</span> : null}
          {result.note ? <span className="n">{result.note}</span> : null}
        </span>
      </button>
    </li>
  );
}

function SaveItem({ candidate, controller }: { candidate: Candidate; controller: Controller }) {
  return (
    <li className="save-item">
      <button type="button" className="text" style={{ textAlign: 'left' }} onClick={() => controller.jump(candidate.uid)} title="Show this field">
        <span className="q" style={{ display: 'block', fontWeight: 550 }}>
          {candidate.question}
        </span>
        <span className="v" style={{ display: 'block', color: '#64748b', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {answerText(candidate.answer)}
        </span>
      </button>
      <span className="actions">
        <button type="button" className="secondary" onClick={() => void controller.saveCandidates([candidate.uid])}>
          Save
        </button>
        <button type="button" className="icon-btn" aria-label="Don't save this answer" onClick={() => controller.dismissCandidate(candidate.uid)}>
          <X size={14} />
        </button>
      </span>
    </li>
  );
}

function Body({ state, controller }: { state: PanelState; controller: Controller }) {
  const { snapshot, results, summary, candidates } = state;
  const working = state.phase === 'working';
  const needs = results.filter((r) => r.status === 'unknown' || r.status === 'failed');
  const review = results.filter((r) => r.status === 'review');
  const filled = results.filter((r) => r.status === 'filled');
  const profileEmpty = snapshot ? !snapshot.profile.firstName && !snapshot.profile.email : false;

  return (
    <div className="body">
      {snapshot && (!snapshot.onboarded || profileEmpty) ? (
        <div className="card">
          <h3>Finish setting up</h3>
          <p>Add your details once and SmartSubmit can fill them in here.</p>
          <button type="button" className="secondary" onClick={() => controller.openDashboard(snapshot.onboarded ? '/profile' : '/welcome')}>
            Open setup
          </button>
        </div>
      ) : null}

      <button type="button" className="primary" disabled={working} onClick={() => void controller.autofill()}>
        {working ? <LoaderCircle size={16} className="spin" /> : <Wand2 size={16} />}
        {working ? 'Filling…' : state.phase === 'done' ? 'Autofill again' : 'Autofill this application'}
      </button>

      {snapshot && snapshot.resumes.length > 0 ? (
        <div className="row">
          <label htmlFor="ss-resume">Attach</label>
          <select id="ss-resume" value={state.resumeId} onChange={(e) => controller.setResume(e.target.value)}>
            {snapshot.resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isDefault ? ' (default)' : ''}
              </option>
            ))}
            <option value="">No resume</option>
          </select>
        </div>
      ) : snapshot ? (
        <p className="hint">
          No resume added yet.{' '}
          <button type="button" className="link" onClick={() => controller.openDashboard('/resumes')}>
            Add one
          </button>{' '}
          to have it attached for you.
        </p>
      ) : null}

      {working && state.progress && state.progress.total > 0 ? (
        <div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={state.progress.total} aria-valuenow={state.progress.done}>
            <span style={{ width: `${Math.round((state.progress.done / state.progress.total) * 100)}%` }} />
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            Field {state.progress.done} of {state.progress.total}
          </p>
        </div>
      ) : null}

      {state.error ? <p className="error">{state.error}</p> : null}
      {state.notice ? <p className="notice">{state.notice}</p> : null}

      {state.phase === 'idle' && !working ? (
        <p className="hint">
          {state.fieldCount > 0 ? `${state.fieldCount} questions found on this page. ` : ''}
          You review everything and submit yourself. SmartSubmit never submits for you.
        </p>
      ) : null}

      {summary && state.phase === 'done' ? (
        <>
          <div className="stats">
            <div className="stat green">
              <b>{summary.filled}</b>
              <span>Filled</span>
            </div>
            <div className="stat amber">
              <b>{summary.review}</b>
              <span>Check</span>
            </div>
            <div className="stat sky">
              <b>{summary.needsYou}</b>
              <span>Needs you</span>
            </div>
          </div>

          {candidates.length > 0 ? (
            <section className="group">
              <header>
                Save for next time <span className="count">{candidates.length}</span>
                <span className="spacer" />
                {candidates.length > 1 ? (
                  <button type="button" className="link" onClick={() => void controller.saveCandidates(candidates.map((c) => c.uid))}>
                    Save all
                  </button>
                ) : null}
              </header>
              <ul className="items" style={{ gap: 6 }}>
                {candidates.map((c) => (
                  <SaveItem key={c.uid} candidate={c} controller={controller} />
                ))}
              </ul>
            </section>
          ) : null}

          {needs.length > 0 ? (
            <section className="group">
              <header>
                Needs your answer <span className="count">{needs.length}</span>
              </header>
              <ul className="items">
                {needs.map((r) => (
                  <ResultItem key={r.uid} result={r} tone="sky" onJump={() => controller.jump(r.uid)} />
                ))}
              </ul>
            </section>
          ) : null}

          {review.length > 0 ? (
            <section className="group">
              <header>
                Check these <span className="count">{review.length}</span>
              </header>
              <ul className="items">
                {review.map((r) => (
                  <ResultItem key={r.uid} result={r} tone="amber" onJump={() => controller.jump(r.uid)} />
                ))}
              </ul>
            </section>
          ) : null}

          {filled.length > 0 ? (
            <details className="group">
              <summary>
                Filled <span className="count">{filled.length}</span>
              </summary>
              <ul className="items">
                {filled.map((r) => (
                  <ResultItem key={r.uid} result={r} tone="green" onJump={() => controller.jump(r.uid)} />
                ))}
              </ul>
            </details>
          ) : null}

          {needs.length === 0 && review.length === 0 && filled.length > 0 ? (
            <p className="notice" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} /> Everything recognised was filled. Give it a read before you submit.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function Panel({ controller, onHide }: { controller: Controller; onHide: () => void }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const side = state.snapshot?.settings.panel.side ?? 'right';
  const attention = state.summary ? state.summary.needsYou + state.summary.review + state.candidates.length : 0;

  if (!state.open) {
    return (
      <div className="ss" data-side={side}>
        <button type="button" className="launcher" aria-label="Open SmartSubmit" title="SmartSubmit" onClick={() => controller.setOpen(true)}>
          <Mark size={30} />
          {attention > 0 ? <span className="badge">{attention}</span> : null}
        </button>
      </div>
    );
  }

  return (
    <div className="ss" data-side={side}>
      <div className="panel" role="dialog" aria-label="SmartSubmit">
        <div className="head">
          <Mark size={24} />
          <span className="title">SmartSubmit</span>
          <span className="site">{SITE_NAMES[state.site]}</span>
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="Minimise" onClick={() => controller.setOpen(false)}>
            <Minus size={16} />
          </button>
        </div>
        <Body state={state} controller={controller} />
        <div className="foot">
          <button type="button" onClick={() => controller.openDashboard('/')}>
            Open dashboard
          </button>
          <button
            type="button"
            onClick={() => {
              void controller.hideOnThisSite();
              onHide();
            }}
          >
            Hide on this site
          </button>
        </div>
      </div>
    </div>
  );
}
