# By Heart: notes for Claude

"I have stored up your word in my heart." (Psalm 119:11, ESV)

By Heart is a static web app (plain HTML/CSS/JS, no build step) for memorizing Bible verses and common prayers. It installs to a phone's Home Screen and works offline. The owner is Protestant: the library has Protestant prayers and creeds only, and the main flow is picking any verse in the translation you want. It's built for every kind of learner, including people with dyslexia, ADHD, autism, motor or hearing differences, and older adults, based on a research report the owner commissioned ("Scripture memorization for diverse learners"). The owner also made Iron (`~/Desktop/iron`) and publishes both on GitHub Pages under `jack-norby.github.io`.

## Files (one flat folder, so drag-and-drop uploads to GitHub keep working)
- `index.html`: the shell. Header, `.scroller` with `main`, bottom tab bar, toast, live region. Sets the theme before first paint.
- `app.js`: all screens (Welcome, Today, Library, item page, Add, Progress, Settings, practice session, "Say it to someone") and saved state.
- `words.js`: splitting text into lines/phrases, cue rendering helpers, forgiving answer checking (word alignment, spelling slips, sound-alike words, numbers).
- `memory.js`: scheduling. FSRS-4.5 default weights plus the "three good days" ladder.
- `bible.js`: the 66 books (with chapter counts), the translations, reference parsing, and fetching a passage from each source (see Translations below).
- `config.js`: the proxy addresses (`esvProxy`, `apiBibleProxy`; usually the same Worker). Empty means "not set up yet".
- `library.js`: `POPULAR` verses and `SCRIPTURE_PRAYERS` (references plus a title and "What it means" note; the words are fetched in the chosen translation) and `PRAYERS` (Protestant prayers, creeds and catechism answers with fixed traditional wording).
- `account.js` + `firebase-config.js`: optional accounts (Firebase, its own project, not Iron's). Off while the config is `null`; setup in `../ACCOUNTS.md`.
- `../esv-proxy/`: a Cloudflare Worker that holds the ESV and API.Bible keys (`/passage` for the ESV, `/bible` for NIV, NKJV and CSB). Not part of the website upload.
- `style.css`: the whole design. Theme tokens at the top (cream default, light, mist, oxblood, night).
- `sw.js`: offline cache. `manifest.webmanifest` + icons (`icon-192/512.png`, `apple-touch-icon.png`, `favicon-32.png`, home-screen icons are a cream heart with a cross cut out, on oxblood #7a2e2e. The browser-tab icon (`favicon.svg`, `favicon-32.png`) is just the heart with the cross cut out, like the header mark: oxblood in light mode, gold #e3b76c in dark mode. The icon links carry `?v=` so updates show).

## How practice works (keep these; they're the research findings)
- **Recall, not rereading.** Every step asks for the words from memory, then shows word-level feedback.
- **Lines and fading cues.** A passage is learned a line at a time: read it aloud (cue 0), some words blank (1), first letters (2), from memory (3), then join it to the line before. A miss below 90% inserts a step back with more help (at most twice), then moves on. No penalties, no timers.
- **Three good days.** After the first full recall, reviews are capped at 1, 3, 7 days until the passage is recalled well (grade 3+) on three different days; then it's "Memorized" and FSRS spaces reviews freely (max 365 days). A forgotten review sets `refresh`, so the next review starts with a first-letters warm-up.
- **Forgiving checking** is on by default: spelling isn't memory. Short words only forgive a swapped/missing letter (so love/live stays wrong).
- **Answer methods:** Say it then check (default, self-marking), Speak (Web Speech API, hidden if unsupported), Tap the words, Type first letters, Type it. In tap/letter modes, words the cue already shows are given.
- **Habits without shame.** Weekly goal (days per week) instead of streaks; no loss messages; "Just one (1 minute)"; an if-then plan ("After I ___, I'll open By Heart"); a daily reminder is a downloaded .ics calendar event.
- Welcome asks "What helps you learn?" (never a diagnosis) and sets presets.
- The welcome screen shows every time the app opens for someone who isn't signed in (owner's request); signed-in people go straight in. account.js keeps a `byheart-signedin` hint in localStorage because Firebase restores the sign-in a moment after load. For someone already set up, **Get started** goes straight to Today.

## Data
- localStorage key `byheart-v1`: `{ settings, plan, progress: {id: {stage: learning|practicing|memorized, learned, s, d, due, last, good, refresh, reps, lapses, history}}, custom: [items], edits: {id: {text}}, days: {"YYYY-MM-DD": {s: steps, r: reviews}}, welcomed }`.
- Every verse someone adds is a `custom` item: `{id, custom, kind: verse|prayer, title, ref, tr, text, credit, about, r: {book, ch, a, b}, verses}`. The text is saved on the device so practice works offline. NIV, NKJV and CSB items also keep `fums` (the FUMS token), `fetched` (ms timestamp) and `from` (where a Scripture prayer starts). An empty `text` means "waiting for a refresh": the item stays, with its progress, but is left out of practice.
- `byheart-fums` holds FUMS view reports made offline, sent when the app is next online.
- Backups: download a JSON file or copy a base64 backup code (Settings). NIV, NKJV and CSB words are left out and fetched again after a restore.
- Editing a passage's words clears its progress (after a confirm).

## Translations
The picker offers only the ESV, NIV, NKJV and CSB (owner's decision, Oct 20, 2026: BSB, KJV and WEB were removed as choices). Choosing verses shows a grid of verse numbers from `VERSE_COUNTS` in `bible.js` (standard English numbering, built once from the BSB), so no Bible text loads and the licensed sources are only asked when someone adds a passage. A translation that numbers a verse differently (e.g. 3 John 15 in the ESV) can still be reached by typing the reference.
- **NIV:** through API.Bible like the NKJV and CSB (owner's decision, Oct 20, 2026, after reading Biblica's terms; API.Bible's NIV comes with Biblica's own license as custom terms). Same API.Bible rules apply, plus a link whose text includes "Biblica" every time NIV text is shown (`linkText` in `bible.js`). Not through YouVersion Platform: the owner's YouVersion app "By Heart" is unused and that license was never accepted there.
- **ESV:** Crossway's ESV API through `../esv-proxy` (the key must not be published). Free for non-commercial use only (no ads, sales or donations); show "ESV", Crossway's copyright line and an esv.org link; at most 500 ESV verses stored per device (the app enforces this).
- **NKJV, CSB:** API.Bible (rest.api.bible) through the proxy's `/bible?tr=NKJV&ref=JHN.3.16-JHN.3.18` route. They aren't on YouVersion Platform (as of Oct 2026). Free Starter plan (checked Oct 20, 2026 against the terms dated Sept. 3, 2026): non-commercial only, up to 3 licensed Bibles, 5,000 calls a month for the whole app, and the NKJV only while the app has 5,000 or fewer monthly users. The Worker finds each Bible's ID by abbreviation (CSB is `a556c5305ee15c3f-01` per the docs; the NKJV ID isn't published) and passes back the text, API.Bible's copyright line and the FUMS token. Untested against the live API (no key yet): check the text format the first time. What the terms require, and where the app does it:
  - **FUMS** (required for web apps): `Bible.reportView(token)` loads pkg.api.bible/fumsV3.min.js only when NKJV/CSB text is shown and calls `fums("trackView", ...)`. It runs on the item page, the "Say it to someone" screen, the add-a-verse preview, and the start of each practice passage, at most once per screen per 10 minutes.
  - **30-day recency:** `refreshLicensed()` in app.js fetches saved passages again after 25 days (on start, on `online`, and when the app comes back to the foreground). It hides the words after 30 days without a refresh, and removes them when the proxy answers 410 (Bible no longer licensed).
  - **Text only:** no text-to-speech for copyrighted text, so there are no Listen/Hear it buttons and no auto-read for these (`speech: false`). The words can't be edited (`editable: false`).
  - **Citations:** the abbreviation after the reference links to `#copyright`, a page with each translation's full notice, the publisher's site and a link to api.bible (the Starter plan must show one). The credit line under the text links there too.
  - Fewer than 500 verses cached: `maxVerses: 499` per device. The key never goes in the website files. Not done: DRM. The terms' section 12 asks for "industry-standard DRM"; a web app can't really do that, so backups just leave the words out. Ask API.Bible if this matters.
- Never put an ESV or API.Bible key in the website files.
- Editing the words is off for ESV, NIV, NKJV and CSB passages fetched by the app (`editable: false`; Crossway and API.Bible don't allow changes). Pasted or typed text can always be edited.
- The live Worker is `by-heart-bible` (https://by-heart-bible.jnorby.workers.dev); `config.js` points both `esvProxy` and `apiBibleProxy` at it. The ESV adds a psalm's title ("A Psalm of David.") before verse 1; `esvPassage` drops it. Status and redeploy steps are in `../esv-proxy/README.md`. API.Bible's NIV puts a "Psalm N" heading before verse 1; `Bible.passage` drops it. Changing what the app does with NKJV/CSB text? Re-read api.bible/terms-and-conditions first (sections 7, 9, 11, 12, 14).

## Accounts
- Firebase compat SDK 10.12.2 from gstatic, loaded only when `firebase-config.js` has a config. Google (popup, redirect fallback) and email/password, like Iron.
- Firestore `users/{uid}` = `{state, updated, device, email}`; rules allow only the owner and only those keys (in `ACCOUNTS.md`).
- Sync is newest-copy-wins on `state.updated` (stamped by every `save()`; `writeLocal()` saves without stamping or syncing). A device's first sign-in to an account (`state.account !== uid`) merges both copies instead. Remote changes that arrive mid-practice wait until the session ends.
- Words fetched from the ESV, NIV, NKJV or CSB services are stripped before upload (only references sync) and re-fetched on each device. Pasted/typed/public-domain words sync.
- Sign out leaves the phone fresh except for look settings. Delete removes the Firestore doc first, then the sign-in (if Firebase needs a fresh sign-in, the copy is put back).
- To test without a real project, the preview swapped `firebase-config.js` for a stand-in `firebase` object; nothing like that is in the project.

## Pasting from the Bible App
- Library → "Paste from your Bible app" (`#paste`). The person copies verses in the YouVersion Bible App (or bible.com) and pastes; `Bible.readPasted` finds the reference, the translation (from "John 3:16 ESV" or the bible.com link's version number) and the words. It strips the invisible marks the app puts around dashes and the verse numbers between verses. The exact copy format isn't documented, so everything is shown in editable fields before saving.
- Android can share straight in: `share_target` in the manifest opens `index.html?text=…&url=…`, which goes to `#paste`. iPhones only allow copy and paste for web apps.
- Pasted items have `src: "paste"`. They're the person's own copy for personal memorizing, so API.Bible's rules (no reading aloud, no editing, FUMS, 30-day refresh) never apply to them, even for NIV, NKJV or CSB. `Bible.licensed(item)` checks `src`, so pass the item, not just its translation.
- Don't fetch or scrape text from the Bible App or bible.com in code: that's against YouVersion's terms and the publishers' copyright.

## Content rules
- Protestant only (the owner's choice): no Hail Mary, Rosary, Orthodox prayers or saint devotions.
- Prayers use traditional public-domain wording (Luther's prayers are the 1921 Triglot translation). The ELLC Apostles' and Nicene Creeds carry the ELLC credit line. Wording varies by church, so every item can be edited to match.
- Anyone can write their own prayer (or type in a verse) under "Write your own".
- Plain, gentle language. No "brother/guys/he" for the user, no pathologizing words, no exclamation-mark hype.

## Working on it
- Preview: `python3 -m http.server` in this folder, then open http://localhost:8000. The service worker is skipped on localhost so edits show up; add `?sw` to the address to test offline mode.
- Check phone width (about 375px) for horizontal overflow and the console for errors.
- Python can't read the Desktop folder (macOS privacy), so the preview serves a copy. Copy the folder somewhere outside Desktop/Documents first, or allow Terminal Full Disk Access.
- `window.ByHeart` in the console exposes `state()`, `session()`, `Words` and `Memory` for debugging.
- **Release:** bump the version everywhere at once (the `?v=` strings, `data-version`, and `VERSION` in sw.js), or phones keep the old cached copy:
  `NEW=$(date +%Y%m%d%H%M); sed -i '' -E "s/[0-9]{12}/$NEW/g" index.html sw.js`
- The document never scrolls; `.scroller` does (same iPhone Safari header fix as Iron).
