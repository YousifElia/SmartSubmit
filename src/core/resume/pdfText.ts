/**
 * Rebuilding lines of text from the positioned fragments a PDF contains.
 *
 * A PDF stores text as pieces with coordinates, not as lines. This groups the
 * pieces by their baseline, orders them left to right, and marks wide
 * horizontal gaps so a right-aligned date stays distinguishable from the
 * title on its left.
 */

/** One piece of text as pdf.js reports it. */
export interface TextItem {
  str: string;
  /** [scaleX, skewY, skewX, scaleY, x, y] */
  transform: number[];
  width: number;
  height: number;
}

interface Placed {
  text: string;
  x: number;
  end: number;
  y: number;
  size: number;
}

/** Text of one page, top to bottom. */
export function linesFromItems(items: TextItem[]): string[] {
  const placed: Placed[] = items
    .filter((item) => item.str !== '')
    .map((item) => {
      const x = item.transform[4] ?? 0;
      const size = Math.abs(item.transform[3] ?? item.height) || item.height || 10;
      return { text: item.str, x, end: x + item.width, y: item.transform[5] ?? 0, size };
    });

  // Group into lines: pieces whose baselines are within a third of the type size.
  placed.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Placed[][] = [];
  for (const piece of placed) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0]!.y - piece.y) <= Math.max(2, row[0]!.size * 0.35)) row.push(piece);
    else rows.push([piece]);
  }

  const lines: string[] = [];
  let previousY: number | null = null;
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const size = row[0]!.size;
    // A larger than usual vertical step is a blank line.
    if (previousY !== null && previousY - row[0]!.y > size * 1.9) lines.push('');
    previousY = row[0]!.y;

    let line = '';
    let end: number | null = null;
    const wide = size * 2.2;
    for (const piece of row) {
      // pdf.js reports the space between two pieces as a piece of its own,
      // as wide as the gap it fills.
      if (piece.text.trim() === '') {
        if (line !== '' && !line.endsWith('    ')) line = `${line.replace(/ +$/, '')}${piece.end - piece.x > wide ? '    ' : ' '}`;
        end = piece.end;
        continue;
      }
      if (end !== null) {
        const gap = piece.x - end;
        if (gap > wide) line = `${line.replace(/ +$/, '')}    `;
        else if (gap > size * 0.18 && !line.endsWith(' ') && !piece.text.startsWith(' ')) line += ' ';
      }
      line += piece.text;
      end = piece.end;
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines;
}
