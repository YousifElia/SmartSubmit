import { useRef, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import * as db from '@/core/storage/db';
import { Button, Card, Modal, Notice, PageHeader, SelectField, Spinner, Toggle } from '@/ui/kit';
import { downloadText } from '@/ui/download';
import { useSettings } from '@/ui/hooks';

export function SettingsPage() {
  const [settings, update] = useSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  if (!settings) return <Spinner className="h-6 w-6 text-slate-400" />;
  const setAutofill = (patch: Partial<typeof settings.autofill>) =>
    void update((s) => ({ ...s, autofill: { ...s.autofill, ...patch } }));

  const exportData = async () => {
    const backup = await db.exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(JSON.stringify(backup, null, 2), 'application/json', `smartsubmit-backup-${stamp}.json`);
  };

  const importData = async (file: File) => {
    try {
      const result = await db.importBackup(JSON.parse(await file.text()));
      setMessage({ tone: 'green', text: `Imported ${result.records} records and ${result.files} files.` });
    } catch (error) {
      setMessage({ tone: 'red', text: error instanceof Error ? error.message : 'That file could not be read.' });
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="How SmartSubmit behaves on this browser. These settings are not synced." />
      <div className="space-y-6">
        <Card title="Autofill">
          <div className="space-y-4">
            <Toggle
              label="Fill automatically when a form is detected"
              hint="Off by default: you press Autofill yourself. Either way, nothing is ever submitted for you."
              checked={settings.autofill.autoRun}
              onChange={(v) => setAutofill({ autoRun: v })}
            />
            <Toggle
              label="Highlight fields on the page"
              hint="Green for filled, amber for worth checking, blue for still needs an answer."
              checked={settings.autofill.highlight}
              onChange={(v) => setAutofill({ highlight: v })}
            />
            <Toggle
              label="Offer to save new answers"
              hint="When you answer a question SmartSubmit didn't know, the panel offers to remember it."
              checked={settings.autofill.learn}
              onChange={(v) => setAutofill({ learn: v })}
            />
            <Toggle
              label="Fill voluntary demographic questions"
              hint="Uses the optional section of your profile. Turn off to always answer these by hand."
              checked={settings.autofill.demographics}
              onChange={(v) => setAutofill({ demographics: v })}
            />
            <div>
              <label htmlFor="similar" className="block text-sm font-medium text-ink">
                How similar a question must be to reuse a saved answer
              </label>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Near-matches are filled and flagged for you to check. Higher means fewer, safer matches.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <input
                  id="similar"
                  type="range"
                  min={0.5}
                  max={0.95}
                  step={0.01}
                  value={settings.autofill.similarThreshold}
                  onChange={(e) => setAutofill({ similarThreshold: Number(e.target.value) })}
                  className="w-64 accent-brand-600"
                />
                <span className="w-10 text-sm tabular-nums text-slate-600">
                  {Math.round(settings.autofill.similarThreshold * 100)}%
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Panel and PDFs">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Panel position on job pages"
              placeholder={null}
              value={settings.panel.side}
              onChange={(v) => void update((s) => ({ ...s, panel: { ...s.panel, side: v as 'left' | 'right' } }))}
              options={[
                { value: 'right', label: 'Right edge' },
                { value: 'left', label: 'Left edge' },
              ]}
            />
            <SelectField
              label="PDF page size"
              placeholder={null}
              value={settings.pdf.pageSize}
              onChange={(v) => void update((s) => ({ ...s, pdf: { pageSize: v as 'letter' | 'a4' } }))}
              options={[
                { value: 'letter', label: 'US Letter (Canada and US)' },
                { value: 'a4', label: 'A4' },
              ]}
            />
          </div>
          {settings.panel.hiddenHosts.length > 0 && (
            <div className="mt-4">
              <p className="text-[13px] font-medium text-slate-700">Panel hidden on</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {settings.panel.hiddenHosts.map((host) => (
                  <li key={host} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-xs text-slate-700">
                    {host}
                    <button
                      type="button"
                      aria-label={`Show the panel on ${host} again`}
                      className="rounded-full px-1 text-slate-400 hover:text-ink"
                      onClick={() =>
                        void update((s) => ({
                          ...s,
                          panel: { ...s.panel, hiddenHosts: s.panel.hiddenHosts.filter((h) => h !== host) },
                        }))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card
          title="Your data"
          description="A backup file holds your profile, resumes, saved answers and tracked applications. Use it to move between browsers without an account."
        >
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download size={15} />} onClick={() => void exportData()}>
              Export backup
            </Button>
            <Button icon={<Upload size={15} />} onClick={() => fileInput.current?.click()}>
              Import backup
            </Button>
            <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirmWipe(true)}>
              Delete everything on this device
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importData(file);
                e.target.value = '';
              }}
            />
          </div>
          {message && (
            <div className="mt-4">
              <Notice tone={message.tone}>{message.text}</Notice>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={confirmWipe}
        onClose={() => setConfirmWipe(false)}
        title="Delete everything on this device?"
        footer={
          <>
            <Button onClick={() => setConfirmWipe(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await db.wipeLocalData();
                setConfirmWipe(false);
                setMessage({ tone: 'green', text: 'All data on this device was deleted.' });
              }}
            >
              Delete everything
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">
          This removes your profile, resumes, saved answers and tracked applications from this browser. If sync is on,
          the deletions sync to your other browsers too. Export a backup first if you might want this back.
        </p>
      </Modal>
    </>
  );
}
