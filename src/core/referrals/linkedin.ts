/**
 * LinkedIn connections, from the copy of your data LinkedIn gives you
 * (Settings & Privacy → Data privacy → Get a copy of your data →
 * Connections). SmartSubmit never visits linkedin.com for you: it reads
 * the file you download, and offers links for you to open yourself.
 */
import { strFromU8, unzipSync } from 'fflate';
import type { Connection } from '../types';

/** Read CSV text into rows of cells: quoted cells, doubled quotes, line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const COLUMNS: Record<keyof Connection, RegExp> = {
  firstName: /^first ?name$/i,
  lastName: /^last ?name$/i,
  url: /^(url|profile url|linkedin url)$/i,
  email: /^e-?mail( address)?$/i,
  company: /^company$/i,
  position: /^(position|title|job title)$/i,
  connectedOn: /^connected on$/i,
};

/**
 * Connections from LinkedIn's Connections.csv. The file starts with a few
 * lines of notes before the header row; those are skipped.
 */
export function parseConnectionsCsv(text: string): Connection[] {
  const rows = parseCsv(text);
  const header = rows.findIndex((r) => r.some((c) => COLUMNS.firstName.test(c.trim())) && r.some((c) => COLUMNS.lastName.test(c.trim())));
  if (header < 0) throw new Error('This doesn’t look like LinkedIn’s Connections.csv: it has no First Name and Last Name columns.');
  const names = rows[header]!.map((c) => c.trim());
  const column = (key: keyof Connection) => names.findIndex((n) => COLUMNS[key].test(n));
  const at = Object.fromEntries((Object.keys(COLUMNS) as (keyof Connection)[]).map((k) => [k, column(k)])) as Record<keyof Connection, number>;
  const out: Connection[] = [];
  for (const row of rows.slice(header + 1)) {
    const get = (key: keyof Connection) => (at[key] >= 0 ? (row[at[key]] ?? '').trim() : '');
    const connection: Connection = {
      firstName: get('firstName'),
      lastName: get('lastName'),
      url: get('url'),
      email: get('email'),
      company: get('company'),
      position: get('position'),
      connectedOn: get('connectedOn'),
    };
    if (!connection.firstName && !connection.lastName) continue;
    out.push(connection);
  }
  return out;
}

/** The Connections.csv inside LinkedIn's data archive (a .zip), as text. */
export function connectionsFromArchive(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (file) => /(^|\/)connections\.csv$/i.test(file.name) });
  const name = Object.keys(files)[0];
  if (!name) throw new Error('This archive has no Connections.csv. When you ask LinkedIn for a copy of your data, include Connections.');
  return strFromU8(files[name]!);
}

/** Read an uploaded file: the archive LinkedIn sends, or the Connections.csv from it. */
export function readConnectionsFile(name: string, bytes: Uint8Array): Connection[] {
  const zip = /\.zip$/i.test(name) || (bytes[0] === 0x50 && bytes[1] === 0x4b);
  return parseConnectionsCsv(zip ? connectionsFromArchive(bytes) : strFromU8(bytes));
}

export function fullName(c: Pick<Connection, 'firstName' | 'lastName'>): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

/**
 * LinkedIn searches to open yourself when none of your connections work at
 * a company: people there in your wider network, alumni of your school
 * there, and its recruiters.
 */
export function linkedinSearches(company: string, school = ''): { label: string; url: string }[] {
  const people = (keywords: string, network?: string) => {
    const params = new URLSearchParams({ keywords, origin: 'GLOBAL_SEARCH_HEADER' });
    if (network) params.set('network', network);
    return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
  };
  const out = [
    { label: `People at ${company} you know through a connection`, url: people(company, '["S"]') },
    { label: `Recruiters at ${company}`, url: people(`${company} recruiter`) },
  ];
  if (school) out.splice(1, 0, { label: `${school} alumni at ${company}`, url: people(`${company} ${school}`) });
  return out;
}
