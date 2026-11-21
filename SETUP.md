# Setting up the Morph website (Firebase + GitHub Pages)

This puts Morph on its own web address, free, with no credit card:

- **Firebase (Spark plan, free)** stores the projects and runs live editing.
- **GitHub Pages (free)** hosts the website. Every change pushed to the `main` branch is published automatically.

Total time: about 15 minutes. Do the steps in order. Each step says what you should see when it worked.

Repository: **https://github.com/ruelustin5/morph**
Website address once published: **https://ruelustin5.github.io/morph/**

> Never upgrade Firebase to the "Blaze" plan for this. Everything here works on the free Spark plan,
> and on Spark nothing can ever be charged: if a daily limit is reached, the database pauses until the next day.

---

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com and sign in with the Google account that will own Morph.
2. Click **Create a project** (or **Get started by setting up a Firebase project**).
3. Project name: `morph-slides` (any name works). Continue.
4. If asked about **Gemini in Firebase** or **Google Analytics**, turn them **off**. Click **Create project**, wait, then **Continue**.

✔ You see the project's overview page. The plan shown (bottom-left or in the top bar) is **Spark**.

## 2. Register the web app and copy its settings

1. On the project overview, click the **Web** icon (`</>`), or **Add app → Web**.
2. App nickname: `Morph`. Leave **"Also set up Firebase Hosting"** unchecked. Click **Register app**.
3. A code block appears with `const firebaseConfig = { apiKey: "...", authDomain: "...", projectId: "...", ... appId: "..." }`.
   Copy these four values somewhere: **apiKey, authDomain, projectId, appId**.
4. Click **Continue to console**.

(If you lose them: gear icon ⚙ → **Project settings** → **General** → scroll to **Your apps** → **SDK setup and configuration** → **Config**.)

## 3. Turn on sign-in

1. Left menu: **Build → Authentication** (or **Security → Authentication**). Click **Get started**.
2. Tab **Sign-in method**:
   - Click **Anonymous** → turn on **Enable** → **Save**. (Visitors with a link use this; they never see it.)
   - Click **Add new provider** → **Google** → turn on **Enable** → choose the **support email** (your address) → **Save**.
3. Tab **Settings** → **Authorized domains** → **Add domain** → type `ruelustin5.github.io` → **Add**.

✔ The sign-in method list shows **Anonymous: Enabled** and **Google: Enabled**; authorized domains include `ruelustin5.github.io`.

## 4. Create the Firestore database (projects)

1. Left menu: **Build → Firestore Database** (or **Databases & Storage → Firestore**). Click **Create database**.
2. If asked for an edition, choose **Standard edition**.
3. Location: choose one near you, for example `northamerica-northeast1 (Montréal)` or `nam5 (United States)`. It cannot be changed later; any choice works.
4. Choose **Start in production mode**. Click **Create**.
5. When the database is ready, open the **Rules** tab. Delete everything in the editor and paste the whole content of
   [`firestore.rules`](https://github.com/ruelustin5/morph/blob/main/firestore.rules) from the repository. Click **Publish**.

✔ The Rules tab shows the new rules (they start with `rules_version = '2';` and mention `pub/space`), with a "published" time.

## 5. Create the Realtime Database (who is online, live cursors)

1. Left menu: **Build → Realtime Database** (or **Databases & Storage → Realtime Database**). Click **Create Database**.
2. Location: **United States** (or the closest offered). Next.
3. Choose **Start in locked mode**. Click **Enable**.
4. At the top of the **Data** tab there is an address like `https://morph-slides-default-rtdb.firebaseio.com/`.
   Copy it: this is the **databaseURL**.
5. Open the **Rules** tab. Delete everything and paste the whole content of
   [`database.rules.json`](https://github.com/ruelustin5/morph/blob/main/database.rules.json). Click **Publish**.

✔ The Rules tab shows the rules with `"rooms"` and `"locks"`.

## 6. Put the settings into the website

1. Open https://github.com/ruelustin5/morph/blob/main/src/web/firebase-config.js
2. Click the **pencil** (Edit this file).
3. Replace each `PASTE_…` value with the matching value you copied:

   ```js
   export default {
     apiKey: 'AIza…',                                         // from step 2
     authDomain: 'morph-slides.firebaseapp.com',               // from step 2
     databaseURL: 'https://morph-slides-default-rtdb.firebaseio.com', // from step 5 (no slash at the end)
     projectId: 'morph-slides',                                // from step 2
     appId: '1:123…:web:abc…',                                 // from step 2
   };
   ```
   Keep the quotes and commas. These values are not secret (they only name the project); the rules from steps 4–5 protect the data.
4. Click **Commit changes…** → **Commit directly to the main branch** → **Commit changes**.

## 7. Turn on GitHub Pages

1. Open https://github.com/ruelustin5/morph/settings/pages
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. If GitHub says Pages is not available for this repository (private repositories need a paid GitHub plan):
   go to **Settings → General → Danger Zone → Change repository visibility → Public**, confirm, then come back to step 7.2.
   (The code has no secrets: projects are stored in Firebase, not in the repository.)
4. Open https://github.com/ruelustin5/morph/actions. If no **Deploy** run is in progress, click **Deploy** (left) → **Run workflow** → **Run workflow**.
5. Wait until the run has a green check (about 2 minutes).

✔ https://ruelustin5.github.io/morph/ opens Morph and shows **"Welcome to Morph"**, with **"Make this my space: sign in with Google"**.
If it still shows a yellow banner "Firebase isn't set up yet", step 6 was not saved: check the file and wait for a new Deploy run.

## 8. Claim the space (the owner must do this first)

1. On https://ruelustin5.github.io/morph/, click **Make this my space: sign in with Google** and pick the owner's Google account.
2. The page reloads into the editor. The button next to the logo says **Your space**.

✔ Only this Google account can see the private projects. Anyone else who opens the address without a link sees "Open the link you were sent".

## 9. Bring the projects over from the Claude version (optional)

For each project in the Claude artifact: **⋯ (top bar) → Download project file**.
Then on the website: **⋯ → Open project file…** and pick the file.

---

## Sharing a project

Open the project → click the **lock** next to its title → type the person's name → **Create link**. The link is copied:
send it. They open it and are straight in the project, with their name shown to others. No account needed.
**×** next to a person removes them (their link stops working; the project gets a new key automatically).

## If something doesn't work

| What you see | Fix |
|---|---|
| Yellow banner "Firebase isn't set up yet" | `src/web/firebase-config.js` still has `PASTE_…` values (step 6), or the Deploy run hasn't finished. |
| Google sign-in popup says `auth/unauthorized-domain` | Step 3.3: add `ruelustin5.github.io` to Authorized domains. |
| Sign-in popup closes and nothing happens | The browser blocked the popup: allow popups for `ruelustin5.github.io` and click again. |
| "Missing or insufficient permissions" | Rules not published (steps 4.5 and 5.5). |
| Nobody else appears live / cursors missing | Realtime Database not created, wrong `databaseURL`, or its rules not published (step 5). |
| Actions run failed | Open the run, read the red step, and send the error to Claude. |

## Future updates

Claude pushes changes to this repository; GitHub Pages republishes the site automatically after each push.
If a change ever needs new Firebase rules, the update will say so, and you paste the new rules as in steps 4.5 / 5.5.
