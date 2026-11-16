/** Add, list and manage resumes. Used on the Resumes page and during onboarding. */
import { useRef, useState } from 'react';
import { ClipboardPaste, Eye, FileText, Pencil, Star, Trash2, Upload, UserRoundCheck } from 'lucide-react';
import { send } from '@/core/messages';
import { looksStructured, parseResumeText } from '@/core/resume/heuristics';
import { latexToText, looksLikeLatex } from '@/core/resume/latex';
import { profileFromResume } from '@/core/resume/toProfile';
import * as db from '@/core/storage/db';
import type { Resume } from '@/core/types';
import { newId } from '@/core/util/id';
import { Badge, Button, EmptyState, Modal, Notice, Spinner, TextArea, TextField } from '../kit';
import { useCollection } from '../hooks';
import { PdfPreview } from './PdfPreview';
import { ACCEPT, LATEX_MIME, readResumeFile } from './readFile';

function describe(resume: Resume): string {
  const doc = resume.doc;
  if (!doc || !looksStructured(doc)) return 'Sections not recognised yet. Open it to add them.';
  const count = (n: number, one: string, many: string) => (n === 0 ? '' : `${n} ${n === 1 ? one : many}`);
  return [
    count(doc.experience.length, 'role', 'roles'),
    count(doc.education.length, 'school', 'schools'),
    count(doc.projects.length, 'project', 'projects'),
    count(doc.skills.reduce((sum, g) => sum + g.items.length, 0), 'skill', 'skills'),
  ]
    .filter(Boolean)
    .join(' · ');
}

function sourceLabel(resume: Resume): string {
  if (!resume.file) return resume.source === 'latex' ? 'LaTeX' : 'Pasted text';
  return resume.file.mime === 'application/pdf' ? 'PDF upload' : resume.file.mime === 'text/plain' ? 'Text file' : 'Word upload';
}

/** Create and store a resume from its text, parsing it into sections. */
async function addResume(input: {
  name: string;
  text: string;
  source?: Resume['source'];
  file?: { name: string; mime: string; size: number; base64: string };
}): Promise<Resume> {
  const existing = await db.list('resumes');
  const doc = parseResumeText(input.text);
  const fileId = input.file ? newId() : null;
  const resume: Resume = {
    id: newId(),
    name: input.name.trim() || `Resume ${existing.length + 1}`,
    isDefault: existing.length === 0,
    source: input.source ?? (input.file ? 'upload' : 'paste'),
    text: input.text,
    doc: looksStructured(doc) ? doc : null,
    file: input.file && fileId ? { id: fileId, name: input.file.name, mime: input.file.mime, size: input.file.size } : null,
    createdAt: Date.now(),
  };
  const mutations: db.Mutation[] = [{ op: 'put', collection: 'resumes', id: resume.id, data: resume }];
  if (input.file && fileId) mutations.push({ op: 'putFile', id: fileId, base64: input.file.base64 });
  await db.mutate(mutations);
  return resume;
}

async function makeDefault(id: string): Promise<void> {
  const all = await db.list('resumes');
  await db.mutate(
    all
      .filter((r) => r.data.isDefault !== (r.id === id))
      .map((r) => ({ op: 'put' as const, collection: 'resumes' as const, id: r.id, data: { ...r.data, isDefault: r.id === id } })),
  );
}

async function deleteResume(resume: Resume): Promise<void> {
  const mutations: db.Mutation[] = [{ op: 'remove', collection: 'resumes', id: resume.id }];
  if (resume.file) mutations.push({ op: 'removeFile', id: resume.file.id });
  // Tailored versions made from it go too.
  for (const t of await db.list('tailored')) if (t.data.resumeId === resume.id) mutations.push({ op: 'remove', collection: 'tailored', id: t.id });
  await db.mutate(mutations);
  // Keep exactly one default.
  if (resume.isDefault) {
    const rest = await db.list('resumes');
    const next = rest.sort((a, b) => a.data.createdAt - b.data.createdAt)[0];
    if (next) await makeDefault(next.id);
  }
}

function PasteDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (resume: Resume) => void }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Paste your resume"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={text.trim().length < 30}
            onClick={async () => {
              setBusy(true);
              // LaTeX source pasted in is read for what it prints.
              const latex = looksLikeLatex(text);
              onAdded(await addResume({ name, text: latex ? latexToText(text) : text, source: latex ? 'latex' : 'paste' }));
              onClose();
            }}
          >
            Add resume
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Name for this resume" placeholder="e.g. Software roles" hint="Only you see this. It helps you pick the right one when applying." value={name} onChange={setName} />
        <TextArea
          label="Resume text"
          rows={16}
          placeholder="Paste the full text of your resume here, or its LaTeX source."
          hint="SmartSubmit splits it into sections you can edit, and builds a clean PDF from them to attach to applications."
          value={text}
          onChange={setText}
          className="font-mono text-[12.5px]"
        />
      </div>
    </Modal>
  );
}

export function ResumeManager({ compact, onEdit }: { compact?: boolean; onEdit?: (id: string) => void }) {
  const records = useCollection('resumes');
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<Resume | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Resume | null>(null);
  const [offerImport, setOfferImport] = useState<Resume | null>(null);

  if (!records) return <Spinner className="h-6 w-6 text-slate-400" />;
  const resumes = records.map((r) => r.data).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt - b.createdAt);

  const afterAdd = async (resume: Resume) => {
    setNotice(`Added “${resume.name}”.`);
    // Offer to fill the profile when it is still mostly empty.
    const profile = await db.getProfile();
    if (resume.doc && profileFromResume(resume.doc, profile).filled.length >= 2) setOfferImport(resume);
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const read = await readResumeFile(file);
      // Text and LaTeX files can't be attached to applications as they are:
      // a PDF is built from their sections instead.
      const latex = read.mime === LATEX_MIME;
      const keepFile = read.mime !== 'text/plain' && !latex;
      await afterAdd(
        await addResume({
          name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
          text: read.text,
          source: latex ? 'latex' : undefined,
          file: keepFile ? read : undefined,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const importProfile = async (resume: Resume) => {
    if (!resume.doc) return;
    const result = profileFromResume(resume.doc, await db.getProfile());
    await db.saveProfile(result.profile);
    setOfferImport(null);
    setNotice(`Filled in your ${result.filled.join(', ')} from “${resume.name}”. Check them on the Profile page.`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" busy={busy} icon={<Upload size={15} />} onClick={() => fileInput.current?.click()}>
          Upload a file
        </Button>
        <Button icon={<ClipboardPaste size={15} />} onClick={() => setPasting(true)}>
          Paste text
        </Button>
        <span className="text-xs text-slate-400">PDF, Word (.docx), LaTeX (.tex) or plain text</span>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="hidden"
          data-testid="resume-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <Notice tone="red">{error}</Notice>}
      {notice && !offerImport && <Notice tone="green">{notice}</Notice>}
      {offerImport && (
        <Notice tone="brand">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Use “{offerImport.name}” to fill in the empty parts of your profile (name, contact details, education, work history)?
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="primary" icon={<UserRoundCheck size={14} />} onClick={() => void importProfile(offerImport)}>
                Fill my profile
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOfferImport(null)}>
                No thanks
              </Button>
            </span>
          </div>
        </Notice>
      )}

      {resumes.length === 0 ? (
        <EmptyState icon={<FileText size={18} />} title="No resumes yet">
          Add one and SmartSubmit attaches it to applications for you. You can keep several, for different kinds of role.
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {resumes.map((resume) => (
            <li key={resume.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70" data-testid="resume-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{resume.name}</h3>
                    {resume.isDefault && <Badge tone="brand">Default</Badge>}
                    <Badge>{sourceLabel(resume)}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-slate-500">{describe(resume)}</p>
                  {!compact && (
                    <p className="mt-1 text-xs text-slate-400">
                      {resume.file
                        ? `Attached to applications as your original file, ${resume.file.name}.`
                        : resume.source === 'latex'
                          ? 'Attached to applications as a PDF built from its sections. To send the PDF your LaTeX makes instead, upload that PDF.'
                          : 'Attached to applications as a PDF built from its sections.'}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {!resume.isDefault && (
                    <Button variant="ghost" size="sm" icon={<Star size={14} />} onClick={() => void makeDefault(resume.id)}>
                      Make default
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" icon={<Eye size={14} />} onClick={() => setPreview(resume)}>
                    Preview
                  </Button>
                  {onEdit && (
                    <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => onEdit(resume.id)}>
                      Edit sections
                    </Button>
                  )}
                  {!compact && (
                    <Button variant="ghost" size="sm" onClick={() => setRenaming({ id: resume.id, name: resume.name })}>
                      Rename
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" aria-label={`Delete ${resume.name}`} icon={<Trash2 size={14} />} onClick={() => setConfirmDelete(resume)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pasting && <PasteDialog onClose={() => setPasting(false)} onAdded={(r) => void afterAdd(r)} />}

      {preview && (
        <PdfPreview title={preview.name} load={() => send('resume.file', { kind: 'resume', id: preview.id })} onClose={() => setPreview(null)} />
      )}

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename resume"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!renaming?.name.trim()}
              onClick={async () => {
                const resume = renaming && (await db.get('resumes', renaming.id));
                if (resume && renaming) await db.put('resumes', resume.id, { ...resume, name: renaming.name.trim() });
                setRenaming(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <TextField label="Name" value={renaming?.name ?? ''} onChange={(name) => renaming && setRenaming({ ...renaming, name })} />
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this resume?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) await deleteResume(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          “{confirmDelete?.name}” and any versions tailored from it will be removed. Applications you have already tracked keep
          their history.
        </p>
      </Modal>
    </div>
  );
}
