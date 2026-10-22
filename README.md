# Trackman dual-PDF import and pitch-type visibility — October 22, 2026

This release adds safe PDF recognition for both Diamond Zone Trackman/Power BI reports while keeping the original player profile navigation, notes, mechanics, strength, scouting grades, movement graph and Trackman upload permissions.

## Import formats
- **Classic three-table pitching report** (e.g. PJ Colon): reads actual pitch counts, average/max velocity, spin, extension, IVB/HB, tilt and strike/VAA fields where available. Supports regular single-session updates using count-weighted merging, preserving duplicate-SHA checks. A new baseline PDF showing multiple selected source sessions is labeled accurately using `importHistory.sourceSessionCount`; updates with multiple sessions selected remain blocked.
- **Pitch-type averages and release-position report** (e.g. Mason Alderman): reads actual velocity, spin, IVB/HB, extension, release height, release side, 2D/3D spin axis and gyro by column position, preserving true blanks and correctly identifying Cutter, Knuckleball and Other. Missing counts, usage, max velocity and exact session count stay `null`/unavailable. No inferred values are saved. The player document uses `summaryOnly:true`, and its existing `sessions` property counts report imports rather than claiming actual session count.
- For an existing averages-only profile, a newly imported averages report **replaces the previous snapshot** with a confirmation; the old pitch summaries are archived in the new import-history entry as `replacedSnapshot`. Duplicate file hashes are rejected.
- Counts-based and averages-only formats cannot be mixed in the same existing player profile because combining their statistics would be invalid. Create a separate summary profile or supply a true single-session report.
- On the upload review screen, all fields are editable except unavailable pitch counts; a coach may remove unwanted pitch types **before saving**, up to eight types per profile as allowed by current Firestore rules.

## Remove and restore pitch types
- Admins and pitching coaches can click **Remove** beside a pitch type in the profile table, including Knuckleball, and later use **Restore** below the table.
- These are non-destructive visibility controls for the directory, charts and pitch tables; raw data and saved scouting grades are retained.
- Visibility lives in the existing, secure `playerEdits/{id}/sections/grades` document as `__hiddenPitchTypes` and merges with existing saved numerical grades. It is included in existing backups.
- No change was made to `cloud.js`, `firestore.rules`, authorization, backup logic or the original profile heading font. Existing records do not require migration.

## Test coverage before deployment
- JavaScript parsing for all updated scripts and the inline app script.
- Synthetic position-accurate PDFs representing both uploaded examples, including blank columns and release axes.
- Mock upload and Firestore transaction flow for new classic and averages-only profiles.
- Mock snapshot replacement (archive prior), plus refusal to merge counted and counts-free sources.
- Persistent hide/restore test with grade preservation.
- Summary-only profile rendering: missing counts and usage display as unavailable, with release and spin-axis columns.

## Limitations
- The second PDF format provides pitch-type averages, **not individual pitches**. It cannot produce per-pitch logs or defensible usage percentages. Release-side and height are not a measured anatomical arm angle.
- An actual production Firebase upload has not been performed as part of the release tests; avoid writing test players into the live database.

# Approved Clubhouse interface release — October 22, 2026

The live Pitching Portal now uses the approved Clubhouse / Performance Lab presentation on the Player Directory, navigation, Admin Dashboard and player-profile chrome. The original player-profile **format** stays intact: movement plot behavior, velocity chart, pitch usage chart, pitch table with editable grades, notes, mechanical changes, strength and mobility, pitch log and upload button are still the same sections in the same order. In particular, the player's name retains its original italic Barlow Condensed athletic font, weight and style.

### Player Directory

- Wider Clubhouse-style content width, branded top navigation, restrained borders and organized typography.
- Existing Internal and External membership, age group groupings and alphabetical-by-last-name sorting remain driven by `sortGroups()`.
- Pitches remain ranked by usage; grade labels come from saved 20–80 evaluations, with average velocity shown, and ungraded pitches clearly distinguished.
- Functional client-side name search and age filters. These filter already-approved roster rows and do not query or modify Firestore.
- Scouting reference in a right-hand column on desktop, below the roster on mobile. The jump button scrolls without changing the URL hash, so it does not interfere with legacy player links.

### Admin and profile screens

- Access requests, account roles, inactive player archive, roster/JSON backups, and all existing actions remain wired to their original elements; admin section links are visually simplified.
- Profile visuals are updated to the common Clubhouse colors and navigation, but the analytics charts, notes sections, data calculations, grade selections, and layout order are not changed.
- No changes to `importer.js`, `trackman-pdf.js`, `cloud.js`, `firestore.rules`, `firebase-config.js`, IDs, or upload workflows.

### Deployment and rollback

The approved design was staged on `clubhouse-ui-approved-20261022` first and merged to `main` only after static UI checks: inline JavaScript syntax, CSS brace balance, DOM identifier preservation, functional search/filter test, protected profile-code comparison, and confirmation that importer/Firestore files match pre-release SHAs. GitHub Actions automatically publishes `main` to Firebase Hosting. This release does not require new Firestore rules or data migration. Previous security-rule deployment requirements for four-role access remain separate.

# Player Directory — age-relative scouting grades (October 22, 2026)

The **Internal and External Player Directory** displays each pitcher's pitch types ordered by **recorded usage** (highest pitch count first), but the value beside each pitch is now the actual **saved scouting grade**, in the form `50 Grade`, rather than its usage percentage. The average pitch velocity (mph) continues to appear next to the grade.

- Grades are read from the existing per-player `playerEdits/{playerId}/sections/grades` Firestore section, which is already permission-scoped for approved accounts. No pitch count or Trackman data is modified.
- **Only previously assigned grades are displayed.** A pitch that has never received a saved grade shows `Not graded`. If a grade request fails, the directory shows `Grade unavailable`, not a guessed/default rating; the request can retry on subsequent navigation.
- The player profile's grade selector also now displays `— Not graded —` before the first save. Selecting a grade explicitly saves it as before, and updates the in-memory grade cache so the Player Directory will reflect it when opened again. Existing saved 20–80 grades are preserved, including grades of 50.
- The home page includes a **20–80 Scouting Scale** with the steps `20 Well below`, `30 Below`, `40 Slightly below`, `50 Average`, `60 Above`, `70 Plus`, `80 Elite`. The key explains that coach-assigned grades evaluate the quality of each pitch **relative to the pitcher's age group**, not against professional velocity or an automatically generated algorithm.
- Both Internal and External tabs share the key. It is responsive on mobile. The original pitch-usage percentages remain available within the detailed player profile analytics; only the home-page rows change.
- Reading grades is cached per in-memory player record during a session to reduce repeat Firestore reads. A fresh roster load rereads them. Failed grade reads retry.

This is a **Hosting-only code and UI change**. No new Firestore security rules are required for the grade display; however the previous four-role access-control rules must still be deployed separately if not already published.


# Mobile layout polish (October 22, 2026)

The Pitching Portal now has a dedicated responsive layout for phone-sized browsers (especially approximately 320–640 px wide), without changing desktop features or Firestore records.

- **Sign-in and navigation:** single-column sign-in form, thumb-sized buttons, legible account identity and sign-out. Admins get full-width Directory / Admin navigation tabs. Player/Parent navigation shows only the assigned profile, without an empty directory tab.
- **Player directories:** Internal and External tabs fit side by side, with names, pitch usage percentages and average velocities in aligned, readable pitch rows.
- **Player profiles:** responsive logo/headings, two-column stat tiles with a full-width fifth metric, stacked actions, a horizontally swipeable profile tab strip, vertical charts, and contained horizontally scrollable pitch tables.
- **Coaching controls:** notes and mechanical/strength forms expand to the available width; text inputs and edit actions have phone-friendly touch targets.
- **Trackman uploads:** full-screen phone dialog, single-column player fields and action buttons, and a horizontally scrollable pitch-review grid with a swipe hint.
- **Admin Dashboard:** access requests and account roles are displayed first, followed by inactive players, complete JSON backups and legacy roster utilities. Mobile-only section shortcuts help navigate long admin screens without changing URL routing. Account permission cards, role selectors and action buttons stack so none run off-screen.
- **Accessibility:** scroll regions have labels and keyboard focus, tap targets are enlarged, reduced-motion users do not receive forced transitions, and safe-area padding accommodates mobile devices.

These are **presentation and navigation changes only**. The current Hosting-only GitHub Actions workflow automatically deploys them on a push to `main`. No additional Firestore security-rules deployment is needed for this *mobile formatting* update (but the previously requested four-role security-rule deployment is still separately mandatory if it has not been completed).

# Four-role account access and individual Player/Parent profiles (October 22, 2026)

## Access model

| Role | Can access | Can upload Trackman | Can edit notes / grades / pitch types | Admin permissions |
|---|---|---|---|---|
| **Admin** (`admin`) | All players, archives, accounts and backups | Yes | Yes | Full access |
| **Pitching Coach** (`pitching_coach`) | All active players | Yes, create pitchers and upload sessions | Yes | No |
| **Coach** (`coach`) | All active players | No | No — read only | No |
| **Player / Parent** (`player_parent`) | **One assigned active player only** | No | No — read only | No |

The account's role and, for Player/Parent, the **exact linked Firestore player document ID** live in the existing `allowlist/{lowercase-email}` record. The linked player is chosen by an administrator, not by the parent. There is currently **one linked player per Player/Parent account**. A family needing access to siblings would require an explicit future multi-player permission design; never grant them full-roster Coach permission to work around that restriction.

Accounts with `active:false` are blocked. The person creating a Firebase Authentication login must verify their email; login alone never grants access.

**Existing accounts:** The prior `coach` role now means **read only**, in line with the new role definitions. If an existing coach should continue uploading Trackman data or changing notes, an administrator must assign them **Pitching Coach** using the account permissions controls.

## Administrator controls

Go to **Admin Dashboard → Account Permissions**:
- Existing accounts display their email, role, active/disabled state, **role dropdown**, **linked-player dropdown** (only for Player/Parent), **Save role**, and **Disable / Reinstate**.
- Pending coach signups also offer a role and specific player selection before approval. Directly invited staff can be assigned the right role up front.
- Changing someone else to **Admin** requires typing `ADMIN` into a confirmation. Demoting an admin requires typing `DEMOTE`; disabling another active admin also requires confirmation. You cannot demote or disable **your own signed-in administrator account** from this UI, and Firestore rules enforce the self-protection.
- Use an emergency Admin account only for a trusted person with full access. Every admin can manage accounts, delete players and restore private data.
- Staff whose roles are changed should **refresh/sign in again** for their browser UI to reflect the new permissions. Firestore reads and writes are evaluated against the current allowlist record on every request, so the database rules take effect independently of a browser refresh.

## Parent confidentiality and read-only user interface

The browser only retrieves `players/{assignedPlayerId}` for a Player/Parent account. It does not query the entire `players` collection or `playerCodes` and does not display the Player Directory or Admin Dashboard. Profile URLs pointing to other players are ignored; the assigned player is shown instead.

Firestore Security Rules v2 additionally enforce:
- `players/{id}`: only Admin/Pitching Coach/Coach may **list** the roster. A Parent may **get** exactly their assigned active player.
- `playerEdits/{id}/sections/{section}`: a Parent can **get** notes/grades only for their linked active player; they cannot list or modify other records.
- Writes to `players`, pitch sessions, notes, grades and pitch overrides are reserved for Admin or Pitching Coach. Account changes, profile identity changes, archives, deletion and backups are Admin-only.
- Coach and Parent pages render note textareas as read-only and disable grade and pitch-type editing controls. Upload controls are hidden. **The database rules, not the hidden buttons, are the actual security boundary.**
- Inactive / deleted player profiles are not available for Parent viewing until reactivated (or restored).

## MANDATORY one-time security-rules deployment

The GitHub Actions workflow only automatically deploys **Hosting files**. It does **not** publish changes to Firestore rules. Do **not** approve a Player/Parent or make role changes under the old permissive rules: legacy rules allowed any approved account to read the entire roster.

After the role management code is committed, publish the new repository `firestore.rules` using the Firebase CLI on the Mac already authenticated for project `diamond-zone-pitching-lab`:

```bash
cd ~/diamond-zone-pitching-lab
git pull origin main
npx --yes firebase-tools@latest deploy --only firestore:rules --project diamond-zone-pitching-lab
```

As an alternative, copy the exact `firestore.rules` from the repository into **Firebase Console → Firestore Database → Rules**, review them, and publish.

The website checks a specially allowed `get` of `rolePolicy/v2` (no document needed) before enabling new role assignments or parent login. The previous rules reject this probe, so account role changes fail closed until the new rules have been published. This is a rollout safety check **not** a substitute for deployed security rules.

## Emergency JSON backups

The full private JSON backup includes all `allowlist` entries, including each account role and its linked `playerId`. Emergency restore preserves non-admin permissions but never creates or overwrites admin roles. Restoring access roles also requires the Role Policy v2 security rules to be live. Keep snapshots encrypted and private.


# Player status, deletion and last-name sorting (October 2026)

## Directory sorting by surname

- **All active Internal age-group rosters** are sorted alphabetically by players' **last names**, not given names.
- **External** lesson players are also sorted by last name in the single alphabetic list.
- **Inactive Players** in the administrator dashboard are sorted by last name.
- The comparison ignores common generational suffixes (Jr., Sr., II–V) when identifying a surname; it uses the complete name as a tie-breaker and preserves hyphenated surnames.

## Inactivate and reactivate (administrator only)

- From an **active player profile**, click **Inactivate Player** and confirm.
- Inactive players disappear from the Internal / External directories and normal player links. The Firestore player document remains intact with the optional field `inactive: true` and audit fields `statusChangedBy` and `statusChangedAt`.
- The administrator tab has **Inactive Players**, with counts and records (name, Internal/External, age group, six-digit ID), plus **Reactivate** and **Delete** controls. Reactivation sets `inactive: false` and the player returns to their appropriate program/age-group directory.
- Historic players lacking the new `inactive` flag remain active automatically; no migration or reimport is required.
- Importing new Trackman sessions into an inactive profile is blocked until reactivation. An active player's profile remains editable as before.
- Inactivation is a **roster display/archive action**, not a new Firestore security boundary. Approved coaches' existing database read permissions are unchanged. For confidentiality restrictions on archived records, database architecture/rules would need further work.

## Permanently delete a player (administrator only)

- Administrators can choose **Delete Player** on an active profile or **Delete** in the Inactive Players admin list.
- The operation requires typing `DELETE` into a confirmation dialog, and displays a warning to download a full emergency backup first.
- Upon confirmation the app atomically deletes the player's Firestore document and all `playerEdits/{playerId}/sections` coaching notes, grading, strength, mechanical and pitch-override records.
- The original six-digit `playerCodes/{code}` reservation remains as a **non-identifying tombstone** pointing to the retired internal ID, to stop old player links from being reassigned to unrelated athletes.
- Deletion is permanent for active Firestore player and coaching data. Recovery from an earlier full JSON backup remains possible while keeping the original ID reservation.
- The existing `firestore.rules` already permit administrator deletion of `players` and `playerEdits`, and administrator changes to `players.inactive`; **this update requires no new Firestore rules deployment**, assuming the previously published rules are current.
- Only admins see the deletion/inactivation controls. Regular coaches cannot use these controls.


# Internal / External roster tabs and directory velocity (October 22, 2026)

## Directory membership

- The **Player Directory** has separate **Internal** and **External** tabs for all approved coaches.
- **Internal** means the athlete plays for the Diamond Zone program. Internal players are grouped by age (10U–18U, and Coach / Adult) with age groups ordered from youngest to oldest.
- **External** means the athlete attends lessons but plays on another team. External players are displayed in one alphabetical-by-name list, **not separated by age**.
- Both tabs display the number of players assigned to each group. The home subtitle shows Internal, External and total counts.
- Players created before this feature who lack the `affiliation` field are automatically treated as **Internal**. No migration is needed, and no roster or coaching data is discarded.

## Adding and updating pitchers

- **+ Add Player → Program affiliation**: select `Internal · Diamond Zone program` (default) or `External · Lessons / other teams`; also select the player's age for performance analysis. The affiliation is stored in `players/{id}.affiliation`.
- **Edit Profile** (admin-only, beside Upload New Session) can update name, age group and affiliation. Switching External → Internal moves the player to the Internal age-group directory; Internal → External moves them into the alphabetical External directory.
- Affiliation changes update the existing Firestore document and preserve the player's stable internal ID, six-digit public URL, sessions, pitch data and notes.
- The category is also shown beneath the player's name on their profile.
- Both groups are visible to **approved coaches** under the existing Firestore permissions; "External" is a roster category, not a separate permission/security boundary.

## Pitch usage and average velocity on the directory

- Each pitcher row shows **all tracked pitch types**, descending by usage percentage, with colored pitch dots.
- Each pitch now also shows **average velocity in mph** (one decimal place) beside the usage percentage. Examples: `Four-Seam 62.5% 73.4 mph`, `Changeup 37.5% 65.2 mph`.
- Imported aggregate Trackman summary velocity is the recorded / pitch-count-weighted average stored by the importer. For raw per-pitch logs the directory computes an **arithmetic mean** across raw pitch speeds of that pitch type. The profile's existing velocity analyses, including raw median values, remain unchanged.
- Missing velocity reads `— mph`. Session counts and the single "primary pitch" label remain excluded from roster rows.

This update changes **Hosting files only**. Firestore's existing `players` create and admin update permissions already allow the optional `affiliation` field, so **no rules deployment is required for these features**. With the connected GitHub Actions → Firebase workflow, approved code updates on `main` publish automatically. If that workflow fails, inspect the GitHub Actions run before retrying a manual deployment.


# Player directory, profile editing and full emergency JSON backups (Oct 22, 2026)

## Player directory
- The Player Directory row shows **every tracked pitch type** with its share of recorded pitches (one decimal place), including a matching pitch-color dot.
- The directory no longer displays sessions, a primary pitch, or fastball velocity in each roster row. Player profile KPI cards and pitching analyses are unchanged.

## Editing player identity (admin only)
- On any player profile, an approved administrator sees **Edit Profile** beside **Upload New Session**.
- Update **player name** and **age group** (10U–18U or Coach / Adult), then save.
- Edits update the original Firestore `players/{id}` document, never recreating it or changing its permanent internal ID or six-digit public ID; its stats, grades, notes, links and history are preserved.
- A player moved to a different age group appears under the newly appropriate Player Directory grouping after saving.
- Non-admin coaches may still upload sessions and coaching notes under the existing security rules, but cannot edit player identity.

## Full administrator backup
Open **Admin Dashboard → Emergency data backup and restore → Download full backup JSON**.

The download is a **private, unencrypted** `diamond-zone-full-backup-YYYY-MM-DD.json` containing:
- All `players` (including aggregated pitching data, stored session history, player metadata)
- All permanent `playerCodes` reservations
- Every player `playerEdits/{id}/sections` entry (notes, mechanics, strength, grades, overrides)
- The `allowlist` of staff approvals / disabled accounts and `coachRequests`

Timestamp values are serialized with a typed wrapper so they can be restored. The snapshot is generated from Firestore reads immediately before downloading, not from just the user's currently loaded roster. Store backups **securely or encrypted**: they contain private youth player data and staff email addresses. Prefer keeping an offline copy after each meaningful data update.

**Not included:** Firebase Authentication user accounts/passwords (those cannot be exported from this browser-only Firestore workflow), Firebase project/IAM configuration, security rules, hosted source code, Firebase Functions credentials or SMS messages. Project rules/source remain versioned in GitHub. Recovering a completely deleted Firebase project requires additional administrative recovery work and is **not** a one-click restore.

## Emergency restore
1. While signed in with an approved administrator account, open **Admin Dashboard → Restore a full backup** and choose the JSON export.
2. Click **Restore full backup**. The app validates file format, Firebase project ID, player records, all six-digit reservations and any clashes with current player IDs.
3. Read the confirmation carefully and type `RESTORE` to proceed.
4. The app writes player records, restores missing code reservations, restores notes and pitch grades, restores coach-level access and missing applications, then refreshes the directory.
5. **Records not included in the backup are never deleted.** Records included in the backup (player data, notes, coach approvals) may be overwritten, so this should be used only for emergency recovery. Existing admin roles are never altered or created, and newer review decisions on existing applications are not overwritten.
6. If an operation fails partway through, earlier batches may already be restored; repeat the same file after resolving permissions or connectivity.

**Required rules release:** the repository's updated `firestore.rules` allows admins to restore historic coaching notes and requests. The existing automatic GitHub Actions workflow deploys **Hosting only**, so after this code update you must publish the new Firestore rules once. In a terminal in the repository:

```bash
cd ~/diamond-zone-pitching-lab
git pull origin main
npx --yes firebase-tools@latest deploy --only firestore:rules --project diamond-zone-pitching-lab
```

Or copy `firestore.rules` from GitHub into **Firebase Console → Firestore Database → Rules** and publish. Do not weaken the rules or use public test mode. The app remains available while rules are updated.

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

