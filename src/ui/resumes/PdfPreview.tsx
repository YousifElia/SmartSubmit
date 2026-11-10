import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { FilePayload } from '@/core/messages';
import { base64ToBytes } from '@/core/util/base64';
import { downloadBase64 } from '../download';
import { Button, Modal, Notice, Spinner } from '../kit';

/** Shows a PDF built on demand, with a download button. */
export function PdfPreview({ title, load, onClose }: { title: string; load: () => Promise<FilePayload | null>; onClose: () => void }) {
  const [file, setFile] = useState<FilePayload | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    load().then(
      (payload) => {
        if (!alive) return;
        if (!payload) return setError('There is nothing to preview yet.');
        objectUrl = URL.createObjectURL(new Blob([base64ToBytes(payload.base64)], { type: payload.mime }));
        setFile(payload);
        setUrl(objectUrl);
      },
      (e: unknown) => alive && setError(e instanceof Error ? e.message : 'The PDF could not be built.'),
    );
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // The loader is fixed for the lifetime of the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPdf = file?.mime === 'application/pdf';
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" disabled={!file} icon={<Download size={15} />} onClick={() => file && downloadBase64(file.base64, file.mime, file.name)}>
            Download {file ? file.name : ''}
          </Button>
        </>
      }
    >
      {error ? (
        <Notice tone="red">{error}</Notice>
      ) : !file ? (
        <div className="flex h-64 items-center justify-center text-slate-400">
          <Spinner className="h-6 w-6" />
        </div>
      ) : isPdf ? (
        <iframe title={title} src={url} data-testid="pdf-preview" className="h-[68vh] w-full rounded-lg ring-1 ring-slate-200" />
      ) : (
        <Notice>
          This resume is attached as the file you uploaded ({file.name}). Word documents can’t be previewed here; download it to
          take a look.
        </Notice>
      )}
    </Modal>
  );
}
