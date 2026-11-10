import { base64ToBytes } from '@/core/util/base64';

/** Save a blob to the user's downloads from an extension page. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadBase64(base64: string, mime: string, fileName: string): void {
  downloadBlob(new Blob([base64ToBytes(base64)], { type: mime }), fileName);
}

export function downloadText(text: string, mime: string, fileName: string): void {
  downloadBlob(new Blob([text], { type: mime }), fileName);
}
