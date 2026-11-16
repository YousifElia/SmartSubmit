# SmartSubmit privacy policy

SmartSubmit is a browser extension that fills in job applications. It is open source, and it has no server, analytics or tracking of its own.

## What it stores, and where

Everything you enter is stored in your browser's extension storage on your computer: your profile, resumes (and the files you upload), answers you choose to save, tailored resumes, and the jobs in your tracker. Settings (such as your AI and sync server addresses) also stay on that browser.

You can export all of it as a backup file, and delete all of it, from SmartSubmit's Settings page. Uninstalling the extension deletes it too.

## What leaves your browser, and only when you choose

- **Filling a form.** Your answers are entered into the application page you are on, when you press Autofill (or, if you turn it on, when a form is detected). They are sent to that employer only when you submit the application yourself.
- **Reading a job posting.** On a supported application page, SmartSubmit reads the posting from the page, or from the public job data the application system publishes (for example Greenhouse's job board API or SmartRecruiters' posting API). These requests carry nothing about you.
- **Sync, if you turn it on.** Your data is encrypted in your browser and sent to the sync server you chose: a Supabase project you control. The encryption key is derived from your password and never leaves your browser, so the server can't read your data. It does see your email address (your sign-in), and how many records you have, how big they are and when they changed.
- **AI on another machine, if you set one up.** When you tailor a resume or draft an answer with a model that isn't on your own computer, the resume text and the job's description are sent to that server. With Ollama or another server on your computer (`localhost`), nothing leaves your computer. Firefox asks for your permission before either sync or such a model receives anything.
- **Claude.** SmartSubmit never contacts Claude. It can copy a prepared prompt for you to paste into claude.ai or Claude in Chrome yourself; what you paste there is between you and Anthropic.
- **The links in sync emails** can open a page on SmartSubmit's GitHub Pages site, which says whether your email was confirmed. The page is static: it reads the result from its own address, in your browser, removes any sign-in details from the address bar, and sends nothing anywhere. Those details sit after a `#` in the address, a part browsers never send to the site.

## What it never does

SmartSubmit doesn't sell or share your data, show ads, track the sites you visit, or send anything to its developers. It doesn't run on sites other than the supported application systems unless you click its toolbar button on a page.

## Permissions

- **Storage, unlimited storage:** to keep your data, including resume files, on your computer.
- **Access to the supported application systems** (Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, Workable): to show the panel and fill their forms.
- **Active tab, scripting:** to fill a form on any other site, only when you click the toolbar button there.
- **localhost:** to reach a model running on your own computer.
- **Alarms:** to sync every 15 minutes, if sync is on.
- **Clipboard (write):** to copy a prompt for Claude when you ask.
- **Optional access to other sites:** requested only if you point AI at a server on another machine, and only for that server.

## Contact

Questions or concerns: open an issue at https://github.com/YousifElia/SmartSubmit/issues.
