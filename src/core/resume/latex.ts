/**
 * Reading a LaTeX resume as plain text.
 *
 * Resumes written in LaTeX mostly define a few commands of their own
 * (`\resumeSubheading`, `\resumeItem`) on top of ordinary lists and tables,
 * or use a CV class such as moderncv or awesome-cv. This expands those
 * definitions the way TeX would, then writes out what would be typeset:
 * headings on their own lines, list items as bullets, table columns and
 * right-aligned dates set apart by a wide gap, links as their text.
 *
 * It is not a TeX engine. It aims at the text a resume parser needs, and
 * reads one file: anything brought in with \input is not seen.
 */

type Token =
  | { t: 'cmd'; v: string }
  | { t: 'char'; v: string }
  | { t: 'space' }
  | { t: 'par' }
  | { t: 'param'; n: number };

type ArgSpec = { kind: 'm' } | { kind: 'o'; fallback: Token[] } | { kind: 's' };

interface Macro {
  args: ArgSpec[];
  body: Token[];
}

interface Environment {
  args: ArgSpec[];
  begin: Token[];
  end: Token[];
}

const SPACE: Token = { t: 'space' };
/** Internal: end the current line. Not a name a file can spell. */
const LINE_END: Token = { t: 'cmd', v: '\u0001line' };

// ───────────────────────────── Reading the source ─────────────────────────────

function tokenize(source: string): Token[] {
  const out: Token[] = [];
  const src = source.replace(/\r\n?/g, '\n');
  const n = src.length;
  let i = 0;
  let afterWord = false;
  while (i < n) {
    const c = src[i]!;
    if (c === '%') {
      // A comment runs to the end of the line and takes the line break with it.
      while (i < n && src[i] !== '\n') i++;
      i++;
      while (i < n && (src[i] === ' ' || src[i] === '\t')) i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n') {
      let breaks = 0;
      while (i < n && (src[i] === ' ' || src[i] === '\t' || src[i] === '\n')) {
        if (src[i] === '\n') breaks++;
        i++;
      }
      // A blank line is a paragraph break; other spacing is one space, and
      // after a command word, none.
      if (breaks >= 2) out.push({ t: 'par' });
      else if (!afterWord) out.push(SPACE);
      afterWord = false;
      continue;
    }
    afterWord = false;
    if (c === '\\') {
      const next = src[i + 1];
      if (next === undefined) break;
      if (/[A-Za-z@]/.test(next)) {
        let j = i + 1;
        while (j < n && /[A-Za-z@]/.test(src[j]!)) j++;
        let name = src.slice(i + 1, j);
        // A starred form reads the same here (\section*, \vspace*).
        if (src[j] === '*') {
          name += '*';
          j++;
        }
        out.push({ t: 'cmd', v: name });
        i = j;
        afterWord = true;
      } else {
        out.push({ t: 'cmd', v: next });
        i += 2;
      }
      continue;
    }
    if (c === '#') {
      const next = src[i + 1];
      if (next && /[1-9]/.test(next)) {
        out.push({ t: 'param', n: Number(next) });
        i += 2;
        continue;
      }
      if (next === '#') {
        out.push({ t: 'char', v: '#' });
        i += 2;
        continue;
      }
    }
    out.push({ t: 'char', v: c });
    i++;
  }
  return out;
}

/** The source text of tokens, for option lists and link addresses. */
function raw(tokens: Token[]): string {
  return tokens
    .map((t) => (t.t === 'char' ? t.v : t.t === 'cmd' ? (/^[A-Za-z@]/.test(t.v) ? `\\${t.v} ` : `\\${t.v}`) : t.t === 'param' ? `#${t.n}` : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A link address as written: escapes undone, spacing removed. */
function address(tokens: Token[]): string {
  return tokens
    .map((t) => (t.t === 'char' ? t.v : t.t === 'cmd' && !/^[A-Za-z@]/.test(t.v) ? t.v : ''))
    .join('')
    .trim();
}

class Reader {
  private stack: { tokens: Token[]; at: number }[] = [];

  constructor(tokens: Token[]) {
    this.push(tokens);
  }

  push(tokens: Token[]): void {
    if (tokens.length) this.stack.push({ tokens, at: 0 });
  }

  next(): Token | undefined {
    while (this.stack.length) {
      const top = this.stack[this.stack.length - 1]!;
      if (top.at < top.tokens.length) return top.tokens[top.at++];
      this.stack.pop();
    }
    return undefined;
  }

  /** The next `count` tokens, without reading them. */
  peek(count = 1): Token[] {
    const out: Token[] = [];
    for (let s = this.stack.length - 1; s >= 0 && out.length < count; s--) {
      const frame = this.stack[s]!;
      for (let k = frame.at; k < frame.tokens.length && out.length < count; k++) out.push(frame.tokens[k]!);
    }
    return out;
  }

  skipSpaces(): void {
    while (this.peek()[0]?.t === 'space') this.next();
  }

  /** The next token after spaces, without reading it. */
  peekPastSpaces(): Token | undefined {
    return this.peek(64).find((t) => t.t !== 'space');
  }

  /** A braced argument's contents, or the single token standing in for one. */
  group(): Token[] {
    this.skipSpaces();
    if (this.peek()[0]?.t === 'par') this.next();
    this.skipSpaces();
    const first = this.next();
    if (!first) return [];
    if (!(first.t === 'char' && first.v === '{')) return [first];
    const out: Token[] = [];
    let depth = 1;
    for (let tok = this.next(); tok; tok = this.next()) {
      if (tok.t === 'char' && tok.v === '{') depth++;
      else if (tok.t === 'char' && tok.v === '}' && --depth === 0) return out;
      out.push(tok);
    }
    return out;
  }

  /** Is a braced argument next (after spaces)? */
  groupNext(): boolean {
    const tok = this.peekPastSpaces();
    return tok?.t === 'char' && tok.v === '{';
  }

  /** An optional [argument], or null when there is none. */
  optional(): Token[] | null {
    const tok = this.peekPastSpaces();
    if (!(tok?.t === 'char' && tok.v === '[')) return null;
    this.skipSpaces();
    this.next();
    const out: Token[] = [];
    let depth = 0;
    for (let t = this.next(); t; t = this.next()) {
      if (t.t === 'char' && t.v === '{') depth++;
      else if (t.t === 'char' && t.v === '}') depth--;
      else if (t.t === 'char' && t.v === ']' && depth === 0) return out;
      out.push(t);
    }
    return out;
  }

  /** A dimension written without braces (`\vskip 2pt`, `\kern-1em`). */
  dimension(): void {
    this.skipSpaces();
    const next = this.peek()[0];
    if (next?.t === 'cmd') {
      this.next();
      return;
    }
    let text = '';
    for (let tok = this.peek()[0]; tok?.t === 'char' && /[-+0-9.,a-z=]/i.test(tok.v); tok = this.peek()[0]) {
      text += tok.v;
      this.next();
      if (/(pt|em|ex|in|cm|mm|bp|pc|sp|mu|fil+)$/i.test(text) && !/[0-9.]$/.test(text)) break;
    }
  }
}

// ───────────────────────────── Writing the text ─────────────────────────────

const GAP = '\t';

class Output {
  private lines: string[] = [''];

  private get last(): string {
    return this.lines[this.lines.length - 1]!;
  }

  private set last(value: string) {
    this.lines[this.lines.length - 1] = value;
  }

  text(value: string): void {
    this.last += value;
  }

  space(): void {
    if (this.last !== '' && !/[ \t]$/.test(this.last)) this.last += ' ';
  }

  gap(): void {
    this.last = `${this.last.replace(/ +$/, '')}${GAP}`;
  }

  newline(): void {
    if (this.last.trim() !== '') this.lines.push('');
    else this.last = '';
  }

  par(): void {
    this.newline();
    if (this.lines.length > 1 && this.lines[this.lines.length - 2]!.trim() !== '') this.lines.push('');
  }

  toString(): string {
    return this.lines.join('\n');
  }
}

// ───────────────────────────── What commands mean ─────────────────────────────

/** Commands that set no text and take no arguments. */
const NOTHING = new Set(
  (
    'relax protect null strut leavevmode noindent indent centering raggedright raggedleft raggedbottom flushbottom ' +
    'selectfont normalfont normalsize tiny scriptsize footnotesize small large Large LARGE huge Huge ' +
    'bfseries mdseries itshape upshape slshape scshape ttfamily sffamily rmfamily em bf it sc tt rm sf sl ' +
    'hline toprule midrule bottomrule hrule titlerule smallskip medskip bigskip vfill vfil nobreak allowbreak ' +
    'ignorespaces unskip maketitle tableofcontents pagebreak nopagebreak newpage clearpage columnbreak ' +
    'sloppy fussy frenchspacing nonfrenchspacing pdfgentounicode empty textwidth linewidth columnwidth ' +
    'baselineskip parskip parindent tabcolsep arraystretch @ / - '
  )
    .trim()
    .split(/\s+/),
);

/** Commands whose arguments are settings, not text: how many braced ones, and whether [options] come first. */
const SETTINGS: Record<string, [number, boolean?]> = {
  vspace: [1],
  'vspace*': [1],
  addvspace: [1],
  setlength: [2],
  addtolength: [2],
  settowidth: [2],
  setcounter: [2],
  addtocounter: [2],
  pagestyle: [1],
  thispagestyle: [1],
  pagenumbering: [1],
  label: [1],
  ref: [1],
  pageref: [1],
  color: [1, true],
  definecolor: [3],
  colorlet: [2],
  input: [1],
  include: [1],
  includegraphics: [1, true],
  photo: [1, true],
  fontsize: [2],
  usepackage: [1, true],
  RequirePackage: [1, true],
  documentclass: [1, true],
  geometry: [1],
  newgeometry: [1],
  hypersetup: [1],
  urlstyle: [1],
  setlist: [1, true],
  linespread: [1],
  enlargethispage: [1],
  'enlargethispage*': [1],
  phantom: [1],
  hphantom: [1],
  vphantom: [1],
  rule: [2, true],
  cline: [1],
  extracolsep: [1],
  fancyhf: [1],
  fancyhead: [1, true],
  fancyfoot: [1, true],
  footnote: [1, true],
  footnotetext: [1, true],
  setmainfont: [1, true],
  setsansfont: [1, true],
  setmonofont: [1, true],
  fontspec: [1, true],
  newfontfamily: [2, true],
  titlespacing: [4],
  'titlespacing*': [4],
  moderncvstyle: [1],
  moderncvcolor: [1],
  moderncvtheme: [1, true],
  nopagenumbers: [0],
  colorizelinks: [0, true],
  fontdir: [0, true],
  makecvfooter: [3],
  quote: [1],
  extrainfo: [1],
  faIcon: [1, true],
  faicon: [1, true],
  newlength: [1],
  newcounter: [1],
};

/** Commands that only set a box around, or a colour on, their last argument: how many settings arguments come before it. */
const WRAPPERS: Record<string, number> = {
  textcolor: 1,
  colorbox: 1,
  fcolorbox: 2,
  raisebox: 1,
  resizebox: 2,
  'resizebox*': 2,
  scalebox: 1,
  rotatebox: 1,
  parbox: 1,
  makebox: 0,
  framebox: 0,
  foreignlanguage: 1,
  hyperlink: 1,
  hyperref: 0,
  multicolumn: 2,
  multirow: 2,
};

const SYMBOLS: Record<string, string> = {
  '&': '&',
  '%': '%',
  $: '$',
  '#': '#',
  _: '_',
  '{': '{',
  '}': '}',
  '|': '|',
  ' ': ' ',
  ',': ' ',
  ';': ' ',
  ':': ' ',
  '>': ' ',
  quad: ' ',
  qquad: ' ',
  enspace: ' ',
  enskip: ' ',
  thinspace: ' ',
  space: ' ',
  textbar: '|',
  vert: '|',
  mid: '|',
  lvert: '|',
  rvert: '|',
  textbullet: '•',
  bullet: '•',
  cdot: '·',
  cdotp: '·',
  textperiodcentered: '·',
  ldots: '…',
  dots: '…',
  cdots: '…',
  textellipsis: '…',
  textendash: '–',
  textemdash: '—',
  textasciitilde: '~',
  textasciicircum: '^',
  textbackslash: '\\',
  textunderscore: '_',
  textdollar: '$',
  textgreater: '>',
  textless: '<',
  textquoteright: '’',
  textquoteleft: '‘',
  textquotedblleft: '“',
  textquotedblright: '”',
  textregistered: '®',
  texttrademark: '™',
  copyright: '©',
  textcopyright: '©',
  LaTeX: 'LaTeX',
  LaTeXe: 'LaTeX2e',
  TeX: 'TeX',
  BibTeX: 'BibTeX',
  S: '§',
  textsection: '§',
  pounds: '£',
  textsterling: '£',
  euro: '€',
  texteuro: '€',
  textdegree: '°',
  degree: '°',
  times: '×',
  pm: '±',
  sim: '~',
  approx: '≈',
  to: '→',
  rightarrow: '→',
  longrightarrow: '→',
  Rightarrow: '⇒',
  leftarrow: '←',
  geq: '≥',
  ge: '≥',
  leq: '≤',
  le: '≤',
  neq: '≠',
  ast: '*',
  star: '*',
  infty: '∞',
  checkmark: '✓',
  slash: '/',
  textslash: '/',
  lbrace: '{',
  rbrace: '}',
  ss: 'ß',
  o: 'ø',
  O: 'Ø',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  aa: 'å',
  AA: 'Å',
  l: 'ł',
  L: 'Ł',
  i: 'ı',
  j: 'ȷ',
};

/** Accents, as the combining mark each one adds. */
const ACCENTS: Record<string, string> = {
  "'": '́',
  '`': '̀',
  '^': '̂',
  '"': '̈',
  '~': '̃',
  '=': '̄',
  '.': '̇',
  u: '̆',
  v: '̌',
  H: '̋',
  c: '̧',
  k: '̨',
  r: '̊',
  d: '̣',
  b: '̱',
};

/** Commands that style the one argument they take. */
const FORMAT = new Set(
  (
    'textbf textit emph underline uline uuline sout textsc texttt textsf textrm textmd textup textsl textnormal ' +
    'mbox hbox vbox vcenter fbox text mathrm mathbf mathit mathsf mathtt mathcal mathbb boldsymbol operatorname ' +
    'textsuperscript textsubscript ensuremath textls'
  )
    .trim()
    .split(/\s+/),
);

const HEADINGS = new Set(['part', 'chapter', 'section', 'subsection', 'subsubsection', 'cvsection', 'cvsubsection']);
const LISTS = new Set(['itemize', 'enumerate', 'description', 'compactitem', 'compactenum', 'compactdesc', 'cvitems', 'inparaenum', 'asparaitem']);
const TABLES = new Set(['tabular', 'tabular*', 'tabularx', 'tabulary', 'longtable', 'array', 'tabu', 'supertabular']);

/**
 * Commands of the resume's own that a later \renewcommand must not change
 * here: they decide where lines break, which the parser depends on.
 */
const KEEP = new Set(['section', 'section*', 'subsection', 'subsection*', 'subsubsection', 'subsubsection*', 'item', 'href', 'url', 'begin', 'end', 'par', 'newline', 'hfill']);

/** Link text that names the kind of link rather than where it goes. */
const GENERIC_LINK =
  /^(linked ?in|github|git ?lab|portfolio|website|web ?site|web|homepage|home ?page|personal (web)?site|blog|e-?mail|mail|phone|resume|cv|twitter|x|link|here|demo|live( demo)?|code|source( code)?|repo(sitory)?|devpost|site|kaggle|leet ?code|medium|orcid|google scholar|scholar|stack ?overflow|behance|dribbble|youtube|video|paper|pdf)$/i;

function tidyAddress(url: string): string {
  return url
    .replace(/^(mailto|tel):/i, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

interface Header {
  name: string;
  position: string;
  contact: string[];
  address: string;
}

const EXPANSION_LIMIT = 50_000;

class Typesetter {
  private macros = new Map<string, Macro>();
  private environments = new Map<string, Environment>();
  /** Open lists: whether their items carry a bullet. */
  private lists: boolean[] = [];
  private expansions = 0;
  private header: Header = { name: '', position: '', contact: [], address: '' };
  private headerShown = false;
  /** Reading the preamble: only definitions and the CV header count. */
  preamble = true;

  constructor(private cvClass: string) {}

  /** Run tokens to the end, writing to `out` (or nowhere). */
  run(tokens: Token[], out: Output | null): void {
    const reader = new Reader(tokens);
    for (let tok = reader.next(); tok; tok = reader.next()) this.step(tok, reader, out);
  }

  /** Text of a short piece (a link's words, an entry's title), on one line. */
  inline(tokens: Token[]): string {
    const out = new Output();
    const lists = this.lists;
    this.lists = [];
    this.run(tokens, out);
    this.lists = lists;
    return out
      .toString()
      .replace(/\s*\n\s*/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  headerLines(): string[] {
    if (this.headerShown || !this.header.name) return [];
    this.headerShown = true;
    const { name, position, contact, address } = this.header;
    return [name, position, contact.filter(Boolean).join(' | '), address].filter(Boolean);
  }

  private define(reader: Reader, kind: 'new' | 'renew' | 'provide'): void {
    const nameTokens = reader.group();
    const target = nameTokens.find((t) => t.t === 'cmd');
    const count = reader.optional();
    const fallback = reader.optional();
    const body = reader.group();
    if (!target || target.t !== 'cmd') return;
    if (kind === 'provide' && this.macros.has(target.v)) return;
    if (KEEP.has(target.v)) return;
    const params = Math.min(9, Math.max(0, Number.parseInt(raw(count ?? []), 10) || 0));
    const args: ArgSpec[] = [];
    for (let k = 0; k < params; k++) args.push(k === 0 && fallback !== null ? { kind: 'o', fallback } : { kind: 'm' });
    this.macros.set(target.v, { args, body });
  }

  private defineDocumentCommand(reader: Reader): void {
    const target = reader.group().find((t) => t.t === 'cmd');
    const spec = reader.group();
    const body = reader.group();
    if (!target || target.t !== 'cmd' || KEEP.has(target.v)) return;
    this.macros.set(target.v, { args: this.argSpec(spec), body });
  }

  private argSpec(spec: Token[]): ArgSpec[] {
    const args: ArgSpec[] = [];
    const reader = new Reader(spec);
    for (let tok = reader.next(); tok; tok = reader.next()) {
      if (tok.t !== 'char') continue;
      if (tok.v === 'm') args.push({ kind: 'm' });
      else if (tok.v === 'o') args.push({ kind: 'o', fallback: [] });
      else if (tok.v === 'O') args.push({ kind: 'o', fallback: reader.group() });
      else if (tok.v === 's') args.push({ kind: 's' });
    }
    return args;
  }

  private defineEnvironment(reader: Reader, kind: 'new' | 'renew'): void {
    const name = raw(reader.group());
    const count = reader.optional();
    const fallback = reader.optional();
    const begin = reader.group();
    const end = reader.group();
    if (!name || (kind === 'new' && this.environments.has(name))) return;
    const params = Math.min(9, Math.max(0, Number.parseInt(raw(count ?? []), 10) || 0));
    const args: ArgSpec[] = [];
    for (let k = 0; k < params; k++) args.push(k === 0 && fallback !== null ? { kind: 'o', fallback } : { kind: 'm' });
    this.environments.set(name, { args, begin, end });
  }

  /** \def\name#1#2{body}: undelimited parameters only. */
  private def(reader: Reader): void {
    const target = reader.next();
    let params = 0;
    for (let tok = reader.peek()[0]; tok && !(tok.t === 'char' && tok.v === '{'); tok = reader.peek()[0]) {
      if (tok.t === 'param') params = Math.max(params, tok.n);
      reader.next();
    }
    const body = reader.group();
    if (!target || target.t !== 'cmd' || KEEP.has(target.v)) return;
    this.macros.set(target.v, { args: Array.from({ length: params }, () => ({ kind: 'm' as const })), body });
  }

  private readArgs(reader: Reader, specs: ArgSpec[]): Token[][] {
    return specs.map((spec) => {
      if (spec.kind === 'm') return reader.group();
      if (spec.kind === 'o') return reader.optional() ?? spec.fallback;
      const star = reader.peekPastSpaces();
      if (star?.t === 'char' && star.v === '*') {
        reader.skipSpaces();
        reader.next();
      }
      return [];
    });
  }

  private substitute(body: Token[], args: Token[][]): Token[] {
    const out: Token[] = [];
    for (const tok of body) {
      if (tok.t === 'param') out.push(...(args[tok.n - 1] ?? []));
      else out.push(tok);
    }
    return out;
  }

  private step(tok: Token, reader: Reader, out: Output | null): void {
    if (tok.t === 'space') return out?.space();
    if (tok.t === 'par') return out?.par();
    if (tok.t === 'param') return;
    if (tok.t === 'char') {
      if (tok.v === '{' || tok.v === '}' || tok.v === '$' || tok.v === '^' || tok.v === '_' || tok.v === '#') return;
      if (tok.v === '&') return out?.gap();
      if (tok.v === '~') return out?.text(' ');
      return out?.text(tok.v);
    }
    this.command(tok.v, reader, out);
  }

  private command(name: string, reader: Reader, out: Output | null): void {
    // The resume's own commands first, as TeX would.
    const macro = this.macros.get(name);
    if (macro && this.expansions < EXPANSION_LIMIT) {
      this.expansions++;
      reader.push(this.substitute(macro.body, this.readArgs(reader, macro.args)));
      return;
    }

    switch (name) {
      case '\u0001line':
        return out?.newline();
      case 'newcommand':
      case 'newcommand*':
        return this.define(reader, 'new');
      case 'renewcommand':
      case 'renewcommand*':
        return this.define(reader, 'renew');
      case 'providecommand':
      case 'providecommand*':
        return this.define(reader, 'provide');
      case 'NewDocumentCommand':
      case 'RenewDocumentCommand':
      case 'DeclareDocumentCommand':
      case 'ProvideDocumentCommand':
        return this.defineDocumentCommand(reader);
      case 'newenvironment':
      case 'newenvironment*':
        return this.defineEnvironment(reader, 'new');
      case 'renewenvironment':
      case 'renewenvironment*':
        return this.defineEnvironment(reader, 'renew');
      case 'def':
      case 'gdef':
      case 'edef':
      case 'xdef':
        return this.def(reader);
      case 'let': {
        const target = reader.next();
        reader.skipSpaces();
        const eq = reader.peek()[0];
        if (eq?.t === 'char' && eq.v === '=') reader.next();
        reader.skipSpaces();
        const source = reader.next();
        if (target?.t === 'cmd' && source?.t === 'cmd' && !KEEP.has(target.v)) {
          const existing = this.macros.get(source.v);
          if (existing) this.macros.set(target.v, existing);
        }
        return;
      }
      case 'IfValueTF':
      case 'IfNoValueTF': {
        const value = reader.group();
        const yes = reader.group();
        const no = reader.group();
        const has = value.some((t) => t.t !== 'space');
        reader.push((name === 'IfValueTF') === has ? yes : no);
        return;
      }
      case 'IfValueT':
      case 'IfNoValueT': {
        const has = reader.group().some((t) => t.t !== 'space');
        const yes = reader.group();
        if ((name === 'IfValueT') === has) reader.push(yes);
        return;
      }
      case 'IfBooleanTF': {
        reader.group();
        reader.group();
        reader.push(reader.group());
        return;
      }
      case 'IfBooleanT':
        reader.group();
        reader.group();
        return;
    }

    const plain = name.replace(/\*$/, '');
    if (HEADINGS.has(plain)) {
      reader.optional();
      const title = reader.group();
      out?.par();
      reader.push([...title, LINE_END]);
      return;
    }

    switch (name) {
      case 'item': {
        const label = reader.optional();
        out?.newline();
        if (label !== null) {
          const text = this.inline(label);
          if (text) out?.text(`${text} `);
          return;
        }
        const bullets = this.lists[this.lists.length - 1] ?? true;
        if (bullets && !this.tableNext(reader)) out?.text('• ');
        return;
      }
      case 'begin':
        return this.begin(raw(reader.group()), reader, out);
      case 'end': {
        const env = raw(reader.group());
        const own = this.environments.get(env);
        if (own) {
          reader.push([...own.end, LINE_END]);
          return;
        }
        if (LISTS.has(env) || env === 'list') this.lists.pop();
        return out?.newline();
      }
      case '\\': {
        const star = reader.peek()[0];
        if (star?.t === 'char' && star.v === '*') reader.next();
        reader.optional();
        return out?.newline();
      }
      case 'newline':
      case 'linebreak':
      case 'cr':
        reader.optional();
        return out?.newline();
      case 'par':
        return out?.par();
      case 'hfill':
      case 'hfil':
      case 'hss':
      case 'dotfill':
      case 'hrulefill':
        return out?.gap();
      case 'hspace':
      case 'hspace*':
        if (/fill/.test(raw(reader.group()))) return out?.gap();
        return out?.space();
      case 'vskip':
      case 'hskip':
      case 'kern':
        reader.dimension();
        return;
      case 'href': {
        const url = address(reader.group());
        const words = this.inline(reader.group());
        out?.text(words && !GENERIC_LINK.test(words) ? words : tidyAddress(url));
        return;
      }
      case 'url':
      case 'nolinkurl':
      case 'path':
        out?.text(address(reader.group()));
        return;
      case 'verb':
      case 'verb*': {
        const delimiter = reader.next();
        if (delimiter?.t !== 'char') return;
        let text = '';
        for (let t = reader.next(); t && !(t.t === 'char' && t.v === delimiter.v); t = reader.next()) {
          text += t.t === 'char' ? t.v : t.t === 'space' ? ' ' : t.t === 'cmd' ? `\\${t.v}` : '';
        }
        out?.text(text);
        return;
      }
      case 'makecvtitle':
      case 'makecvheader':
      case 'maketitle': {
        const lines = this.headerLines();
        if (lines.length && out) {
          out.newline();
          for (const line of lines) {
            out.text(line);
            out.newline();
          }
          out.par();
        }
        reader.optional();
        return;
      }
    }

    if (this.preamble && this.headerCommand(name, reader)) return;
    if (this.cvCommand(name, reader, out)) return;

    const accent = ACCENTS[name];
    if (accent !== undefined) {
      const base = this.inline(reader.group()).replace(/^ı/, 'i').replace(/^ȷ/, 'j');
      out?.text(base ? `${base.slice(0, 1)}${accent}${base.slice(1)}`.normalize('NFC') : '');
      return;
    }
    const symbol = SYMBOLS[name];
    if (symbol !== undefined) {
      // \LaTeX{} and similar take an empty group after them.
      if (/^[A-Za-z]/.test(name) && name.length > 1) {
        const next = reader.peek(2);
        if (next[0]?.t === 'char' && next[0].v === '{' && next[1]?.t === 'char' && next[1].v === '}') {
          reader.next();
          reader.next();
        }
      }
      return out?.text(symbol);
    }
    if (NOTHING.has(name)) return;

    const settings = SETTINGS[name];
    if (settings) {
      if (settings[1]) reader.optional();
      for (let k = 0; k < settings[0]; k++) reader.group();
      return;
    }
    const wrapper = WRAPPERS[name];
    if (wrapper !== undefined) {
      while (reader.optional() !== null);
      for (let k = 0; k < wrapper; k++) {
        reader.group();
        while (reader.optional() !== null);
      }
      reader.push(reader.group());
      return;
    }
    if (FORMAT.has(name)) {
      reader.push(reader.group());
      return;
    }
    if (/^(MakeUppercase|MakeTextUppercase|uppercase)$/.test(name)) return out?.text(this.inline(reader.group()).toUpperCase());
    if (/^(MakeLowercase|MakeTextLowercase|lowercase)$/.test(name)) return out?.text(this.inline(reader.group()).toLowerCase());

    // Icons (Font Awesome, academicons) set no words.
    if (/^(fa|ai)[A-Z]/.test(name)) return;

    // Anything else is defined in a file this one doesn't include. Keep the
    // words of its arguments, apart from one another, and take a hint from
    // its name: \cvItem and \resumeItem make bullets, \jobHeading a line.
    if (!/^[A-Za-z@]/.test(name)) return;
    const args: Token[][] = [];
    while (reader.groupNext() && args.length < 9) args.push(reader.group());
    if (args.length && /item/i.test(name) && !/list/i.test(name)) {
      out?.newline();
      out?.text('• ');
      reader.push([...args.flatMap((arg, k) => (k ? [{ t: 'char', v: ' ' } as Token, ...arg] : arg)), LINE_END]);
      return;
    }
    if (args.length && /heading|entry|title/i.test(name)) out?.newline();
    if (args.length <= 1) {
      reader.push(args[0] ?? []);
      return;
    }
    const joined: Token[] = [];
    args.forEach((arg, k) => {
      if (k > 0) joined.push({ t: 'char', v: '&' });
      joined.push(...arg);
    });
    reader.push([...joined, LINE_END]);
  }

  /** Is the next thing (after spaces) a table? A list item holding one is an entry's heading, not a bullet. */
  private tableNext(reader: Reader): boolean {
    const ahead = reader.peek(24).filter((t) => t.t !== 'space');
    if (!(ahead[0]?.t === 'cmd' && ahead[0].v === 'begin')) return false;
    const name = ahead
      .slice(2)
      .map((t) => (t.t === 'char' ? t.v : '|'))
      .join('')
      .split('}')[0]!;
    return TABLES.has(name);
  }

  private begin(env: string, reader: Reader, out: Output | null): void {
    const own = this.environments.get(env);
    if (own && this.expansions < EXPANSION_LIMIT) {
      this.expansions++;
      reader.push([LINE_END, ...this.substitute(own.begin, this.readArgs(reader, own.args))]);
      return;
    }
    if (env === 'comment') {
      // Skip to \end{comment}.
      for (let tok = reader.next(); tok; tok = reader.next()) {
        if (tok.t === 'cmd' && tok.v === 'end' && raw(reader.group()) === 'comment') return;
      }
      return;
    }
    out?.newline();
    if (LISTS.has(env)) {
      const options = raw(reader.optional() ?? []);
      const unlabelled = env === 'description' || env === 'compactdesc' || /label\s*=\s*(\{\s*\}|\\empty\b|(?=,|$))/.test(options);
      this.lists.push(!unlabelled);
      return;
    }
    if (TABLES.has(env)) {
      if (env !== 'tabular' && env !== 'array' && env !== 'longtable' && env !== 'tabu' && env !== 'supertabular') reader.group();
      reader.optional();
      reader.group();
      return;
    }
    switch (env) {
      case 'minipage':
        while (reader.optional() !== null);
        reader.group();
        return;
      case 'multicols':
      case 'multicols*':
        reader.group();
        reader.optional();
        return;
      case 'adjustwidth':
      case 'adjustwidth*':
        reader.group();
        reader.group();
        return;
      case 'list': {
        const label = raw(reader.group());
        reader.group();
        this.lists.push(label !== '');
        return;
      }
      case 'cvskills':
      case 'cventries':
      case 'cvhonors':
      case 'cvparagraph':
        return;
    }
  }

  /** The contact details CV classes take in the preamble, shown by \makecvtitle or \makecvheader. */
  private headerCommand(name: string, reader: Reader): boolean {
    const h = this.header;
    switch (name) {
      case 'name': {
        const first = this.inline(reader.group());
        const last = reader.groupNext() ? this.inline(reader.group()) : '';
        h.name = [first, last].filter(Boolean).join(' ');
        return true;
      }
      case 'firstname':
        h.name = [this.inline(reader.group()), h.name].filter(Boolean).join(' ');
        return true;
      case 'familyname':
      case 'lastname':
        h.name = [h.name, this.inline(reader.group())].filter(Boolean).join(' ');
        return true;
      case 'position':
      case 'title':
      case 'tagline':
        h.position = this.inline(reader.group());
        return true;
      case 'author':
        if (!h.name) h.name = this.inline(reader.group());
        else reader.group();
        return true;
      case 'address': {
        const parts: string[] = [];
        while (reader.groupNext() && parts.length < 3) parts.push(this.inline(reader.group()));
        h.address = parts.filter(Boolean).join(', ');
        return true;
      }
      case 'phone':
      case 'mobile':
        reader.optional();
        h.contact.push(this.inline(reader.group()));
        return true;
      case 'email':
        h.contact.push(address(reader.group()));
        return true;
      case 'homepage':
        h.contact.push(tidyAddress(address(reader.group())));
        return true;
      case 'social': {
        const kind = raw(reader.optional() ?? []).toLowerCase();
        const handle = address(reader.group());
        const base: Record<string, string> = { linkedin: 'linkedin.com/in/', github: 'github.com/', gitlab: 'gitlab.com/', twitter: 'x.com/', x: 'x.com/' };
        h.contact.push(handle.includes('/') || !base[kind] ? tidyAddress(handle) : `${base[kind]}${handle}`);
        return true;
      }
      case 'linkedin':
        h.contact.push(`linkedin.com/in/${address(reader.group())}`);
        return true;
      case 'github':
        h.contact.push(`github.com/${address(reader.group())}`);
        return true;
      case 'gitlab':
        h.contact.push(`gitlab.com/${address(reader.group())}`);
        return true;
    }
    return false;
  }

  /** The entry commands moderncv and awesome-cv provide. */
  private cvCommand(name: string, reader: Reader, out: Output | null): boolean {
    const line = (...parts: string[]) => {
      const [left = '', ...right] = parts;
      const text = [left, right.filter(Boolean).join(', ')].filter(Boolean);
      if (!text.length || !out) return;
      out.newline();
      out.text(text[0]!);
      if (text[1]) {
        out.gap();
        out.text(text[1]);
      }
      out.newline();
    };
    switch (name) {
      case 'cventry': {
        reader.optional();
        const args: Token[][] = [];
        while (reader.groupNext() && args.length < 6) args.push(reader.group());
        const text = args.map((a) => this.inline(a));
        let description: Token[] = [];
        if (args.length >= 6 || this.cvClass === 'moderncv') {
          // moderncv: {dates}{title}{employer}{city}{grade}{description}
          const [dates = '', title = '', employer = '', city = '', grade = ''] = text;
          line(title, dates);
          line(employer, city);
          line(grade);
          description = args[5] ?? [];
        } else {
          // awesome-cv: {position}{organisation}{location}{dates}{description}
          const [position = '', organisation = '', location = '', dates = ''] = text;
          line(position, dates);
          line(organisation, location);
          description = args[4] ?? [];
        }
        reader.push([...description, LINE_END]);
        return true;
      }
      case 'cvitem': {
        reader.optional();
        const head = this.inline(reader.group());
        const body = reader.group();
        out?.newline();
        if (head) out?.text(`${head}: `);
        reader.push([...body, LINE_END]);
        return true;
      }
      case 'cvdoubleitem': {
        const parts = [reader.group(), reader.group(), reader.group(), reader.group()].map((a) => this.inline(a));
        line(parts[0] ? `${parts[0]}: ${parts[1]}` : parts[1]!);
        line(parts[2] ? `${parts[2]}: ${parts[3]}` : parts[3]!);
        return true;
      }
      case 'cvlistitem':
        reader.optional();
        line(`• ${this.inline(reader.group())}`);
        return true;
      case 'cvlistdoubleitem':
        reader.optional();
        line(`• ${this.inline(reader.group())}`);
        line(`• ${this.inline(reader.group())}`);
        return true;
      case 'cvitemwithcomment': {
        reader.optional();
        const [head, body, comment] = [reader.group(), reader.group(), reader.group()].map((a) => this.inline(a));
        line([head ? `${head}: ${body}` : body, comment].filter(Boolean).join(' '));
        return true;
      }
      case 'cvskill': {
        const [kind, skills] = [reader.group(), reader.group()].map((a) => this.inline(a));
        line(kind ? `${kind}: ${skills}` : skills!);
        return true;
      }
      case 'cvhonor': {
        const [award, event, location, date] = [reader.group(), reader.group(), reader.group(), reader.group()].map((a) => this.inline(a));
        line([award, event, location].filter(Boolean).join(', '), date!);
        return true;
      }
    }
    return false;
  }
}

function documentClass(tokens: Token[]): string {
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k]!;
    if (tok.t === 'cmd' && tok.v === 'documentclass') {
      const reader = new Reader(tokens.slice(k + 1));
      reader.optional();
      return raw(reader.group());
    }
  }
  return '';
}

/** Where the document body starts and ends, by token index. */
function bodyRange(tokens: Token[]): { start: number; end: number } {
  const at = (env: 'begin' | 'end'): number => {
    for (let k = 0; k < tokens.length - 1; k++) {
      const tok = tokens[k]!;
      if (tok.t !== 'cmd' || tok.v !== env) continue;
      const word = tokens
        .slice(k + 1, k + 12)
        .map((t) => (t.t === 'char' ? t.v : ' '))
        .join('');
      if (/^\s*\{document\}/.test(word)) return k;
    }
    return -1;
  };
  const begin = at('begin');
  const end = at('end');
  if (begin < 0) return { start: 0, end: end < 0 ? tokens.length : end };
  // Past "\begin{document}" itself.
  let start = begin + 1;
  let closed = 0;
  while (start < tokens.length && closed === 0) {
    const tok = tokens[start]!;
    if (tok.t === 'char' && tok.v === '}') closed++;
    start++;
  }
  return { start, end: end < 0 ? tokens.length : end };
}

function tidy(text: string): string {
  const lines = text
    .normalize('NFC')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/`/g, '‘')
    .split('\n')
    .map((line) =>
      line
        .replace(/ {2,}/g, ' ')
        .replace(/ *\t[\t ]*/g, '\t')
        .replace(/^[\t ]+|[\t ]+$/g, '')
        .replace(/\t/g, '    '),
    )
    // A list item with nothing in it, or a line with only a separator.
    .filter((line) => !/^[•|·,;:]?$/.test(line) || line === '');

  const out: string[] = [];
  for (const line of lines) {
    if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(line);
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

/** The text a LaTeX resume would print, laid out for the resume parser. */
export function latexToText(source: string): string {
  const tokens = tokenize(source);
  const typesetter = new Typesetter(documentClass(tokens));
  const { start, end } = bodyRange(tokens);
  // The preamble only defines things: run it for its definitions, and for
  // the contact details CV classes take there.
  typesetter.run(tokens.slice(0, start), null);
  typesetter.preamble = false;
  const out = new Output();
  typesetter.run(tokens.slice(start, end), out);
  // A CV class header the document never printed still belongs at the top.
  const header = typesetter.headerLines();
  const text = out.toString();
  return tidy(header.length ? `${header.join('\n')}\n\n${text}` : text);
}

/** Does this text look like LaTeX source rather than a finished resume? */
export function looksLikeLatex(text: string): boolean {
  if (/\\documentclass\b|\\begin\{document\}/.test(text)) return true;
  const markers = text.match(/\\(section\*?\{|subsection\*?\{|begin\{(itemize|enumerate|tabular\*?)\}|end\{(itemize|enumerate)\}|item\b|textbf\{|href\{|resume\w+|cventry|cvitem)/g) ?? [];
  return new Set(markers).size >= 3;
}
