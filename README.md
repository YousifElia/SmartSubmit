# SmartSubmit

A Chrome and Firefox extension that fills in job applications for you, remembers how you answered questions it hadn't seen before, keeps as many resumes as you like, and tailors a resume to a specific job with Claude or a model running on your own computer.

Your data stays in your browser. Sync between browsers is optional and end-to-end encrypted, through a server you control. SmartSubmit never submits an application for you.

## What it does

- **Set up once.** On install, a guided setup collects the details applications ask for: name, contact, location, links, education, experience, Canadian and U.S. work authorization, common answers (salary, start date, notice period) and, if you choose, voluntary demographic answers. Every step can be skipped and edited later.
- **Resumes.** Paste text or upload PDF or Word files, as many as you like, with one marked as the default. Each is split into editable sections, so everything works without any AI.
- **Autofill.** On a supported application a small panel appears at the edge of the page. Press **Autofill** and it fills what it knows, attaches your resume, and colour-codes every field: filled, worth checking, or needs your answer. On any other site, click the toolbar button to run it on the current page.
- **Learning.** When you answer a question SmartSubmit didn't know, the panel offers to remember it. Next time the same question is filled for you; a similar one is filled and flagged for you to check. On forms that run over several steps, answers from earlier steps stay on offer.
- **Tailoring.** Rewrite a resume for a specific job, with:
  - **Claude**, by copy and paste: SmartSubmit prepares the prompt and opens claude.ai; you paste the reply back. No API key, no sign-in.
  - **A local model** through [Ollama](https://ollama.com) or any OpenAI-compatible server (LM Studio, llama.cpp, vLLM, Jan), automatically.

  Either way you review every change before a PDF is built. Tailoring may reorder, rephrase and trim what is in your resume. Anything the job asks for that your resume doesn't show is listed as a gap, never written in; a check removes invented employers, titles, skills and numbers.
- **Job tools.** A keyword match score for each job, a PDF copy of the posting, and an application tracker (saved, started, applied, interviewing, offer, rejected, withdrawn) with CSV export.
- **Sync.** Optional. Keep Chrome and Firefox in step with an account on your own [Supabase](https://supabase.com) project. Everything is encrypted in the browser first.

## Supported application systems

The panel appears by itself on these sites. Anywhere else, the toolbar button runs the generic engine, which works from the wording of each question.

| System | Addresses | How it was built and tested |
| --- | --- | --- |
| Greenhouse | `*.greenhouse.io`, including embedded forms | From the live public forms; tested on faithful replicas |
| Lever | `jobs.lever.co`, `jobs.eu.lever.co` | From the live public forms; tested on faithful replicas |
| Ashby | `jobs.ashbyhq.com` | From the live public forms; tested on faithful replicas |
| Workday | `*.myworkdayjobs.com`, `*.myworkdaysite.com` | Job capture checked against live postings. The application sits behind an account with each employer, so the form support is built from Workday's public pages and tested on a replica |
| iCIMS | `*.icims.com` | Job capture checked against live postings. The application sits behind an account with each employer; built from the public pages and tested on a replica |
| SmartRecruiters | `jobs.smartrecruiters.com` | Job capture checked against live postings. The application page blocks automated visits, so the form support is tested on a replica |
| Workable | `apply.workable.com` | Built from Workable's known page structure and tested on a replica; not yet checked against the live site |

The four systems in the lower rows are the least proven. If something is missed or filled wrongly there, please [open an issue](https://github.com/YousifElia/SmartSubmit/issues) with the system's name and the question's wording.

## What it will never do

- Submit an application, or press a submit button.
- Fill a password, a CAPTCHA, or a field hidden from people (a spam trap).
- Tick an agreement, consent or certification box, or sign anything, even from an answer you saved before.
- Drive claude.ai in any way. The Claude handoff is you pasting and copying.
- Invent experience when tailoring.

## Install

Pre-built extensions are attached to each [release](https://github.com/YousifElia/SmartSubmit/releases), or build your own (below).

**Chrome, Edge, Brave**

1. Unzip `smartsubmit-<version>-chrome.zip`.
2. Open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked**.
3. Select the unzipped folder. The setup opens in a new tab.

**Firefox 140 or later**

Release versions of Firefox only install extensions signed by Mozilla. Until SmartSubmit is listed on addons.mozilla.org:

- To try it: open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and pick `manifest.json` inside the unzipped `smartsubmit-<version>-firefox.zip`. It stays until Firefox restarts.
- To keep it: use Firefox Developer Edition or Nightly with `xpinstall.signatures.required` set to `false` in `about:config`, or sign your own copy with [`web-ext sign`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign).

Firefox asks for your permission before SmartSubmit sends any data off your computer. That only happens if you turn on sync, or point AI at a model on another machine.

## Using a local model

SmartSubmit talks to Ollama at `http://localhost:11434`. Ollama only answers browser extensions you allow, so set this once and restart Ollama:

```
OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*
```

The AI page in SmartSubmit shows the exact command for macOS, Windows and Linux, checks the connection, and lists your models. A model of 7 billion parameters or more gives noticeably better tailoring than smaller ones. Any OpenAI-compatible server works too; servers on another machine need a one-time permission.

## Sync server

SmartSubmit has no server of its own. Sync runs through a free Supabase project that you create, and that project only ever receives encrypted data.

1. **Create a project** at [supabase.com](https://supabase.com) (the free plan is enough).
2. **Create the tables.** In the dashboard's SQL editor, run the files in [`supabase/migrations`](supabase/migrations) in order. With the [Supabase CLI](https://supabase.com/docs/guides/cli) instead: `supabase link --project-ref <your-ref>`, then `supabase db push`.
3. **Emails: nothing to set up for a server that is just for you.** Supabase's built-in email sender works as it is. Its emails carry a link, not a code, and SmartSubmit takes the link:
   - **New account:** open the link in the confirmation email, come back and press **Continue**. The page the link opens won't load, which is expected. Or paste the link into SmartSubmit instead of opening it.
   - **Forgotten password:** copy the link from the reset email (right-click it, **Copy link address**) and paste it into SmartSubmit. Don't open it, because it works only once. If you did open it, paste the address of the page it opened instead.

   The built-in sender only delivers to members of your Supabase organization, sends two emails an hour, and doesn't let you change the emails' wording.
4. **If other people will use the server,** connect a mail service of your own (custom SMTP) in the project's Authentication settings. That lifts both limits and unlocks the email templates. You can then replace **Confirm signup** with [`supabase/templates/confirmation.html`](supabase/templates/confirmation.html) and **Reset password** with [`supabase/templates/recovery.html`](supabase/templates/recovery.html), so the emails show a code to type in. (`supabase config push` applies [`supabase/config.toml`](supabase/config.toml), templates included, if you use the CLI.)
5. **Connect SmartSubmit.** On the Sync page, enter the project URL and its publishable (anon) key; the dashboard's **Connect** button shows both. They are public by design: your data is protected by your account and by its encryption. To build them into your own copy instead, put them in `.env.production.local` (see [`.env.example`](.env.example)).

Supabase's security advisor flags `public.delete_account()` because it runs with elevated rights. That is intended: it lets a signed-in person delete their own account, and only that.

### How sync protects your data

- Your password never leaves the browser. It is stretched with PBKDF2-SHA-256 (600,000 rounds) into two keys. One is what the server sees as your password. The other encrypts ("wraps") a random 256-bit data key, which is stored on the server only in wrapped form.
- Each record (profile, resume, saved answer, tailored resume, tracked job) and each uploaded file is encrypted with AES-GCM under keys derived from that data key. Records are stored under an opaque address (an HMAC of their name), so the server can't tell what kind of thing each one is.
- The newest change to a record wins, decided in the database so that an older copy can never overwrite a newer one.
- **If you forget your password,** your synced data can be recovered only from a browser that is still signed in: reset the password there and the data is kept. Resetting from anywhere else starts the cloud copy again from that browser.
- The server can see how many records you have, their sizes, when they changed, and your email address. It can't read any of their content.

## Privacy

See [PRIVACY.md](PRIVACY.md). In short: everything stays in your browser unless you turn on sync (encrypted, to your own server) or use a model on another machine. There is no analytics, no tracking, and no server run by SmartSubmit.

## Building from source

Needs Node.js 22 or later.

```
npm install
npm run build          # Chrome → .output/chrome-mv3
npm run build:firefox  # Firefox → .output/firefox-mv3
npm run zip:all        # both, as zips in .output/
```

`npm run dev` and `npm run dev:firefox` start a browser with the extension loaded and reload it as you edit.

## Tests

```
npm run typecheck
npm test               # unit tests (Vitest)
npm run test:e2e       # end-to-end tests in Chromium with the built extension (Playwright)
npm run lint:firefox   # Mozilla's linter, on the Firefox build
```

The tests that check generated PDFs read them with `pdftotext`, a separate program from [Poppler](https://poppler.freedesktop.org): install it with `sudo apt-get install poppler-utils` on Debian or Ubuntu, or `brew install poppler` on macOS.

The end-to-end tests serve replica application forms at the real systems' addresses, so the extension's own site detection is exercised, and they never reach the real sites. Two suites need outside services and are skipped unless configured:

- `tests/e2e/real-model.spec.ts` runs tailoring through a real local model (`SS_REAL_MODEL_PROVIDER`, `SS_REAL_MODEL_URL`, `SS_REAL_MODEL`).
- `tests/live/sync.live.test.ts` (`npm run test:live`) and `tests/e2e/sync.spec.ts` run sync against a real Supabase project. They need a confirmed test account; [`scripts/live-test-account.mjs`](scripts/live-test-account.mjs) prints the sign-in secret its password must be set to. Both tests delete the account when they finish.
- `tests/live/emailLinks.live.test.ts` (also `npm run test:live`) checks that a sign-up and a password reset can be finished from the links in Supabase's emails, without sending any. [`scripts/live-link-accounts.mjs`](scripts/live-link-accounts.mjs) writes the SQL that creates its test accounts, which the tests delete as they finish.

## Project layout

```
src/
  entrypoints/   background script, content script (panel), dashboard, popup
  background/    message handlers: data, files, PDFs, jobs, AI, sync
  core/
    autofill/    field discovery, classification, answers, filling, site adapters
    jobs/        posting capture, keyword matching, CSV
    resume/      PDF and Word parsing, section detection
    pdf/         resume and posting PDFs
    ai/          prompts, schemas, providers, the truthfulness check
    sync/        encryption, accounts, the sync engine, the Supabase backend
    storage/     the local record store
  ui/            shared dashboard components
supabase/        database migrations, email templates, CLI config
tests/           unit, end-to-end and live tests, replica forms
```

## License

[MIT](LICENSE). SmartSubmit is not affiliated with any of the application systems it supports, or with Anthropic, Ollama or Supabase.
