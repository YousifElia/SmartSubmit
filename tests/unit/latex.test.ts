import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseResumeText } from '@/core/resume/heuristics';
import { latexToText, looksLikeLatex } from '@/core/resume/latex';

const fixture = (name: string) => readFileSync(resolve(import.meta.dirname, '../fixtures', name), 'utf8');

/** A document body with the usual wrapping. */
const doc = (body: string, preamble = '') => `\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe('latexToText: a one-page resume with commands of its own', () => {
  const text = latexToText(fixture('resume.tex'));

  it('prints what the document typesets, a line per heading row and a bullet per item', () => {
    expect(text).toBe(
      [
        'Avery Testerson',
        '519-555-0142 | avery.testerson@example.com | linkedin.com/in/avery-testerson | github.com/averytesterson',
        '',
        'Education',
        'University of Windsor    Windsor, ON',
        'Bachelor of Computer Science (Honours), Minor in Mathematics    Sep. 2023 – May 2027',
        '',
        'Experience',
        '',
        'Software Developer Intern    May 2025 – Aug. 2025',
        'Northwind Systems    Toronto, ON',
        '• Built a telemetry pipeline in Go and Kafka handling 40% more events per second',
        '• Cut dashboard load time from 6 s to 1.2 s by caching queries in Redis',
        '',
        'Teaching Assistant    Jan. 2024 – Apr. 2025',
        'University of Windsor    Windsor, ON',
        '• Ran weekly labs for 60 students in Data Structures & Algorithms',
        '',
        'Projects',
        'Shelfie | TypeScript, React, PostgreSQL    Jan. 2025 – Present',
        '• Wrote a book-swap web app used by 300 students, with search and résumé-style profiles',
        '',
        'Technical Skills',
        'Languages: Java, Python, C/C++, SQL, TypeScript',
        'Frameworks: React, Node.js, Flask',
        'Developer Tools: Git, Docker, AWS',
      ].join('\n'),
    );
  });

  it('reads into the same sections a PDF of it would give', () => {
    const resume = parseResumeText(text);
    expect(resume.basics).toMatchObject({
      name: 'Avery Testerson',
      email: 'avery.testerson@example.com',
      phone: '519-555-0142',
      links: ['linkedin.com/in/avery-testerson', 'github.com/averytesterson'],
    });
    expect(resume.education).toEqual([
      expect.objectContaining({ school: 'University of Windsor', location: 'Windsor, ON', start: 'Sep. 2023', end: 'May 2027' }),
    ]);
    expect(resume.experience.map((e) => [e.title, e.company, e.start, e.end, e.bullets.length])).toEqual([
      ['Software Developer Intern', 'Northwind Systems', 'May 2025', 'Aug. 2025', 2],
      ['Teaching Assistant', 'University of Windsor', 'Jan. 2024', 'Apr. 2025', 1],
    ]);
    expect(resume.projects).toEqual([expect.objectContaining({ name: 'Shelfie', subtitle: 'TypeScript, React, PostgreSQL', end: 'Present' })]);
    expect(resume.skills.map((g) => g.category)).toEqual(['Languages', 'Frameworks', 'Developer Tools']);
  });

  it('leaves out commented lines', () => {
    expect(text).not.toContain('commented out');
  });
});

describe('latexToText: CV classes', () => {
  it('reads moderncv: the header from the preamble, and its entries', () => {
    const text = latexToText(`
\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{classic}
\\moderncvcolor{blue}
\\usepackage[scale=0.75]{geometry}
\\name{Avery}{Testerson}
\\title{Software Developer}
\\address{401 Sunset Ave}{Windsor, ON}{Canada}
\\phone[mobile]{+1~(519)~555~0142}
\\email{avery.testerson@example.com}
\\social[linkedin]{avery-testerson}
\\social[github]{averytesterson}
\\begin{document}
\\makecvtitle
\\section{Education}
\\cventry{2023--2027}{Bachelor of Computer Science}{University of Windsor}{Windsor, ON}{GPA 3.8}{}
\\section{Experience}
\\cventry{May 2025--Aug. 2025}{Software Developer Intern}{Northwind Systems}{Toronto, ON}{}{%
\\begin{itemize}
\\item Built a telemetry pipeline
\\item Cut dashboard load time
\\end{itemize}}
\\section{Skills}
\\cvitem{Languages}{Java, Python}
\\cvdoubleitem{Tools}{Git, Docker}{Cloud}{AWS}
\\end{document}`);
    expect(text).toBe(
      [
        'Avery Testerson',
        'Software Developer',
        '+1 (519) 555 0142 | avery.testerson@example.com | linkedin.com/in/avery-testerson | github.com/averytesterson',
        '401 Sunset Ave, Windsor, ON, Canada',
        '',
        'Education',
        'Bachelor of Computer Science    2023–2027',
        'University of Windsor    Windsor, ON',
        'GPA 3.8',
        '',
        'Experience',
        'Software Developer Intern    May 2025–Aug. 2025',
        'Northwind Systems    Toronto, ON',
        '• Built a telemetry pipeline',
        '• Cut dashboard load time',
        '',
        'Skills',
        'Languages: Java, Python',
        'Tools: Git, Docker',
        'Cloud: AWS',
      ].join('\n'),
    );
    const resume = parseResumeText(text);
    expect(resume.basics.name).toBe('Avery Testerson');
    expect(resume.experience[0]).toMatchObject({ title: 'Software Developer Intern', company: 'Northwind Systems', bullets: ['Built a telemetry pipeline', 'Cut dashboard load time'] });
    expect(resume.education[0]).toMatchObject({ school: 'University of Windsor' });
  });

  it('reads awesome-cv: its own entry order, sections and skills', () => {
    const text = latexToText(`
\\documentclass[11pt, a4paper]{awesome-cv}
\\name{Avery}{Testerson}
\\position{Software Developer{\\enskip\\cdotp\\enskip}Student}
\\mobile{(519) 555-0142}
\\email{avery.testerson@example.com}
\\github{averytesterson}
\\linkedin{avery-testerson}
\\begin{document}
\\makecvheader
\\cvsection{Experience}
\\begin{cventries}
  \\cventry
    {Software Developer Intern} % Job title
    {Northwind Systems} % Organization
    {Toronto, ON} % Location
    {May 2025 - Aug. 2025} % Date(s)
    {
      \\begin{cvitems}
        \\item {Built a telemetry pipeline}
      \\end{cvitems}
    }
\\end{cventries}
\\cvsection{Skills}
\\begin{cvskills}
  \\cvskill{Languages}{Java, Python, TypeScript}
\\end{cvskills}
\\cvsection{Honors}
\\begin{cvhonors}
  \\cvhonor{Dean's List}{University of Windsor}{Windsor, ON}{2024}
\\end{cvhonors}
\\end{document}`);
    expect(text).toContain('Avery Testerson\n');
    expect(text).toContain('(519) 555-0142 | avery.testerson@example.com | github.com/averytesterson | linkedin.com/in/avery-testerson');
    expect(text).toContain('Experience\nSoftware Developer Intern    May 2025 - Aug. 2025\nNorthwind Systems    Toronto, ON\n• Built a telemetry pipeline');
    expect(text).toContain('Skills\nLanguages: Java, Python, TypeScript');
    expect(text).toContain("Dean's List, University of Windsor, Windsor, ON    2024");
    const resume = parseResumeText(text);
    expect(resume.experience[0]).toMatchObject({ title: 'Software Developer Intern', company: 'Northwind Systems', start: 'May 2025', end: 'Aug. 2025' });
  });
});

describe('latexToText: the details', () => {
  it('undoes escapes, accents, dashes and quotes', () => {
    expect(latexToText(doc("R\\&D at Caf\\'e Gr\\\"un, 100\\% \\$ \\#1 C\\_lang --- ``fast'' -- 2024 \\c{c}a \\'{\\i}cono \\o"))).toBe(
      'R&D at Café Grün, 100% $ #1 C_lang — “fast” – 2024 ça ícono ø',
    );
  });

  it('shows a link as its words, or as its address when the words only name the kind of link', () => {
    expect(latexToText(doc('\\href{https://github.com/a/shelfie}{\\textbf{Shelfie}}'))).toBe('Shelfie');
    expect(latexToText(doc('\\href{https://www.linkedin.com/in/avery/}{\\faLinkedin\\ LinkedIn} $|$ \\href{mailto:a@b.co}{\\faEnvelope}'))).toBe(
      'linkedin.com/in/avery | a@b.co',
    );
    expect(latexToText(doc('\\url{https://avery.dev/~me}'))).toBe('https://avery.dev/~me');
  });

  it('expands \\def, optional arguments, document commands and environments of the file’s own', () => {
    const preamble = [
      '\\def\\role#1#2{\\textbf{#1} \\hfill #2\\\\}',
      '\\newcommand{\\job}[2][Remote]{#2 (#1)}',
      '\\NewDocumentCommand{\\tech}{m O{none}}{#1: #2}',
      '\\newenvironment{bullets}{\\begin{itemize}}{\\end{itemize}}',
    ].join('\n');
    expect(latexToText(doc('\\role{Intern}{2025}\n\\job{Acme} \\job[Toronto]{Initech}\n\n\\tech{Go}[gRPC]\n\\begin{bullets}\\item One\\item Two\\end{bullets}', preamble))).toBe(
      ['Intern    2025', 'Acme (Remote) Initech (Toronto)', '', 'Go: gRPC', '• One', '• Two'].join('\n'),
    );
  });

  it('keeps headings and line breaks even when the file restyles \\section', () => {
    const preamble = '\\renewcommand{\\section}[1]{\\textbf{#1}\\hrule}';
    expect(latexToText(doc('\\section*{Experience}Built things.\\\\[2pt]Shipped things.', preamble))).toBe('Experience\nBuilt things.\nShipped things.');
  });

  it('reads description lists, lists without bullets, and skips comment blocks and settings', () => {
    const body = [
      '\\begin{description}\\item[Languages:] Java, Go\\end{description}',
      '\\begin{itemize}[label={}]\\item Plain line\\end{itemize}',
      '\\begin{comment}Hidden\\end{comment}',
      '\\vspace{-3pt}\\setlength{\\parskip}{0pt}\\vskip 2pt\\color{blue}Visible',
    ].join('\n');
    expect(latexToText(doc(body))).toBe(['Languages: Java, Go', 'Plain line', 'Visible'].join('\n'));
  });

  it('guesses from their names what commands from another file do', () => {
    // \resumeItem and \jobHeading live in a .cls this file doesn't include.
    expect(latexToText(doc('\\jobHeading{Intern}{Acme}\n\\resumeItem{Built a thing}\n\\resumeItem{Fixed a thing}'))).toBe(
      ['Intern    Acme', '• Built a thing', '• Fixed a thing'].join('\n'),
    );
  });

  it('stops expanding a command that never ends', () => {
    const started = Date.now();
    const text = latexToText(doc('\\loop', '\\def\\loop{\\loop}'));
    expect(text).toBe('');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('reads a fragment without \\begin{document}', () => {
    expect(latexToText('\\section{Skills}\n\\textbf{Languages}{: Go, Rust}')).toBe('Skills\nLanguages: Go, Rust');
  });
});

describe('looksLikeLatex', () => {
  it('tells LaTeX source from a resume’s text', () => {
    expect(looksLikeLatex(fixture('resume.tex'))).toBe(true);
    expect(looksLikeLatex('\\section{Experience}\n\\begin{itemize}\n\\item Built things\n\\end{itemize}')).toBe(true);
    expect(looksLikeLatex('Avery Testerson\nExperience\n• Built a C\\C++ tool')).toBe(false);
  });
});
