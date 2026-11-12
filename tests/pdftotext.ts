import { execFileSync } from 'node:child_process';

/**
 * A PDF file's text, read the way an applicant tracking system would: with
 * pdftotext, a separate program (part of Poppler), so SmartSubmit's PDFs are
 * not checked with SmartSubmit's own code.
 */
export function pdfToText(file: string): string {
  try {
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'These tests read PDFs with pdftotext, which is not installed. Install Poppler: `sudo apt-get install poppler-utils` on Debian or Ubuntu, `brew install poppler` on macOS.',
      );
    }
    throw error;
  }
}
