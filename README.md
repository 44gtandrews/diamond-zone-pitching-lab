# Coach access requests, administrator tab and optional SMS alerts (Oct 2026)

## Staff access: what changed

- On **account creation**, Firebase Authentication sends the coach a verification email.
- After verification and the next sign-in / **I've verified — continue**, the site creates `coachRequests/{uid}` with the verified account email and `status: pending`.
- This is deliberately separate from `allowlist`: signing up or filing a request NEVER grants access to player data.
- A user with an existing active `allowlist/<lowercase-email>` entry and `role: admin` sees a separate **Admin Dashboard** tab in the website's top navigation. Non-admin accounts do not see it.
- The admin dashboard shows **Pending requests** (Approve / Deny), **Denied requests** (Approve / Reconsider), and the **approved/disabled coach list** (Disable / Reinstate). It also retains private roster bulk import/export.
- The request queue cannot be viewed or modified by applicant accounts: Firestore Rules grant a verified applicant only `get/create` on their own request, while only existing admins can list or update requests.
- Administrators can invite new coaches directly by email, but the web form **does not grant new admin roles**. Existing administrator privileges are unchanged.
- A previously disabled coach cannot file a fresh request to regain access without administrator intervention.

**Important: Deploy the updated Firestore Rules once for this release.** The routine GitHub workflow currently updates **Firebase Hosting only**. The request queue needs the `coachRequests` rule, so site updates alone are insufficient. On the Mac where Firebase CLI was authorized:

```bash
cd ~/diamond-zone-pitching-lab
git pull origin main
npx --yes firebase-tools@latest deploy --only firestore:rules --project diamond-zone-pitching-lab
```

Alternatively, copy the repository's `firestore.rules` into the Firebase Console → Firestore Database → Rules editor and click **Publish**. **Do not** grant test-mode/public access. The new collection won't work until the rules are live. Check that a verified coach appears under `coachRequests` in Firestore Data and cannot read `players` until approved.

The URL of the admin dashboard is `https://dzpitchingportal.app/?view=admin`. The web UI checks the approved administrator role **and Firestore rules enforce it**, so the URL alone grants no access.

## Optional: SMS to the administrator when access is requested

A prebuilt but **not activated** second-generation Firebase Cloud Function lives in `functions/index.js`, exported as `notifyCoachAccessRequestSms`. On first creation of a verified `coachRequests/{uid}` document, it can send a text containing only the applicant's verified email and a link to your admin dashboard. The function includes an event de-duplication lock and a 20-message-per-UTC-day cap, limiting unexpected provider charges; errors are logged. It is intentionally **NOT part of the website's automatic GitHub Hosting deploy** until you configure it.

**You must supply privately:** a Twilio business account, an SMS-capable sender number, your destination mobile number, and Twilio API credentials. Firebase Cloud Functions require the **Blaze pay-as-you-go plan** and can incur Google Cloud charges; Twilio separately bills phone numbers and messages. US messages sent from a 10DLC number generally need A2P 10DLC registration / approved campaign; follow Twilio's documentation and messaging rules. Never paste API secrets or your private phone number into GitHub or the public client files.

To activate after the provider and billing are ready, run locally:

```bash
cd ~/diamond-zone-pitching-lab
git pull origin main
cd functions && npm install && cd ..
npx --yes firebase-tools@latest functions:secrets:set TWILIO_ACCOUNT_SID --project diamond-zone-pitching-lab
npx --yes firebase-tools@latest functions:secrets:set TWILIO_AUTH_TOKEN --project diamond-zone-pitching-lab
npx --yes firebase-tools@latest functions:secrets:set TWILIO_FROM_NUMBER --project diamond-zone-pitching-lab
npx --yes firebase-tools@latest functions:secrets:set ADMIN_SMS_TO_NUMBER --project diamond-zone-pitching-lab
npx --yes firebase-tools@latest deploy --only functions:notifyCoachAccessRequestSms --project diamond-zone-pitching-lab
```

The four commands prompt for their values and store them in Google Cloud Secret Manager. Use E.164 phone-number format (+1...). **Only new access requests created after this function is deployed** trigger notifications; pending requests already in Firestore are not automatically sent again. Test with a fresh, verified account only after sender registration is completed.

Documentation: [Firebase Firestore triggers](https://firebase.google.com/docs/functions/firestore-events), [Firebase function secrets](https://firebase.google.com/docs/functions/config-env), [Twilio A2P messaging compliance](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc).


# Automatic deployment and Diamond Zone branding (October 2026)

**GitHub → Firebase Hosting automatic publishing is configured in the repository.** The production workflow is `.github/workflows/deploy-firebase.yml`. Pushing updates to `main` (including changes explicitly committed from ChatGPT) triggers a GitHub Actions job that:
1. checks JavaScript syntax;
2. stages **only** the approved public files via `prepare-firebase-hosting.sh` (including `dz-logo.svg`);
3. publishes them to Firebase Hosting's **live** channel, serving `dzpitchingportal.app`.

**One-time authorization still required.** GitHub Actions cannot deploy until the repository has an encrypted credential named `FIREBASE_SERVICE_ACCOUNT_DIAMOND_ZONE_PITCHING_LAB`. The official Firebase CLI can provision that secret:

```bash
cd ~/diamond-zone-pitching-lab
git pull origin main
firebase init hosting:github
```

In the interactive prompts, choose the existing Firebase project `diamond-zone-pitching-lab` and GitHub repository `44gtandrews/diamond-zone-pitching-lab`. Approve the GitHub permissions prompt. If asked to set up a build script, select **No** (the committed workflow handles staging). If asked whether to create a separate automatic live deployment on PR merge, select **No** (the committed workflow already deploys on every push to `main`). The CLI may create *local* sample workflow files, which do not have to be committed or pushed because the production workflow is already present in GitHub.

After setup, check **GitHub → Settings → Secrets and variables → Actions** for `FIREBASE_SERVICE_ACCOUNT_DIAMOND_ZONE_PITCHING_LAB`. If the CLI created a different secret name, update the secret reference in the workflow accordingly (do not reveal the secret). Visit **GitHub → Actions → Deploy Pitching Portal to Firebase Hosting → Run workflow** to trigger the initial deployment, then confirm the run is green. Subsequent pushes to `main` deploy automatically without Cloud Shell commands. Official setup guide: https://firebase.google.com/docs/hosting/github-integration

**Scope:** This workflow deploys **Hosting files only**, not Firestore security rules. When `firestore.rules` changes, review and deploy those rules separately through Firebase Console or the `bash deploy-to-firebase.sh` fallback. This separation avoids unintentionally changing database access controls on every design iteration.

**Branding:** The provided Diamond Zone DZ teal logo has been converted to a lightweight SVG (`dz-logo.svg`) for the login header, directory header, player profiles, and favicon. The original logo color `#008D97` is the primary accent. The sign-in page title is now `Pitching Portal` in white.


### Troubleshooting: "Missing or insufficient permissions" when adding a pitcher

**If you can sign in and see the PDF review but clicking Save fails**, the Firebase Hosting app is running but the **deployed Firestore Rules** likely do not include the required `playerCodes` reservation permissions. The six-digit player IDs are written in the same atomic transaction as the player profile. Uploading or deploying website code by itself **does not update Firestore Rules**.

In Google Cloud Shell, where this repository is already cloned:

```bash
cd ~/diamond-zone-pitching-lab
git pull origin main
bash deploy-to-firebase.sh
```

The deployment now includes **both** Hosting and Firestore Rules. Look for successful deploy messages for `firestore: rules` and `hosting`. Then refresh the app and retry the existing PDF review/save. For a rules-only deployment, run `firebase deploy --only firestore:rules --project diamond-zone-pitching-lab` after `git pull`. Do not weaken the rules or switch Firestore to public test mode.

If the error persists after the rules deploy, verify Firebase → Firestore Database → Rules contains `match /playerCodes/{code}`, and Firebase → Firestore Database → Data has an `allowlist/<coach email in lowercase>` document with `active: true`. Contact the administrator if access is missing. Approved coaches should not be granted unrestricted Firestore access.

## Deploy the live website to Firebase Hosting (dzpitchingportal.app)

The domain currently reaches **Firebase Hosting**, not GitHub Pages. A `Site Not Found` screen with the Firebase logo means the website files have not yet been deployed to the Hosting site (or the domain was connected to a different Hosting site).

**Fastest first deployment — no local installation needed:**

1. Open [Google Cloud Shell](https://console.cloud.google.com/?project=diamond-zone-pitching-lab&cloudshell=true) signed in with your Firebase project Google account.
2. In its terminal run:

   ```bash
   git clone https://github.com/44gtandrews/diamond-zone-pitching-lab.git
   cd diamond-zone-pitching-lab
   bash deploy-to-firebase.sh
   ```

3. Verify the CLI reports **Deploy complete!** and open `https://diamond-zone-pitching-lab.web.app/` first.
4. Firebase Console → **Build → Hosting**: confirm `dzpitchingportal.app` is attached to the **same Hosting site** and status Connected, then visit `https://dzpitchingportal.app/`.
5. Firebase Console → **Authentication → Settings → Authorized domains**: include `dzpitchingportal.app`, then test coach sign-in.

The script copies **only** `index.html`, `firebase-config.js`, `trackman-pdf.js`, `importer.js`, and `cloud.js` into the generated `.firebase-build/` directory and deploys that directory. It does not deploy private roster JSON or repository files. Do not upload any private roster backups to GitHub. The latest deployment script publishes both Hosting and the version-controlled Firestore security rules. Verify these rules before publishing because the deployment overwrites the project's active Firestore rules.

For subsequent manual deployments in the same Cloud Shell folder:

```bash
cd ~/diamond-zone-pitching-lab
git pull origin main
bash deploy-to-firebase.sh
```

To enable **automatic live deployment on future GitHub pushes**, run `firebase init hosting:github` in the repository (after the first successful deploy) and use the GitHub integration wizard to generate a service-account secret and workflow. Before enabling the generated workflow, it must run `bash prepare-firebase-hosting.sh` prior to deploying so the five app files are staged; otherwise a fresh CI checkout lacks the generated directory. Do not check service-account credentials into GitHub.

**Do not point DNS at GitHub Pages while using Firebase Hosting.** The site is hosted by Firebase and maintained in GitHub.


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

## 7. Permanent 6-digit player IDs and shareable profile links

The Pitching Lab now has a permanent **six-digit public player ID**, such as `123456`, for every pitcher. This is **not** the internal Firestore document ID; existing records keep their original keys, so previously saved notes, mechanics, grades, raw pitch logs, and session data stay attached to the same player.

- Canonical URL on GitHub Pages: `https://44gtandrews.github.io/diamond-zone-pitching-lab/?player=123456`.
- Canonical URL after a custom domain is configured: `https://dzpitchingportal.app/?player=123456`.
- The **Player ID** label and **Copy profile link** button appear at the top of each player profile. Directory links use the same address. Pasting a profile URL into another browser opens the player **after that coach signs in**.
- `?player=` is used instead of a bare `/player/123456` route because GitHub Pages does not natively rewrite direct requests for arbitrary player paths. Old `#original-player-key` links remain compatible.
- A public ID is **not an authentication credential**. Firestore security rules still limit data access to verified approved staff.
- Sharing links removes `source=chatgpt` and `utm_source=chatgpt.com` tracking parameters. These query parameters are not part of the Pitching Lab application.

**Required deployment step:** After the six-digit ID feature is updated in GitHub, REPLACE and PUBLISH your Firebase Firestore Rules with the latest `firestore.rules`. The rules now allow atomic reservations in the `playerCodes` collection. Without updated rules, automatic IDs and new-player uploads may fail.

**Existing pitchers:** The first administrator who signs into the updated app runs the one-time ID assignment automatically, when the updated Firestore rules are in place. If the rules were not yet published, publish them and reload the app signed in as administrator. Player records never change internal IDs.

**New pitchers:** Each coach-uploaded player gets a random six-digit number reserved transactionally, so two uploads cannot claim the same number. An internal opaque key is created separately to avoid naming collisions. All six-digit numbers are stored as strings and are never reused.

**Admin roster JSON imports:** Imports preserve existing six-digit IDs and notes. If the imported roster adds older-style player records without IDs, the app reserves IDs for those records automatically.

## 8. Optional custom domain: dzpitchingportal.app

**The domain has not been purchased or connected by this code change.** To use it:

1. Purchase `dzpitchingportal.app` from a domain registrar, after confirming availability. Do not assume it is available.
2. With GitHub Pages already publishing, open this repository's **Settings → Pages → Custom domain** and enter `dzpitchingportal.app`; save. GitHub can create its `CNAME` file for a branch deployment.
3. At your domain registrar, point the apex/root (`@`) A records to GitHub Pages: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`. Alternatively use the provider's appropriate ALIAS/ANAME pointing to `44gtandrews.github.io`. Configure the site in GitHub before adding DNS records.
4. Wait for DNS validation; turn on **Enforce HTTPS** in Pages when available.
5. In **Firebase Authentication → Settings → Authorized domains**, add `dzpitchingportal.app` (domain only, without a path). Retain `44gtandrews.github.io` while testing GitHub Pages.
6. Test an authenticated `/?player=123456` profile link on a different device.

See official [GitHub Pages custom domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

