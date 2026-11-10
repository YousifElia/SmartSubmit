/** Base64 helpers that work in pages, content scripts and service workers. */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
