# 🍑 Peach's Paper Storage

A Zotero-style library for research papers that runs on the web, iPhone/iPad and Android. Your papers, notes, tags and reading position sync between devices: make an edit on the iPad and it shows up on the website about a second later.

**App:** https://vladk-iii.github.io/Peach-s-Paper-Storage/ (once deployed, see setup below)

## Features

- **Separate accounts.** Sign up with email and password, or with Google. Each account can only see its own library.
- **Add papers** by dropping in PDFs or by pasting a DOI, arXiv id or arXiv link. When a PDF contains a DOI or arXiv id, the title, authors, year, venue and abstract are filled in automatically. Adding by arXiv id can download the PDF too.
- **Built-in PDF reader** with zoom and selectable text. It reopens on the page where you stopped, on any device.
- **Organise** with collections, tags, stars, and To read / Reading / Read status. Search covers titles, authors, notes, tags and abstracts.
- **Notes** on every paper, saved automatically.
- **Copy BibTeX** for any paper.
- **Works offline.** The library opens without internet, PDFs you've opened before stay readable, and edits sync when you're back online.
- **Installable** on phones and tablets: it gets a home-screen icon and opens full screen, like a native app.

## Installing on devices

| Device | How |
|---|---|
| **iPhone / iPad** | Open the app link in **Safari** → Share button → **Add to Home Screen** |
| **Android** | Open the app link in **Chrome** → ⋮ menu → **Install app** (or **Add to Home screen**) |
| **Computer** | Use it in the browser, or in Chrome/Edge click the install icon in the address bar |

## How it works

```
 GitHub Pages            Firebase (free Spark plan)        Cloudflare (free)
┌──────────────┐  sync  ┌──────────────────────────┐
│  the app     │◄──────►│ Auth: accounts             │
│  (web / PWA) │        │ Firestore: papers, notes,  │
│              │        │   tags, collections        │
│              │  PDFs  └──────────────────────────┘
│              │◄──────►┌──────────────────────────┐
└──────────────┘        │ Worker: checks login,      │
                        │   per-user storage limits  │
                        │ R2: the PDF files (10 GB)  │
                        └──────────────────────────┘
```

- **Firestore** holds everything you edit and handles syncing between devices in real time, including edits made offline. Free plan: 1 GB of data, 50k reads and 20k writes a day, which is far more than paper metadata needs.
- **Cloudflare R2** stores the PDFs, with 10 GB free and no download fees. PDFs are only uploaded once; highlights and notes live in Firestore, so syncing never moves big files around.
- **The Worker** (`worker/`) is a small API in front of R2. It checks the Firebase login on every request, keeps each account in its own folder, and enforces limits. The defaults are **2 GB per account** and **9 GiB in total**, which keeps you inside the free tier, since R2 has no hard spending cap. Change them in `worker/wrangler.toml`.

```
app/        React + Vite web app (installable PWA), deployed to GitHub Pages
worker/     Cloudflare Worker: PDF upload/download, storage limits, DOI/arXiv lookup
firebase/   Firestore security rules
```

## One-time setup

**Follow the step-by-step guide in [SETUP.md](SETUP.md)**, which has direct links to every console page. In short:

1. **Firebase** (free, no card needed): create a project, turn on Email/Password sign-in, authorize `vladk-iii.github.io`, create Firestore, paste in [`firebase/firestore.rules`](firebase/firestore.rules), and register a web app.
2. **Cloudflare**: turn on R2 (it needs a card on file but stays free under 10 GB), create a bucket named `peach-papers`, and create an API token.
3. **GitHub**: add the Cloudflare token and account ID as secrets and the Firebase config as variables, then set Pages → Source to **GitHub Actions**.
4. **Deploy**: run the "Deploy storage worker" workflow, save its URL as the `WORKER_URL` variable, then run "Deploy app to GitHub Pages".

After that, both deploy automatically whenever `app/` or `worker/` change on `main`.

## Local development

```bash
# Terminal 1: local Firebase (needs Java)
npx firebase-tools emulators:start --only auth,firestore --project demo-peach

# Terminal 2: worker with a local R2 bucket
cd worker && npm install && npx wrangler dev

# Terminal 3: the app
cd app && npm install
cp .env.example .env.local   # fill in values; for emulators add VITE_USE_EMULATORS=true
npm run dev
```

Note: the real worker verifies Google-signed login tokens, so it rejects tokens from the Firebase emulator. For fully local testing, point the app at a real Firebase project, or temporarily stub `authenticate()` in your local copy. Never deploy that stub.

## Ideas for later

- Highlights and annotations inside PDFs (stored in Firestore so they sync)
- Shared collections between accounts
- Browser "save to library" bookmarklet
- Import from a Zotero export or a BibTeX file
- An Android `.apk` built with Capacitor (the installable web app covers most uses already)
