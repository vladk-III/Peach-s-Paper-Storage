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

You need free accounts at [Firebase](https://console.firebase.google.com) and [Cloudflare](https://dash.cloudflare.com). Neither charges anything at this size, but **Cloudflare asks for a card before it turns on R2**.

### 1. Firebase (accounts + sync)

1. Go to the [Firebase console](https://console.firebase.google.com) and choose **Create project**. Google Analytics is optional.
2. **Build → Authentication → Get started**. Enable **Email/Password**, and optionally **Google**.
3. **Authentication → Settings → Authorized domains**: add `vladk-iii.github.io`.
4. **Build → Firestore Database → Create database**. Pick a location and start in **production mode**.
5. **Firestore → Rules**: replace the contents with [`firebase/firestore.rules`](firebase/firestore.rules) and click **Publish**.
6. **Project settings (⚙) → General → Your apps → Web app (`</>`)**. Register an app and note the `apiKey`, `authDomain`, `projectId` and `appId`.

### 2. Cloudflare (PDF storage)

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com). Open **R2 Object Storage**, enable it, and create a bucket named **`peach-papers`**.
2. Create an API token: **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"** template.
3. Note your **Account ID**. It's in the dashboard sidebar, or in the URL.
4. *(Optional but recommended)* Set up a billing notification under **Manage Account → Billing**.

### 3. GitHub settings

In this repo, open **Settings → Secrets and variables → Actions**.

- **Secrets** tab:
  - `CLOUDFLARE_API_TOKEN`: the token from step 2
  - `CLOUDFLARE_ACCOUNT_ID`: your account id
- **Variables** tab:
  - `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`: the values from Firebase
  - `WORKER_URL`: fill this in after step 4

Then open **Settings → Pages** and set **Source** to **GitHub Actions**.

### 4. Deploy

1. **Actions → "Deploy storage worker to Cloudflare" → Run workflow.** The log prints the worker's URL, something like `https://peach-papers.<you>.workers.dev`. Save it as the `WORKER_URL` variable.
2. **Actions → "Deploy app to GitHub Pages" → Run workflow.**

After that, both deploy automatically whenever `app/` or `worker/` change on `main`.

> If you fork this or rename the repo, update `ALLOWED_ORIGINS` in `worker/wrangler.toml` to your GitHub Pages address.

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
