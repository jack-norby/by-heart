# By Heart

Learn Scripture and prayers by heart, a few minutes at a time.

By Heart is a free web app you can add to your phone's Home Screen. It works offline and keeps everything on your device. It's designed for every kind of learner, including people with dyslexia, ADHD and other learning differences.

## What it does
- **Any verse, your translation.** Pick a book, a chapter, then the verses, or type a reference like John 15:5. Choose the ESV, NIV, NKJV or CSB.
- **Paste from your Bible app.** Copy verses in the YouVersion Bible App, in any translation, and paste them in. By Heart reads the reference and translation for you. On Android you can also share straight to By Heart.
- **A line at a time.** Read a line out loud, then say it with some words blank, then with first letters, then from memory. Slip up and the help comes back.
- **Reviews at the right time.** Passages come back just before you'd forget, further apart each time. Recall one on three different days and it's memorized.
- **Answer your way.** Say it and check yourself, speak into the microphone, tap the words in order, type first letters, or type it out. Spelling slips count as right.
- **Hear it.** Every line can be read aloud, with words highlighted as they're spoken (not NIV, NKJV or CSB, whose license doesn't allow it).
- **Make it readable.** Text size, letter and word spacing, line spacing, fonts (including Atkinson Hyperlegible and Lexend) and five color themes.
- **Prayers.** The Lord's Prayer, the Apostles' and Nicene Creeds, the Doxology, the Serenity Prayer, Luther's morning and evening prayers, Wesley's Covenant Prayer, table and bedtime prayers, catechism answers, and prayers straight from Scripture. Or write your own.
- **Accounts (optional).** Sign in with Google or email and your verses, prayers and progress follow you to any device. Turn it on with `../ACCOUNTS.md`.
- **Habits without guilt.** A weekly goal instead of streaks, a one-minute option, an "After I…, I'll open By Heart" plan, and a calendar reminder.
- **Say it to someone.** Hand your phone to a friend and they tap any words you miss.

## Setting up the translations
- **ESV:** follow `../esv-proxy/README.md` (an ESV API key plus a free Cloudflare Worker), then put the Worker's address in `config.js`.
- **NIV, NKJV and CSB:** make a free API.Bible Starter account, add the NIV, NKJV and CSB, and put the key on the same proxy (see `../esv-proxy/README.md`). Then put the proxy's address in `config.js` as `apiBibleProxy`. Their license doesn't allow reading the words aloud or changing them, and the app re-checks saved passages every few weeks. The NKJV is free only while By Heart has 5,000 or fewer users a month.

## Install on a phone
- **iPhone:** open the site in Safari, tap Share, then **Add to Home Screen**.
- **Android:** open it in Chrome and choose **Install app**.

## Publish
Upload every file in this folder to a GitHub repository named `by-heart`, then turn on GitHub Pages (Settings → Pages → Deploy from branch → main). It will be at `https://jack-norby.github.io/by-heart/`.

## Credits
Scripture: ESV (Crossway); NIV (Biblica), NKJV (Thomas Nelson) and CSB (Holman Bible Publishers) through [API.Bible](https://api.bible). Full notices are on the app's Copyright page (Settings → About). ELLC creeds © 1988 English Language Liturgical Consultation. Scheduling: FSRS (open-spaced-repetition).
