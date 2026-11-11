/**
 * Keyword match: how much of what a job asks for appears in a resume.
 *
 * Keywords come from a dictionary of skills, tools and qualifications (each
 * with its common spellings), plus technical-looking terms the dictionary
 * does not know, taken from the requirement sections. A keyword counts for
 * more when it sits under a "Requirements" heading than under "Benefits".
 *
 * The score is deliberately simple and explainable: it is the share of the
 * job's weighted keywords that the resume mentions, and every keyword is
 * listed as matched or missing so the user can see why.
 */
import type { RichBlock, ResumeDoc } from '../types';
import { countriesIn } from './extract';

export interface Keyword {
  /** Display name, e.g. "PostgreSQL". */
  name: string;
  kind: 'hard' | 'soft';
  weight: number;
  /** Where it was found: 'required', 'preferred' or 'other'. */
  section: SectionKind;
}

export interface MatchReport {
  /** 0–100. */
  score: number;
  matched: Keyword[];
  missing: Keyword[];
}

type SectionKind = 'required' | 'preferred' | 'other' | 'about' | 'skip';

interface Skill {
  name: string;
  kind: 'hard' | 'soft';
  patterns: RegExp[];
}

// Boundaries that treat "C++", "C#", ".NET" and "Node.js" as whole words.
const BEFORE = '(?<![A-Za-z0-9+#.\\-])';
const AFTER = '(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])';
const LIST_BEFORE = '(?<=(?:^|[\\n,/(;:]\\s*|\\band\\s|\\bor\\s|\\bin\\s|\\bwith\\s))';
const LIST_AFTER = '(?=\\s*(?:[\\n,/);]|$|\\band\\b|\\bor\\b))';

/** Escape for a regular expression; a space also matches a hyphen or nothing ("machine-learning"). */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s-]{0,2}');
}

/**
 * An alias: plain words match case-insensitively; a leading "=" makes it
 * case-sensitive; a leading "~" also requires it to appear in a list
 * ("Python, Go and Java"), for names that are ordinary words elsewhere.
 */
function compile(alias: string): RegExp {
  if (alias.startsWith('~')) {
    const word = escape(alias.slice(1));
    return new RegExp(`${LIST_BEFORE}${word}${LIST_AFTER}|${BEFORE}${word}(?=\\s*\\()`, 'g');
  }
  if (alias.startsWith('=')) return new RegExp(`${BEFORE}${escape(alias.slice(1))}${AFTER}`, 'g');
  return new RegExp(`${BEFORE}${escape(alias)}${AFTER}`, 'gi');
}

function skills(kind: 'hard' | 'soft', table: string): Skill[] {
  return table
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...aliases] = line.split('|').map((s) => s.trim());
      const all = aliases.length > 0 ? aliases : [name!];
      return { name: name!.replace(/^[=~]/, ''), kind, patterns: all.map(compile) };
    });
}

// name | aliases… (the name itself is only matched when listed as an alias)
const HARD = skills(
  'hard',
  `
Python | Python | Python3
Java | =Java
JavaScript | JavaScript | =JS | ES6 | ECMAScript
TypeScript | TypeScript
C | ~C
C++ | C++ | CPP
C# | C# | C Sharp
Go | Golang | ~Go
Rust | =Rust
Ruby | =Ruby
PHP | PHP
Swift | =Swift
Kotlin | Kotlin
Scala | =Scala
R | ~R
MATLAB | MATLAB
SQL | SQL
Bash | Bash | shell scripting | =Shell
Perl | Perl
Haskell | Haskell
Elixir | Elixir
Dart | =Dart
Objective-C | Objective-C | ObjC
Lua | =Lua
Julia | ~Julia
Solidity | Solidity
Verilog | Verilog | SystemVerilog
VHDL | VHDL
Assembly | =Assembly | assembly language | x86 assembly | ARM assembly
CUDA | CUDA
HTML | HTML | HTML5
CSS | CSS | CSS3 | Sass | SCSS
React | React | React.js | ReactJS
React Native | React Native
Angular | Angular | AngularJS
Vue | Vue | Vue.js | VueJS
Svelte | Svelte | SvelteKit
Next.js | Next.js | NextJS
Node.js | Node.js | NodeJS | =Node
Express | Express.js | ~Express
Django | Django
Flask | Flask
FastAPI | FastAPI
Spring | Spring Boot | Spring Framework | =Spring MVC
Ruby on Rails | Ruby on Rails | =Rails
.NET | .NET | ASP.NET | dotnet
GraphQL | GraphQL
REST APIs | =REST | RESTful | REST API | REST APIs
gRPC | gRPC
Redux | Redux
Tailwind | Tailwind | TailwindCSS
jQuery | jQuery
PostgreSQL | PostgreSQL | Postgres
MySQL | MySQL
MongoDB | MongoDB | Mongo
Redis | Redis
SQLite | SQLite
Oracle | =Oracle
SQL Server | SQL Server | MSSQL
Cassandra | Cassandra
DynamoDB | DynamoDB
Elasticsearch | Elasticsearch | OpenSearch
Kafka | Kafka
RabbitMQ | RabbitMQ
Spark | =Spark | PySpark | Apache Spark
Hadoop | Hadoop
Airflow | Airflow
dbt | =dbt
Snowflake | =Snowflake
BigQuery | BigQuery
Redshift | Redshift
Databricks | Databricks
Pandas | Pandas
NumPy | NumPy
scikit-learn | scikit-learn | sklearn
TensorFlow | TensorFlow
PyTorch | PyTorch
Keras | Keras
Hugging Face | Hugging Face | HuggingFace
Tableau | Tableau
Power BI | Power BI | PowerBI
Looker | Looker
Excel | =Excel | Microsoft Excel
ETL | ETL | ELT
Machine learning | machine learning | =ML
Deep learning | deep learning
NLP | NLP | natural language processing
Computer vision | computer vision
LLMs | LLM | LLMs | large language models | generative AI | GenAI
AI | =AI | artificial intelligence
Statistics | statistics | statistical analysis | statistical modeling
A/B testing | A/B testing | AB testing | experimentation
Data analysis | data analysis | data analytics
Data visualization | data visualization
Data modeling | data modeling | data modelling
AWS | AWS | Amazon Web Services
Azure | Azure
GCP | GCP | Google Cloud
Docker | Docker | containers | containerization
Kubernetes | Kubernetes | =K8s | k8s
Terraform | Terraform
Ansible | Ansible
Jenkins | Jenkins
GitHub Actions | GitHub Actions
CI/CD | CI/CD | continuous integration | continuous delivery | continuous deployment
Linux | Linux
Unix | Unix
Git | =Git | GitHub | GitLab
Microservices | microservices | microservice
Distributed systems | distributed systems
Serverless | serverless | Lambda
Observability | observability | Prometheus | Grafana | Datadog
Networking | TCP/IP | networking protocols | computer networking
iOS | iOS
Android | Android
Flutter | Flutter
SwiftUI | SwiftUI
Unity | =Unity
Unreal Engine | Unreal Engine | Unreal
Jest | =Jest
Cypress | Cypress
Selenium | Selenium
Playwright | Playwright
JUnit | JUnit
pytest | pytest
Unit testing | unit testing | unit tests | automated testing | test automation
TDD | TDD | test-driven development
Security | application security | cloud security | cybersecurity | information security | =AppSec
OWASP | OWASP
IAM | =IAM | identity and access management
SIEM | SIEM
Penetration testing | penetration testing | pentesting | pen testing
Cryptography | cryptography | encryption
SOC 2 | SOC 2 | SOC2
Figma | Figma
Sketch | =Sketch
Adobe XD | Adobe XD
Photoshop | Photoshop
Illustrator | =Illustrator
Adobe Creative Suite | Adobe Creative Suite | Adobe Creative Cloud
UX design | UX | user experience
UI design | =UI | user interface design
Wireframing | wireframing | wireframes
Prototyping | prototyping | prototypes
User research | user research | usability testing
Agile | Agile
Scrum | Scrum
Kanban | Kanban
Jira | Jira
Confluence | Confluence
Product management | product management
Roadmapping | roadmapping | product roadmap
Salesforce | Salesforce
HubSpot | HubSpot
SAP | =SAP
QuickBooks | QuickBooks
Financial modeling | financial modeling | financial modelling
Accounting | accounting
GAAP | GAAP | IFRS
Forecasting | forecasting
Budgeting | budgeting
CRM | CRM
SEO | SEO | search engine optimization
SEM | SEM | Google Ads
Google Analytics | Google Analytics | GA4
Content marketing | content marketing
Social media | social media
Copywriting | copywriting
Embedded systems | embedded systems | embedded software | firmware
RTOS | RTOS
FPGA | FPGA
PCB design | PCB
Microcontrollers | microcontrollers | microcontroller | =MCU
Arduino | Arduino
Raspberry Pi | Raspberry Pi
ROS | =ROS | ROS2 | Robot Operating System
CAD | CAD software | CAD tools | CAD modeling | CAD modelling | computer-aided design | computer aided design | ~CAD
SolidWorks | SolidWorks
AutoCAD | AutoCAD
PLC | PLC | PLCs
Six Sigma | Six Sigma
Lean | =Lean manufacturing
PMP | PMP
CPA | =CPA
CFA | =CFA
CISSP | CISSP
Security+ | Security+ | CompTIA Security+
CCNA | CCNA
Customer service | customer service | customer support
Microsoft Office | Microsoft Office | MS Office | Office 365 | Microsoft 365 | PowerPoint | Microsoft Word
Sales | =Sales | business development
`,
);

const SOFT = skills(
  'soft',
  `
Communication | communication skills | communicate effectively | written and verbal communication | verbal and written communication | excellent communication
Leadership | leadership
Teamwork | teamwork | team player | collaborate | collaboration | collaborative
Problem solving | problem solving | problem-solving | solve problems
Project management | project management
Stakeholder management | stakeholder management | stakeholders
Mentoring | mentoring | mentorship | coaching
Presentation skills | presentation skills | presenting
Time management | time management | prioritize | prioritization
Attention to detail | attention to detail | detail-oriented | detail oriented
Analytical skills | analytical skills | analytical thinking | analytical mindset
Critical thinking | critical thinking
Ownership | ownership | self-starter | self-motivated
Adaptability | adaptability | adaptable | fast-paced environment
`,
);

/** Section headings, by how much the keywords under them matter. */
function sectionKind(heading: string): SectionKind {
  const h = heading.toLowerCase();
  if (/nice[- ]to[- ]have|bonus|preferred|pluses|a plus|would be great|ideally|desired|extra credit|stand out/.test(h)) return 'preferred';
  // Pay, benefits and legal text say nothing about the skills wanted.
  if (/benefit|perk|compensation|salary|pay range|pay transparency|equal (employment )?opportunit|eeo|accommodation|privacy|notice|disclaimer|referral|legal|what we offer|we offer|total rewards/.test(h)) {
    return 'skip';
  }
  if (/about (us|the company)|who we are|our (team|story|culture|values|mission)|why (join|work)|life at|culture|^about [a-z]+$/.test(h)) {
    return 'about';
  }
  if (/require|qualification|what you('|’)?ll (need|bring)|what you (need|bring|have)|looking for|must|you have|you are|you bring|about you|who you are|skills|experience|ideal candidate|minimum|basic|ideal|what we need|you('|’)?re|you will need|to be successful/.test(h)) {
    return 'required';
  }
  return 'other';
}

const SECTION_WEIGHT: Record<SectionKind, number> = { required: 2, preferred: 1.25, other: 1, about: 0.35, skip: 0 };
/** Soft skills matter, but much less than the tools and qualifications a job names. */
const SOFT_FACTOR = 0.35;

/** Words in capitals that are not skills. */
const NOT_ACRONYMS = new Set(
  (
    'US USA UK EU EEA EEO EEOC ADA OFCCP PTO HSA FSA HMO PPO RRSP DPSP TFSA AD&D NYC SF LA DC HQ CEO CTO CFO COO CMO CPO CIO VP SVP EVP HR ' +
    'PST PDT EST EDT ET PT CT MT GMT UTC AM PM FAQ IRS LLC INC LTD PLC FTE OTE ID OK TBD ASAP ETA FYI NA N/A BA BS BSC MS MSC MBA PHD JD MD ' +
    'AND THE YOU OUR WITH FOR NOT ALL ARE WILL CAN YOUR WHO WHAT WHY HOW NEW OR IN OF TO AT ON BY AN AS IT IS BE WE IF SO NO DO MY ' +
    'II III IV TV GPS CV COVID COVID19 H1B TN OPT CPT W2 Q1 Q2 Q3 Q4 KPI KPIS OKR OKRS ' +
    // Regions and currencies.
    'APAC EMEA LATAM AMER ANZ NORAM USD CAD EUR GBP AUD INR JPY CHF SGD ' +
    // Ordinary words people write in capitals.
    'HERE THERE NOW MORE NOTE PLEASE APPLY TODAY ONLY MUST ALSO WHERE WHEN WILL HAVE THIS THAT FROM THEIR THEY THEM ' +
    'BUT ANY EACH SOME VERY MOST JUST WELL BEST GREAT TOP KEY YES NOT NEW REAL TRUE LIVE WORK TEAM JOIN ROLE JOB'
  ).split(' '),
);

const TECHNICAL_TOKEN = /(?<![A-Za-z0-9])(?:[A-Z]{2,6}[0-9]?|[A-Z][a-z]+[A-Z][A-Za-z]*|[A-Za-z]+[0-9]+[A-Za-z]*|[A-Za-z]+\.(?:js|io|NET))(?![A-Za-z0-9])/g;

function runsText(block: RichBlock): string {
  return block.type === 'heading' ? block.text : block.runs.map((r) => r.text).join('');
}

/** Mentions of a skill: overlapping spellings ("REST" inside "REST APIs") count once. */
function countMatches(patterns: RegExp[], text: string): number {
  const spans: [number, number][] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) spans.push([match.index, match.index + match[0].length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let count = 0;
  let end = -1;
  for (const [start, stop] of spans) {
    if (start >= end) count++;
    end = Math.max(end, stop);
  }
  return count;
}

/** Split the description into sections by its headings. */
function sections(blocks: RichBlock[]): { kind: SectionKind; text: string }[] {
  const out: { kind: SectionKind; text: string }[] = [];
  let current = { kind: 'other' as SectionKind, text: '' };
  for (const block of blocks) {
    if (block.type === 'heading') {
      if (current.text.trim()) out.push(current);
      const isPlace = block.text.split(/\s+/).length <= 4 && countriesIn(block.text).size > 0;
      current = { kind: isPlace ? current.kind : sectionKind(block.text), text: '' };
      continue;
    }
    current.text += `${runsText(block)}\n`;
  }
  if (current.text.trim()) out.push(current);
  return out;
}

/** The keywords a job asks for, most important first. */
export function jobKeywords(blocks: RichBlock[], limit = 30): Keyword[] {
  const found = new Map<string, { name: string; kind: 'hard' | 'soft'; weight: number; section: SectionKind; mentions: number }>();
  const add = (name: string, kind: 'hard' | 'soft', section: SectionKind, mentions: number) => {
    const weight = SECTION_WEIGHT[section] * (kind === 'soft' ? SOFT_FACTOR : 1);
    const entry = found.get(name.toLowerCase());
    if (!entry) {
      found.set(name.toLowerCase(), { name, kind, weight, section, mentions });
      return;
    }
    entry.mentions += mentions;
    if (weight > entry.weight) {
      entry.weight = weight;
      entry.section = section;
    }
  };

  const parts = sections(blocks);
  const covered = new Set<string>();
  for (const part of parts) {
    if (part.kind === 'skip') continue;
    for (const skill of HARD) {
      const n = countMatches(skill.patterns, part.text);
      if (n > 0) add(skill.name, 'hard', part.kind, n);
    }
    // Soft skills only count when the job actually asks for them.
    if (part.kind === 'required' || part.kind === 'preferred') {
      for (const skill of SOFT) {
        const n = countMatches(skill.patterns, part.text);
        if (n > 0) add(skill.name, 'soft', part.kind, n);
      }
    }
  }
  // Remember every spelling the dictionary already explains.
  for (const skill of HARD) {
    for (const part of parts) {
      for (const pattern of skill.patterns) {
        pattern.lastIndex = 0;
        for (const m of part.text.match(pattern) ?? []) covered.add(m.toLowerCase());
      }
    }
  }
  // Technical terms the dictionary doesn't know, from requirement sections only.
  for (const part of parts) {
    if (part.kind !== 'required' && part.kind !== 'preferred') continue;
    for (const line of part.text.split('\n')) {
      // A line written in capitals is shouting, not a list of acronyms.
      const letters = line.replace(/[^A-Za-z]/g, '');
      if (letters.length > 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) continue;
      for (const token of line.match(TECHNICAL_TOKEN) ?? []) {
        if (NOT_ACRONYMS.has(token.toUpperCase()) || covered.has(token.toLowerCase())) continue;
        add(token, 'hard', part.kind, 1);
      }
    }
  }

  const keywords: Keyword[] = [...found.values()].map((v) => {
    // A term mentioned again and again matters a little more.
    const weight = v.weight * (1 + Math.min(v.mentions - 1, 2) * 0.15);
    return { name: v.name, kind: v.kind, weight: Math.round(weight * 100) / 100, section: v.section };
  });
  keywords.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
  return keywords.slice(0, limit);
}

/** All the text of a resume, for matching. */
export function resumeText(doc: ResumeDoc | null, plain: string): string {
  if (!doc) return plain;
  const parts = [
    plain,
    doc.summary,
    ...doc.experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
    ...doc.education.flatMap((e) => [e.school, e.degree, ...e.details]),
    ...doc.projects.flatMap((p) => [p.name, p.subtitle, ...p.bullets]),
    // Skills are lists, which is what the list-only aliases need.
    ...doc.skills.map((g) => g.items.join(', ')),
    ...doc.extras.flatMap((e) => e.items),
  ];
  return parts.filter(Boolean).join('\n');
}

/** The dictionary entry a term is a spelling of ("Postgres" → PostgreSQL), if any. */
function skillFor(term: string): Skill | undefined {
  const byName = [...HARD, ...SOFT].find((s) => s.name.toLowerCase() === term.trim().toLowerCase());
  if (byName) return byName;
  // Wrapped in commas so list-only spellings ("Go", "R") are recognised too.
  const probe = `, ${term.trim()},`;
  return [...HARD, ...SOFT].find((s) =>
    s.patterns.some((p) => {
      p.lastIndex = 0;
      const m = p.exec(probe);
      return !!m && m[0].trim() === term.trim();
    }),
  );
}

/** Whether a text mentions a skill or term, under any of its usual spellings. */
export function mentions(term: string, text: string): boolean {
  const skill = skillFor(term);
  if (skill) return countMatches(skill.patterns, text) > 0;
  return new RegExp(`${BEFORE}${escape(term.trim())}${AFTER}`, 'i').test(text);
}

function resumeHas(keyword: Keyword, text: string): boolean {
  return mentions(keyword.name, text);
}

/** Compare a resume against a job's keywords. */
export function matchResume(keywords: Keyword[], text: string): MatchReport {
  const matched: Keyword[] = [];
  const missing: Keyword[] = [];
  for (const keyword of keywords) (resumeHas(keyword, text) ? matched : missing).push(keyword);
  const total = keywords.reduce((sum, k) => sum + k.weight, 0);
  const got = matched.reduce((sum, k) => sum + k.weight, 0);
  return { score: total > 0 ? Math.round((got / total) * 100) : 0, matched, missing };
}
