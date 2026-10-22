# Diamond Zone CT — Pitching Lab (shared coaching portal)

A mobile-friendly, single-page pitching analytics app with shared Firestore notes, mechanical changes, strength/mobility notes, hand-entered grades, raw-pitch type overrides, and coach-uploaded Trackman sessions (PDF/CSV/JSON), plus administrator-managed bulk roster backups. All staff see the same saved work after opening the profile on their devices.

**Important:** There are **no pitcher names, statistics, or pitch logs in the public website's source files**. Data is loaded only from Firestore **after** verified email sign-in and an approved email check. The private starter roster file is delivered separately; **never commit a roster JSON export to this repository**, especially if you make this repository public.

## 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project (e.g. `diamond-zone-pitching-lab`). You are responsible for managing that project; GitHub alone cannot provide a multi-user database.
2. Under **Build → Authentication → Sign-in method**, enable **Email/Password**.
3. Under **Build → Firestore Database**, create a database in **production mode**, choosing an appropriate US region. Do **not** use public/test-mode rules.
4. In **Firestore Database → Rules**, replace the rules with the entire contents of `firestore.rules` in this repository and **Publish**. These rules deny all access except verified, admin-approved users; approved coaches may add aggregate players and append aggregate sessions, while only admins manage the approved-coach list or bulk roster imports.
5. In **Project settings → Your apps**, add a **Web** app. Copy the Firebase config object (`apiKey`, `authDomain`, `projectId`, `appId`, etc.). Edit `firebase-config.js` in GitHub so `window.DZ_FIREBASE_CONFIG` equals that object instead of `null`. Firebase's **web config is not a secret**; never place a Firebase Admin SDK service-account key here.
6. In **Authentication → Settings → Authorized domains**, add `44gtandrews.github.io`. For local development, also authorize `localhost` if needed.

## 2. Approve the first administrator (one-time)

The app requires an explicit admin approval document. No one can self-appoint as admin.

1. Open the hosted app and select **Create coach account** with your own email and password.
2. Verify your email by clicking the Firebase email link.
3. In **Firestore Database → Data**, create a collection `allowlist`.
4. Create a document with **document ID equal to your email in lowercase**, for example `owner@example.com`.
5. Add the following **fields** (actual Firestore types):
   - `active`: **boolean** `true`
   - `role`: **string** `admin`
6. Return to the app, sign in, and click **I've verified — continue** (or reload). You'll now see the administrator controls.

**Don't confuse the Firebase Authentication user account with the Firestore `allowlist` document.** Both are required.

## 3. Import the original 14 players — privately

Download the separate `diamond-zone-initial-roster.PRIVATE.json` attachment provided with this setup. **Keep it off GitHub.** Once signed in as admin, select **Import private roster JSON** and press **Import players**. You should see 14 players grouped into 13U, 14U, 16U, and Coach/Adult. Individual pitches for the raw-data coach profile are included. The import preserves the original static Trackman fields and imports the full source roster as-is.

The roster import upserts the player statistical documents; it **does not** overwrite notes, mechanics, strength/mobility, grades, or pitch-type changes stored separately. For future sessions, coaches use **Upload New Session** inside a player profile. The app merges count-weighted pitch summaries and keeps existing notes and grades.

Use **Export roster backup** to download a local copy before large imports. Back up the shared `playerEdits` collection using Firestore's export facilities as well if you need a complete archive of coaching work.

## 4. Approve other coaches

1. In the admin panel, enter the other coach's email and choose **Coach** (or **Admin** if they should manage roster and approvals).
2. Click **Approve coach**. The coach can now open the website, create an account, verify their email, and sign in.
3. All active, verified coaches can add/edit the same notes, mechanical positives/negatives, strength/mobility notes, grades, and raw pitch overrides. They can also upload Trackman data using the workflow below.
4. Administrators can disable access for individual coaches. Don't share passwords.

**Concurrency note:** Each profile section is stored in its own Firestore document. Changes from another device appear on reopening the profile; if two coaches overwrite **the same section at the same time**, the last successful save wins. This version is not a live Google Docs-style co-editor.

## 5. Coaches: add players and update sessions

- From the player directory, select **+ Add Player · Upload File**. Enter the player's name and age group, choose a Trackman Power BI **PDF**, summary **CSV**, raw per-pitch **CSV**, or summary **JSON**, and select **Read File**. Inspect and correct the review table, then select **Confirm & Save to Shared Database**.
- From an existing aggregate player's profile, select **+ Upload New Session · Trackman File**. The same review workflow merges the new session into that player's statistics and increments their session count.
- The browser reads the file locally; the app sends only the reviewed pitch summary to Firestore. PDF layouts vary widely. When extraction is incomplete, **enter or correct values manually in the review table** using the PDF text as a reference. The app never invents missing statistics. Upload a summary CSV for more reliable automatic extraction.
- Rows are grouped by pitch type; **Undefined** and **Other** are ignored. Only supported types are accepted. The review table requires a positive pitch count and a plausible average velocity. Optional missing fields remain blank. The app refuses to save the exact same file twice to the same player if its SHA-256 hash is present in the recent import history.
- Count-weighted merging applies to average velocity, extension, IVB, HB and VAA; spin and percentages are rounded to whole numbers; maxima use the maximum; tilt follows the session with movement data (otherwise the larger pitch count). Pitch types missing from the new session are preserved. Grade/notes documents are untouched.
- **Limitation:** the existing coach/adult raw pitch-log profile cannot yet be updated with aggregate session uploads; the app blocks the save instead of corrupting the raw log. PDFs that cannot be parsed require manual entry before saving. No duplicate detection is possible if the same session is exported into two different files.
- Coach updates are written in a Firestore transaction to avoid lost updates when two coaches upload concurrently. Admin bulk import remains available separately.

## Trackman PDF uploads (Power BI Team Portal)

Coaches can upload the **same one-page Trackman Team Portal pitching report PDF** they previously sent for profile creation. The PDF reader joins the **Release Slot**, **Movement**, and **Location** pitch tables by pitch type and fills the review form with count, average/max velocity, average/max spin, extension, IVB, HB, tilt, strike/strike-extension/out percentages, and VAA. Missing PDF fields remain blank. The report may include extra charts and axis labels; these are ignored.

- For an **entirely new pitcher**, choose **+ Add Player · Upload File** on the home screen. Choose the PDF and click **Read File**. The pitcher name is filled from the report when recognized; **select the age group**, review the extracted rows, then click **Confirm & Save to Shared Database**. The new player appears in the group immediately after saving.
- For an **existing pitcher**, open their profile and choose **+ Upload New Session · Trackman File**, then **Read File**, review, and save. The uploader verifies the player name when the PDF identifies it. Reports containing multiple selected sessions are blocked from being appended to avoid double-counting historical sessions. Export the *new session only* from Trackman before updating an existing player.
- **Import private roster JSON** is a different administrator-only feature for the original 14-player starting database. It **does not accept PDFs**. Do not use that control for individual Trackman reports.
- The review table is mandatory because different Team Portal export layouts may render columns differently, and blanks must not be invented. Re-uploading the identical file to the same player is blocked by file hash. A nonmatching file cannot be saved to the wrong profile.
- Example format tested: a one-page September 2026 Team Portal PDF with Fastball, ChangeUp and Curveball pitch statistics, movement data, and location metrics.

## 6. Publish via GitHub Pages

1. Open the repository: `https://github.com/44gtandrews/diamond-zone-pitching-lab`.
2. The repository is initially **private**. With GitHub Free on a personal account, GitHub Pages typically requires a **public repository**. To change visibility, go to **Settings → General → Danger Zone → Change repository visibility → Make public**. Do this only after checking that **no private roster exports or credentials** are in the repository or its Git history.
3. Open **Settings → Pages**; set Source to **Deploy from a branch**, Branch **main**, directory **/(root)**, and Save.
4. The expected URL is `https://44gtandrews.github.io/diamond-zone-pitching-lab/` after GitHub Pages finishes publishing (not live until configured/published).
5. Open the hosted URL on iOS Safari or Chrome; use **Share → Add to Home Screen** for app-like access.

GitHub serves the HTML/CSS/JS code; **Firebase** provides authentication and the multi-device database. A public GitHub repository does *not* grant public access to the roster in properly secured Firestore. Never use `allow read: if true` rules on this dataset.

## Repo files

- `index.html` — original Pitching Lab UI and charts, modified to load player records only after coach authorization.
- `cloud.js` — Firebase login, email verification, role checking, Firestore storage, admin import and staff allowlist.
- `importer.js` — coach PDF/CSV/JSON upload, editable review, weighted session merge, transactional saves.
- `firebase-config.js` — paste your Firebase public Web config (starts as `null`).
- `firestore.rules` — publish in Firebase Firestore Rules console before importing data.
- `.nojekyll` — GitHub Pages file.

## Privacy and limitations

These are profiles of youth athletes. Obtain any required parent/guardian and organizational permissions before uploading; limit access to coaches who actually need it. Choose strong passwords and consider adding stronger identity controls, audit history, section-level edit attribution, and retention/backups before handling more sensitive information. Firebase auth and Firestore rules **must** be configured first; the app intentionally does not expose offline cached private player data to anonymous visitors.

The repository contains working client code and rules, **not** a live Firebase account or a published website. Until the owner performs these console steps, the public page displays **Cloud setup needed** rather than fake shared saves.