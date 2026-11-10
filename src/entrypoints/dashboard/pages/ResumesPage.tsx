import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, RotateCcw } from 'lucide-react';
import { send } from '@/core/messages';
import { emptyResumeDoc } from '@/core/defaults';
import { parseResumeText } from '@/core/resume/heuristics';
import * as db from '@/core/storage/db';
import type { Resume, ResumeDoc } from '@/core/types';
import { Button, Notice, PageHeader, Spinner } from '@/ui/kit';
import { PdfPreview } from '@/ui/resumes/PdfPreview';
import { ResumeEditor } from '@/ui/resumes/ResumeEditor';
import { ResumeManager } from '@/ui/resumes/ResumeManager';

function EditResume({ id, navigate }: { id: string; navigate: (route: string) => void }) {
  const [resume, setResume] = useState<Resume | null | undefined>(undefined);
  const [doc, setDoc] = useState<ResumeDoc>(emptyResumeDoc());
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [preview, setPreview] = useState(false);
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
