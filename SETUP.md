# Setup guide

This guide takes Peach's Paper Storage from an empty repo to a live app at
**https://vladk-iii.github.io/Peach-s-Paper-Storage/**. It takes about 30 minutes, and you only do it once.

There are four parts:

1. [Firebase](#part-1--firebase-accounts--sync): user accounts and the synced library database
2. [Cloudflare](#part-2--cloudflare-pdf-storage): PDF storage (R2) and the small storage API (Worker)
3. [GitHub](#part-3--github-settings): give the deploy workflows the keys they need
4. [Deploy and test](#part-4--deploy-and-test)

Keep a notes file open. You'll copy about eight values from one site to another, and the [checklist at the end](#checklist-of-values) lists them all.

> In the URLs below, replace **`<PROJECT_ID>`** with your Firebase project ID, for example `peach-papers-1a2b3`.

---

## Part 1 — Firebase (accounts + sync)

Firebase's free **Spark** plan covers everything this app uses from Firebase. You don't need a credit card for this part.

### 1.1 Create a project

1. Open **https://console.firebase.google.com/** and sign in with a Google account.
2. Click **Create a project** (or **Add project**).
3. Name it, for example `peach-papers`. Firebase adds a suffix to make the **Project ID** unique, such as `peach-papers-1a2b3`. **Write down the Project ID**.
4. Google Analytics isn't needed, so you can turn it off. Click **Create project**, then **Continue**.

### 1.2 Turn on sign-in methods

1. Open **https://console.firebase.google.com/project/<PROJECT_ID>/authentication/providers**. If you see **Get started**, click it first.
2. Under **Sign-in method**, click **Email/Password**, switch on the first toggle (**Email/Password**), and click **Save**. Leave "Email link" off.
3. *(Optional)* Click **Add new provider → Google**, switch it on, pick a **support email**, and click **Save**.
   - Google sign-in works best in a normal browser tab. In the iPhone/iPad home-screen app, email and password is more reliable.

### 1.3 Allow the GitHub Pages site to sign people in

1. Open **https://console.firebase.google.com/project/<PROJECT_ID>/authentication/settings**.
2. Click **Authorized domains** in the left list, then **Add domain**.
3. Enter `vladk-iii.github.io` and click **Add**.
   - `localhost` is already on the list, which you need for local development.

### 1.4 Create the database (Firestore)

1. Open **https://console.firebase.google.com/project/<PROJECT_ID>/firestore**.
2. Click **Create database**.
   - **Edition**, if asked: **Standard**.
   - **Database ID**: leave it as `(default)`.
   - **Location**: pick one near you, such as `nam5 (United States)` or `eur3 (Europe)`. You can't change this later.
   - **Security rules**: choose **Start in production mode**.
3. Click **Create**.

### 1.5 Paste in the security rules

These rules make sure each account can only read and write its own papers.

1. On the Firestore page, open the **Rules** tab (https://console.firebase.google.com/project/<PROJECT_ID>/firestore/rules).
2. Delete everything in the editor and paste in the contents of [`firebase/firestore.rules`](firebase/firestore.rules):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
3. Click **Publish**.

### 1.6 Register the web app and copy its config

1. Open **https://console.firebase.google.com/project/<PROJECT_ID>/settings/general**.
2. Scroll to **Your apps** and click the **Web** icon (`</>`).
3. Give it a nickname such as `Peach Papers web`. **Don't** tick "Also set up Firebase Hosting", because GitHub Pages hosts the app. Click **Register app**.
4. Firebase shows a code snippet with a `firebaseConfig` object. Copy these four values into your notes:

   ```js
   apiKey: "AIza...",                         // → FIREBASE_API_KEY
   authDomain: "<PROJECT_ID>.firebaseapp.com", // → FIREBASE_AUTH_DOMAIN
   projectId: "<PROJECT_ID>",                 // → FIREBASE_PROJECT_ID
   appId: "1:1234567890:web:abc123...",       // → FIREBASE_APP_ID
   ```
   You can ignore the other values (`storageBucket`, `messagingSenderId`).
   The web config isn't a secret: it's in every Firebase website's code. The security rules from 1.5 are what protect the data.
5. Click **Continue to console**.

You can check usage at any time at **https://console.firebase.google.com/project/<PROJECT_ID>/usage**.
Free plan limits: 1 GiB stored, 50,000 reads, 20,000 writes and 20,000 deletes per day. See https://firebase.google.com/pricing.

---

## Part 2 — Cloudflare (PDF storage)

Cloudflare R2 gives 10 GB of storage free each month with no download fees. Cloudflare **requires a payment method before it turns on R2**, even if you stay inside the free tier. The app keeps you under the limit: 2 GB per account and 9 GiB in total by default. Step 2.6 adds a usage alert as a second safety net.

### 2.1 Create an account

1. Sign up at **https://dash.cloudflare.com/sign-up**. You don't need a domain name.
2. Verify your email.

### 2.2 Pick your workers.dev subdomain

The storage API will live at `https://peach-papers.<your-subdomain>.workers.dev`.

1. Open **https://dash.cloudflare.com/?to=/:account/workers-and-pages**.
2. If it asks you to choose a **workers.dev subdomain**, pick one, for example `vladk`, and confirm. Do this now: the automatic deploy can't choose it for you.

### 2.3 Find your Account ID

1. Still on **https://dash.cloudflare.com/?to=/:account/workers-and-pages**, look in the right-hand sidebar for **Account ID**. It's also in the browser address bar: `dash.cloudflare.com/<ACCOUNT_ID>/...`.
2. Copy it into your notes as `CLOUDFLARE_ACCOUNT_ID`.
   Help page: https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/

### 2.4 Turn on R2 and create the bucket

1. Open **https://dash.cloudflare.com/?to=/:account/r2/overview**.
2. Click **Purchase R2 Plan** / **Enable R2**. Add a payment method when asked; the free tier still applies.
3. Click **Create bucket**:
   - **Bucket name**: `peach-papers`. It must be exactly this, because it's what `worker/wrangler.toml` expects.
   - **Location**: Automatic.
   - **Default storage class**: **Standard**. Only Standard storage is free; Infrequent Access is not.
4. Click **Create bucket**. Leave the bucket **private**: don't enable public access or a custom domain. The Worker is the only way in.

Pricing reference: https://developers.cloudflare.com/r2/pricing/

### 2.5 Create an API token for GitHub

GitHub Actions uses this token to deploy the Worker.

1. Open **https://dash.cloudflare.com/profile/api-tokens**.
2. Click **Create Token**, find the **Edit Cloudflare Workers** template, and click **Use template**.
3. Check the **Permissions** list. If it doesn't already include **Account → Workers R2 Storage → Edit**, click **+ Add more** and add it.
4. **Account Resources**: Include → *your account*. **Zone Resources**: Include → All zones. That's fine, since you have no domains.
5. Click **Continue to summary → Create Token**.
6. **Copy the token now.** Cloudflare only shows it once. Save it in your notes as `CLOUDFLARE_API_TOKEN`, and treat it like a password.

### 2.6 *(Recommended)* Get warned about usage

1. Open **https://dash.cloudflare.com/?to=/:account/notifications** and click **Add**.
2. Choose **Usage Based Billing**, select **R2**, set a threshold such as 8 GB of storage, and add your email.

Billing overview: **https://dash.cloudflare.com/?to=/:account/billing**

---

## Part 3 — GitHub settings

### 3.1 Add the secrets

Open **https://github.com/vladk-III/Peach-s-Paper-Storage/settings/secrets/actions**. Click **New repository secret** for each:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from 2.5 |
| `CLOUDFLARE_ACCOUNT_ID` | the Account ID from 2.3 |

### 3.2 Add the variables

Open **https://github.com/vladk-III/Peach-s-Paper-Storage/settings/variables/actions**. Click **New repository variable** for each:

| Name | Value |
|---|---|
| `FIREBASE_API_KEY` | `apiKey` from 1.6 |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` from 1.6 |
| `FIREBASE_PROJECT_ID` | `projectId` from 1.6 |
| `FIREBASE_APP_ID` | `appId` from 1.6 |
| `WORKER_URL` | leave for now; you add it in step 4.1 |

### 3.3 Turn on GitHub Pages

1. Open **https://github.com/vladk-III/Peach-s-Paper-Storage/settings/pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.

### 3.4 Make `main` the default branch (if it isn't already)

Open **https://github.com/vladk-III/Peach-s-Paper-Storage/settings** and, under **Default branch**, switch to `main`.
The deploy workflows run when `main` changes, or when you start them by hand.

---

## Part 4 — Deploy and test

### 4.1 Deploy the storage Worker

1. Open **https://github.com/vladk-III/Peach-s-Paper-Storage/actions/workflows/deploy-worker.yml**.
2. Click **Run workflow** (branch `main`), then **Run workflow** again.
3. When it finishes with a green ✓, open the run, then the **deploy** job, then the **wrangler deploy** step. Near the end, the log prints a URL like:
   ```
   https://peach-papers.<your-subdomain>.workers.dev
   ```
   You can also find it at **https://dash.cloudflare.com/?to=/:account/workers-and-pages**, under **peach-papers**.
4. Check that it's running by opening `https://peach-papers.<your-subdomain>.workers.dev/health` in a browser. It should show `{"ok":true}`.
5. Add the URL, **without** `/health` or a trailing slash, as the `WORKER_URL` variable from step 3.2.

### 4.2 Deploy the app

1. Open **https://github.com/vladk-III/Peach-s-Paper-Storage/actions/workflows/deploy-app.yml**.
2. Click **Run workflow** (branch `main`).
3. When it's green, open **https://vladk-iii.github.io/Peach-s-Paper-Storage/**.

### 4.3 Try it

1. Click **New here? Create an account** and sign up.
2. Click **＋ Add** and paste `1706.03762`, a famous arXiv paper. Leave "Also download the PDF" ticked.
3. Open the paper and click **Open PDF**.
4. On your phone or iPad, open the same link, sign in, and add it to the home screen (see the README). Edit a note on one device and watch it change on the other.

### Troubleshooting

| Symptom | Fix |
|---|---|
| The app says "hasn't been connected to a backend yet" | A `FIREBASE_*` or `WORKER_URL` variable is missing or misspelled. Fix it in 3.2 and run the app workflow again (4.2). |
| Sign-in fails with `auth/unauthorized-domain` | Add `vladk-iii.github.io` in 1.3. |
| Sign-in fails with `auth/operation-not-allowed` | Turn on Email/Password in 1.2. |
| Library never loads, or "Missing or insufficient permissions" | Firestore wasn't created (1.4), or the rules weren't published (1.5). |
| Uploads fail with "Invalid or expired sign-in" | The Worker's `FIREBASE_PROJECT_ID` doesn't match. Check the variable in 3.2 and run the Worker workflow again. |
| Uploads fail with a CORS / "Failed to fetch" error in the browser console | The site address isn't in `ALLOWED_ORIGINS` in [`worker/wrangler.toml`](worker/wrangler.toml). It must be exactly `https://vladk-iii.github.io`. |
| Worker deploy fails: "R2 bucket not found" | The bucket name must be exactly `peach-papers` (2.4). |
| Worker deploy fails: authentication / permission error | Check `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (3.1), and that the token has R2 edit permission (2.5). |
| Worker deploy fails asking for a workers.dev subdomain | Do step 2.2. |

---

## Checklist of values

| Value | Where it comes from | Where it goes |
|---|---|---|
| Firebase **Project ID** | 1.1 / 1.6 | GitHub variable `FIREBASE_PROJECT_ID` |
| Firebase **apiKey** | 1.6 | GitHub variable `FIREBASE_API_KEY` |
| Firebase **authDomain** | 1.6 | GitHub variable `FIREBASE_AUTH_DOMAIN` |
| Firebase **appId** | 1.6 | GitHub variable `FIREBASE_APP_ID` |
| Cloudflare **Account ID** | 2.3 | GitHub secret `CLOUDFLARE_ACCOUNT_ID` |
| Cloudflare **API token** | 2.5 | GitHub secret `CLOUDFLARE_API_TOKEN` |
| **Worker URL** | 4.1 | GitHub variable `WORKER_URL` |

## Changing the storage limits

Edit [`worker/wrangler.toml`](worker/wrangler.toml) and push to `main`. The Worker redeploys automatically.

```toml
USER_QUOTA_BYTES = "2147483648"   # 2 GB per account
TOTAL_QUOTA_BYTES = "9663676416"  # 9 GiB across everyone (R2 free tier is 10 GB)
MAX_FILE_BYTES = "78643200"       # 75 MB per PDF
```
