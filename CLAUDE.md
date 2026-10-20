# By Heart: notes for Claude

"I have hidden Your word in my heart." (Psalm 119:11)

By Heart is a static web app (plain HTML/CSS/JS, no build step) for memorizing Bible verses and common prayers. It installs to a phone's Home Screen and works offline. It's built for every kind of learner, including people with dyslexia, ADHD, autism, motor or hearing differences, and older adults, based on a research report the owner commissioned ("Scripture memorization for diverse learners"). The owner also made Iron (`~/Desktop/iron`) and publishes both on GitHub Pages under `jack-norby.github.io`.

## Files (one flat folder, so drag-and-drop uploads to GitHub keep working)
- `index.html`: the shell. Header, `.scroller` with `main`, bottom tab bar, toast, live region. Sets the theme before first paint.
- `app.js`: all screens (Welcome, Today, Library, item page, Add, Progress, Settings, practice session, "Say it to someone") and saved state.
- `words.js`: splitting text into lines/phrases, cue rendering helpers, forgiving answer checking (word alignment, spelling slips, sound-alike words, numbers).
- `memory.js`: scheduling. FSRS-4.5 default weights plus the "three good days" ladder.
- `library.js`: the starter library (36 BSB passages, 17 prayers/creeds/catechism answers), each with a plain-language "What it means" note. Generated once from bible.helloao.org; edit by hand now.
- `style.css`: the whole design. Theme tokens at the top (cream default, light, mist, oxblood, night).
- `sw.js`: offline cache. `manifest.webmanifest` + icons (`icon-192/512.png`, `apple-touch-icon.png`, `favicon-32.png`, `favicon.svg`: a cream heart with a cross cut out, on oxblood #7a2e2e).

## How practice works (keep these; they're the research findings)
- **Recall, not rereading.** Every step asks for the words from memory, then shows word-level feedback.
- **Lines and fading cues.** A passage is learned a line at a time: read it aloud (cue 0), some words blank (1), first letters (2), from memory (3), then join it to the line before. A miss below 90% inserts a step back with more help (at most twice), then moves on. No penalties, no timers.
- **Three good days.** After the first full recall, reviews are capped at 1, 3, 7 days until the passage is recalled well (grade 3+) on three different days; then it's "Memorized" and FSRS spaces reviews freely (max 365 days). A forgotten review sets `refresh`, so the next review starts with a first-letters warm-up.
- **Forgiving checking** is on by default: spelling isn't memory. Short words only forgive a swapped/missing letter (so love/live stays wrong).
- **Answer methods:** Say it then check (default, self-marking), Speak (Web Speech API, hidden if unsupported), Tap the words, Type first letters, Type it. In tap/letter modes, words the cue already shows are given.
- **Habits without shame.** Weekly goal (days per week) instead of streaks; no loss messages; "Just one (1 minute)"; an if-then plan ("After I ___, I'll open By Heart"); a daily reminder is a downloaded .ics calendar event.
- Welcome asks "What helps you learn?" (never a diagnosis) and sets presets.

## Data
- localStorage key `byheart-v1`: `{ settings, plan, progress: {id: {stage: learning|practicing|memorized, learned, s, d, due, last, good, refresh, reps, lapses, history}}, custom: [items], edits: {id: {text}}, days: {"YYYY-MM-DD": {s: steps, r: reviews}}, welcomed }`.
- Backups: download a JSON file or copy a base64 backup code (Settings).
- Editing a passage's words clears its progress (after a confirm).

## Content rules
- Starter Scripture is the Berean Standard Bible (public domain). "Find a verse" uses the Free Use Bible API (bible.helloao.org, CORS open) with BSB, KJV, WEB and Douay-Rheims, all public domain. Don't add ESV/NIV text: their licenses don't fit (ESV API is non-commercial with storage caps; NIV's free license bans AI features). People can paste their own translation under "Write your own".
- Prayers use traditional public-domain wording. The ELLC Apostles' and Nicene Creeds carry the ELLC credit line. Wording varies by church, so every item can be edited to match.
- Plain, gentle language. No "brother/guys/he" for the user, no pathologizing words, no exclamation-mark hype.

## Working on it
- Preview: `python3 -m http.server` in this folder, then open http://localhost:8000. The service worker is skipped on localhost so edits show up; add `?sw` to the address to test offline mode.
- Check phone width (about 375px) for horizontal overflow and the console for errors.
- `window.ByHeart` in the console exposes `state()`, `session()`, `Words` and `Memory` for debugging.
- **Release:** bump the version everywhere at once (the `?v=` strings, `data-version`, and `VERSION` in sw.js), or phones keep the old cached copy:
  `NEW=$(date +%Y%m%d%H%M); sed -i '' -E "s/[0-9]{12}/$NEW/g" index.html sw.js`
- The document never scrolls; `.scroller` does (same iPhone Safari header fix as Iron).
