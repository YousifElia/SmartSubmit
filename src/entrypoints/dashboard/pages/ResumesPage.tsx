import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, RotateCcw, Sparkles } from 'lucide-react';
import { handoffText, parseResumePrompt } from '@/core/ai/prompts';
import { AiError, clientFor } from '@/core/ai/providers';
import { runParseResume } from '@/core/ai/run';
import { readResumeReply } from '@/core/ai/schema';
import { send } from '@/core/messages';
import { emptyResumeDoc } from '@/core/defaults';
import { parseResumeText } from '@/core/resume/heuristics';
import * as db from '@/core/storage/db';
import type { Resume, ResumeDoc } from '@/core/types';
import { Button, Modal, Notice, PageHeader, Spinner } from '@/ui/kit';
import { Handoff } from '@/ui/ai/Handoff';
import { useSettings } from '@/ui/hooks';
import { PdfPreview } from '@/ui/resumes/PdfPreview';
import { ResumeEditor } from '@/ui/resumes/ResumeEditor';
import { ResumeManager } from '@/ui/resumes/ResumeManager';

/** Read a resume's sections with AI: a local model, or claude.ai by copy and paste. */
function ReadWithAi({ text, onDone, onClose }: { text: string; onDone: (doc: ResumeDoc) => void; onClose: () => void }) {
  const [settings] = useSettings();
  const [state, setState] = useState<'choose' | 'running' | 'claude'>('choose');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const client = settings ? clientFor(settings.ai) : null;
  const ready = !!client && !!client.model;

  const runLocal = async () => {
    if (!client) return;
    setState('running');
    setError('');
    try {
      onDone(await runParseResume(client, text, { onProgress: setProgress }));
    } catch (e) {
      setState('choose');
      setError(e instanceof AiError || e instanceof Error ? e.message : 'The model could not read the resume.');
    }
  };

  return (
    <Modal open wide onClose={onClose} title="Read sections with AI">
      {state === 'claude' ? (
        <Handoff request={handoffText(parseResumePrompt(text))} onReply={(reply) => onDone(readResumeReply(reply))} replyLabel="Use these sections" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            AI reads the resume’s text into sections more reliably than SmartSubmit’s built-in reader when the layout is unusual.
            It replaces the sections below; you can still edit them afterwards.
          </p>
          {state === 'running' ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Spinner className="h-4 w-4 text-brand-600" /> {progress > 0 ? `Reading… ${progress.toLocaleString()} characters` : 'Starting the model…'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!ready} onClick={() => void runLocal()}>
                {ready ? `Use ${client!.model}` : 'No local model set up'}
              </Button>
              <Button onClick={() => setState('claude')}>Use Claude (copy and paste)</Button>
            </div>
          )}
          {error && <Notice tone="red">{error}</Notice>}
        </div>
      )}
    </Modal>
  );
}

function EditResume({ id, navigate }: { id: string; navigate: (route: string) => void }) {
  const [resume, setResume] = useState<Resume | null | undefined>(undefined);
  const [doc, setDoc] = useState<ResumeDoc>(emptyResumeDoc());
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [preview, setPreview] = useState(false);
  const [readingWithAi, setReadingWithAi] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<{ resume: Resume; doc: ResumeDoc } | null>(null);

  useEffect(() => {
    let alive = true;
    void db.get('resumes', id).then((found) => {
      if (!alive) return;
      setResume(found);
      if (found) setDoc(found.doc ?? parseResumeText(found.text));
    });
    return () => {
      alive = false;
      clearTimeout(timer.current);
      if (latest.current) void db.put('resumes', id, { ...latest.current.resume, doc: latest.current.doc });
    };
  }, [id]);

  if (resume === undefined) return <Spinner className="h-6 w-6 text-slate-400" />;
  if (resume === null) {
    return (
      <>
        <PageHeader title="Resume not found" />
        <Button icon={<ArrowLeft size={15} />} onClick={() => navigate('/resumes')}>
          Back to resumes
        </Button>
      </>
    );
  }

  const change = (next: ResumeDoc) => {
    setDoc(next);
    setStatus('saving');
    latest.current = { resume, doc: next };
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await db.put('resumes', id, { ...resume, doc: next });
      latest.current = null;
      setStatus('saved');
    }, 500);
  };

  return (
    <>
      <button type="button" onClick={() => navigate('/resumes')} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-ink">
        <ArrowLeft size={14} /> All resumes
      </button>
      <PageHeader
        title={resume.name}
        description="These sections are what tailoring rewrites and what the generated PDF is built from."
        actions={
          <>
            <span className="text-xs text-slate-400" aria-live="polite">
              {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
            </span>
            <Button icon={<RotateCcw size={15} />} title="Discard edits and read the sections from the original text again" onClick={() => change(parseResumeText(resume.text))}>
              Re-read from text
            </Button>
            <Button icon={<Sparkles size={15} />} onClick={() => setReadingWithAi(true)}>
              Read with AI
            </Button>
            <Button variant="primary" icon={<Eye size={15} />} onClick={() => setPreview(true)}>
              Preview PDF
            </Button>
          </>
        }
      />
      {resume.file && (
        <div className="mb-5">
          <Notice>
            Applications get your original file, <strong>{resume.file.name}</strong>, unchanged. The sections below are used when
            you tailor this resume for a job.
          </Notice>
        </div>
      )}
      <ResumeEditor doc={doc} onChange={change} />
      {readingWithAi && (
        <ReadWithAi
          text={resume.text}
          onClose={() => setReadingWithAi(false)}
          onDone={(next) => {
            // Contact details are better taken from what the user already has.
            change({ ...next, basics: next.basics.name ? next.basics : doc.basics });
            setReadingWithAi(false);
          }}
        />
      )}
      {preview && <PdfPreview title={`${resume.name} (generated PDF)`} load={() => send('pdf.resume', { doc })} onClose={() => setPreview(false)} />}
    </>
  );
}

export function ResumesPage({ resumeId, navigate }: { resumeId: string; navigate: (route: string) => void }) {
  if (resumeId) return <EditResume key={resumeId} id={resumeId} navigate={navigate} />;
  return (
    <>
      <PageHeader
        title="Resumes"
        description="Keep as many as you like. The default one is attached to applications unless you pick another in the panel."
      />
      <ResumeManager onEdit={(id) => navigate(`/resumes/${id}`)} />
    </>
  );
}
