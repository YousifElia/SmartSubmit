import { useMemo, useState } from 'react';
import { MessageSquareText, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { makeAnswer, normalizeQuestion } from '@/core/autofill/answers';
import * as db from '@/core/storage/db';
import type { SavedAnswer } from '@/core/types';
import { newId } from '@/core/util/id';
import { Badge, Button, EmptyState, Modal, PageHeader, Spinner, TextArea, TextField } from '@/ui/kit';
import { useCollection } from '@/ui/hooks';

function answerText(answer: SavedAnswer['answer']): string {
  return Array.isArray(answer) ? answer.join(', ') : answer;
}

interface Draft {
  id: string | null;
  question: string;
  answer: string;
  original: SavedAnswer | null;
}

function Editor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const [question, setQuestion] = useState(draft.question);
  const [answer, setAnswer] = useState(draft.answer);
  const [busy, setBusy] = useState(false);
  const multi = Array.isArray(draft.original?.answer);
  const valid = question.trim() !== '' && answer.trim() !== '';

  const save = async () => {
    setBusy(true);
    const value = multi
      ? answer
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : answer.trim();
    const record: SavedAnswer = draft.original
      ? { ...draft.original, question: question.trim(), norm: normalizeQuestion(question), answer: value }
      : makeAnswer({ id: newId(), question, kind: 'text', answer: value, options: [], host: '', now: Date.now() });
    await db.put('answers', record.id, record);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={draft.original ? 'Edit saved answer' : 'Add an answer'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!valid} busy={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextArea
          label="Question"
          rows={2}
          hint="Write it the way applications usually ask it. Similar wordings are matched too."
          value={question}
          onChange={setQuestion}
        />
        <TextArea
          label="Your answer"
          rows={multi ? 2 : 5}
          hint={
            multi
              ? 'Several choices, separated by commas.'
              : draft.original && draft.original.options.length > 0
                ? `For a multiple-choice question, use the wording of the choice. Seen so far: ${draft.original.options.slice(0, 6).join(', ')}.`
                : undefined
          }
          value={answer}
          onChange={setAnswer}
        />
      </div>
    </Modal>
  );
}

export function AnswersPage() {
  const records = useCollection('answers');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedAnswer | null>(null);

  const answers = useMemo(() => {
    const all = (records ?? []).map((r) => r.data).sort((a, b) => b.createdAt - a.createdAt);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((a) => a.question.toLowerCase().includes(q) || answerText(a.answer).toLowerCase().includes(q));
  }, [records, query]);

  if (!records) return <Spinner className="h-6 w-6 text-slate-400" />;

  return (
    <>
      <PageHeader
        title="Saved answers"
        description="Questions you answered once and chose to keep. The same question is filled in automatically; a similar one is filled and flagged for you to check."
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setDraft({ id: null, question: '', answer: '', original: null })}>
            Add answer
          </Button>
        }
      />

      {records.length === 0 ? (
        <EmptyState icon={<MessageSquareText size={18} />} title="Nothing saved yet">
          When you answer a question SmartSubmit didn’t know, its panel offers to save it. You can also add answers here
          ahead of time, for example “Which term are you available for?”.
        </EmptyState>
      ) : (
        <>
          <div className="relative mb-4 max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search saved answers"
              placeholder="Search questions and answers"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="block w-full rounded-lg border-0 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-600"
            />
          </div>
          {answers.length === 0 ? (
            <p className="text-sm text-slate-500">No saved answers match “{query}”.</p>
          ) : (
            <ul className="space-y-2">
              {answers.map((a) => (
                <li key={a.id} className="flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{a.question}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{answerText(a.answer)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {a.kind !== 'text' && <Badge>{a.kind === 'multi' ? 'Several choices' : a.kind === 'boolean' ? 'Checkbox' : 'Choice'}</Badge>}
                      <span>{a.uses === 0 ? 'Not used yet' : `Used ${a.uses} time${a.uses === 1 ? '' : 's'}`}</span>
                      {a.host && <span>· first saved on {a.host}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit answer to ${a.question}`}
                      icon={<Pencil size={15} />}
                      onClick={() => setDraft({ id: a.id, question: a.question, answer: answerText(a.answer), original: a })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete answer to ${a.question}`}
                      icon={<Trash2 size={15} />}
                      onClick={() => setConfirmDelete(a)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {draft && <Editor draft={draft} onClose={() => setDraft(null)} />}

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Delete this saved answer?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) await db.remove('answers', confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          “{confirmDelete?.question}” will no longer be filled in automatically. You can save it again from any
          application.
        </p>
      </Modal>
    </>
  );
}
