import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FontBytes } from '@/core/pdf/layout';

const font = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../../public/fonts', name)));

/** The bundled fonts, read from disk for tests that render PDFs. */
export const FONTS: FontBytes = {
  regular: font('Lato-Regular.ttf'),
  bold: font('Lato-Bold.ttf'),
  italic: font('Lato-Italic.ttf'),
  boldItalic: font('Lato-BoldItalic.ttf'),
};
