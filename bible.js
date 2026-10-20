// By Heart: the Bible. Books, translations, and fetching a passage from each source.
// - Only the ESV, NIV, NKJV and CSB (the owner's choice). Choosing verses uses the built-in verse counts below,
//   so no Bible text loads until someone adds a passage.
// - The ESV comes from Crossway's ESV API through a small proxy server that keeps the key private
//   (the esv-proxy folder next to this one). Its address goes in config.js.
// - NIV, NKJV and CSB come from API.Bible through the same proxy (its address goes in config.js as apiBibleProxy).
//   Their license asks for more: a FUMS view report whenever the text is shown, saved text checked again
//   within 30 days, no reading aloud, no changing the words, and a copyright page. See CLAUDE.md.
(function () {
  const cfg = () => window.BIBLE_CONFIG || {};

  // [id, name, chapters, ...other spellings people type]
  const BOOKS = [["GEN", "Genesis", 50, "gen", "gn"], ["EXO", "Exodus", 40, "ex", "exod"], ["LEV", "Leviticus", 27, "lev", "lv"], ["NUM", "Numbers", 36, "num", "nm"],
    ["DEU", "Deuteronomy", 34, "deut", "dt"], ["JOS", "Joshua", 24, "josh", "jos"], ["JDG", "Judges", 21, "judg", "jdg"], ["RUT", "Ruth", 4, "ru"],
    ["1SA", "1 Samuel", 31, "1sam", "1sa"], ["2SA", "2 Samuel", 24, "2sam", "2sa"], ["1KI", "1 Kings", 22, "1kgs", "1ki"], ["2KI", "2 Kings", 25, "2kgs", "2ki"],
    ["1CH", "1 Chronicles", 29, "1chr", "1ch"], ["2CH", "2 Chronicles", 36, "2chr", "2ch"], ["EZR", "Ezra", 10, "ezr"], ["NEH", "Nehemiah", 13, "neh"],
    ["EST", "Esther", 10, "esth", "est"], ["JOB", "Job", 42, "jb"], ["PSA", "Psalms", 150, "psalm", "ps", "psa", "pss"], ["PRO", "Proverbs", 31, "prov", "pr", "prv"],
    ["ECC", "Ecclesiastes", 12, "eccl", "ecc", "qoh"], ["SNG", "Song of Songs", 8, "song of solomon", "song", "sos", "sng"], ["ISA", "Isaiah", 66, "isa", "is"],
    ["JER", "Jeremiah", 52, "jer"], ["LAM", "Lamentations", 5, "lam"], ["EZK", "Ezekiel", 48, "ezek", "ezk"], ["DAN", "Daniel", 12, "dan", "dn"],
    ["HOS", "Hosea", 14, "hos"], ["JOL", "Joel", 3, "jl"], ["AMO", "Amos", 9, "am"], ["OBA", "Obadiah", 1, "obad", "ob"], ["JON", "Jonah", 4, "jon"],
    ["MIC", "Micah", 7, "mic"], ["NAM", "Nahum", 3, "nah"], ["HAB", "Habakkuk", 3, "hab"], ["ZEP", "Zephaniah", 3, "zeph", "zep"], ["HAG", "Haggai", 2, "hag"],
    ["ZEC", "Zechariah", 14, "zech", "zec"], ["MAL", "Malachi", 4, "mal"],
    ["MAT", "Matthew", 28, "matt", "mt"], ["MRK", "Mark", 16, "mk", "mrk"], ["LUK", "Luke", 24, "lk", "luk"], ["JHN", "John", 21, "jn", "jhn"],
    ["ACT", "Acts", 28, "act"], ["ROM", "Romans", 16, "rom", "rm"], ["1CO", "1 Corinthians", 16, "1cor", "1co"], ["2CO", "2 Corinthians", 13, "2cor", "2co"],
    ["GAL", "Galatians", 6, "gal"], ["EPH", "Ephesians", 6, "eph"], ["PHP", "Philippians", 4, "phil", "php"], ["COL", "Colossians", 4, "col"],
    ["1TH", "1 Thessalonians", 5, "1thess", "1th"], ["2TH", "2 Thessalonians", 3, "2thess", "2th"], ["1TI", "1 Timothy", 6, "1tim", "1ti"],
    ["2TI", "2 Timothy", 4, "2tim", "2ti"], ["TIT", "Titus", 3, "tit"], ["PHM", "Philemon", 1, "phlm", "phm"], ["HEB", "Hebrews", 13, "heb"],
    ["JAS", "James", 5, "jas", "jm"], ["1PE", "1 Peter", 5, "1pet", "1pe"], ["2PE", "2 Peter", 3, "2pet", "2pe"], ["1JN", "1 John", 5, "1jn", "1jhn"],
    ["2JN", "2 John", 1, "2jn"], ["3JN", "3 John", 1, "3jn"], ["JUD", "Jude", 1, "jud"], ["REV", "Revelation", 22, "rev", "rv", "revelations"]];
  // How many verses each chapter has (standard English numbering), so verses can be chosen without loading
  // any Bible text. "GEN:31,25,…" lists Genesis 1, 2, … A few translations number a verse or two differently.
  const VERSE_COUNTS = {};
  ("" +
    "GEN:31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26;" +
    "EXO:22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38;" +
    "LEV:17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34;" +
    "NUM:54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13;" +
    "DEU:46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12;" +
    "JOS:18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33;" +
    "JDG:36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25;RUT:22,23,18,22;" +
    "1SA:28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13;" +
    "2SA:27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25;" +
    "1KI:53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53;" +
    "2KI:18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30;" +
    "1CH:54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30;" +
    "2CH:17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23;" +
    "EZR:11,70,13,24,17,22,28,36,15,44;NEH:11,20,32,23,19,19,73,18,38,39,36,47,31;EST:22,23,15,17,14,14,10,17,32,3;" +
    "JOB:22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17;" +
    "PSA:6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6;" +
    "PRO:33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31;" +
    "ECC:18,26,22,16,20,12,29,17,18,20,10,14;SNG:17,17,11,16,16,13,13,14;" +
    "ISA:31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24;" +
    "JER:19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34;" +
    "LAM:22,22,66,22,22;" +
    "EZK:28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35;" +
    "DAN:21,49,30,37,31,28,28,27,27,21,45,13;HOS:11,23,5,19,15,11,16,14,17,15,12,14,16,9;JOL:20,32,21;" +
    "AMO:15,16,15,13,27,14,17,14,15;OBA:21;JON:17,10,10,11;MIC:16,13,12,13,15,16,20;NAM:15,13,19;HAB:17,20,19;" +
    "ZEP:18,15,20;HAG:15,23;ZEC:21,13,10,14,11,15,14,23,17,12,17,14,9,21;MAL:14,17,18,6;" +
    "MAT:25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20;" +
    "MRK:45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20;" +
    "LUK:80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53;" +
    "JHN:51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25;" +
    "ACT:26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31;" +
    "ROM:32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27;1CO:31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24;" +
    "2CO:24,17,18,18,21,18,16,24,15,18,33,21,14;GAL:24,21,29,31,26,18;EPH:23,22,21,32,33,24;PHP:30,30,21,23;" +
    "COL:29,23,25,18;1TH:10,20,13,18,28;2TH:12,17,18;1TI:20,15,16,16,25,21;2TI:18,26,17,22;TIT:16,15,15;PHM:25;" +
    "HEB:14,18,19,16,14,20,28,13,28,39,40,29,25;JAS:27,26,18,17,20;1PE:25,25,22,19,14;2PE:21,22,18;" +
    "1JN:10,29,24,21,21;2JN:13;3JN:14;JUD:25;REV:20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21;").split(";").filter(Boolean).forEach(part => {
    const [id, list] = part.split(":");
    VERSE_COUNTS[id] = list.split(",").map(Number);
  });
  const verseCount = (bookId, ch) => (VERSE_COUNTS[bookId] || [])[ch - 1] || 0;

  const OT = 39;
  const book = id => BOOKS.find(b => b[0] === id);

  const ESV_CREDIT = "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.";
  const NIV_CREDIT = "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by Permission of Biblica, Inc.® All rights reserved worldwide.";
  const NKJV_CREDIT = "Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.";
  const CSB_CREDIT = "Scripture quotations marked CSB have been taken from the Christian Standard Bible®, Copyright © 2017 by Holman Bible Publishers. Used by permission. Christian Standard Bible® and CSB® are federally registered trademarks of Holman Bible Publishers.";
  // API.Bible's rules: no text-to-speech or edits, refresh within 30 days, fewer than 500 verses cached.
  const AB_RULES = { source: "abible", speech: false, editable: false, maxVerses: 499 };
  const TRANSLATIONS = [
    { id: "ESV", name: "English Standard Version", source: "esv", credit: ESV_CREDIT, link: "https://www.esv.org", maxVerses: 500, editable: false }, // Crossway: words may not be changed
    // Biblica asks for a link with the word "Biblica" in it every time the NIV is shown.
    Object.assign({ id: "NIV", name: "New International Version", credit: NIV_CREDIT, link: "https://www.biblica.com", linkText: "Biblica" }, AB_RULES),
    Object.assign({ id: "NKJV", name: "New King James Version", credit: NKJV_CREDIT, link: "https://www.harpercollins.com" }, AB_RULES),
    Object.assign({ id: "CSB", name: "Christian Standard Bible", credit: CSB_CREDIT, link: "https://www.bhpublishinggroup.com" }, AB_RULES),
  ];
  const translation = id => TRANSLATIONS.find(t => t.id === id);
  function ready(id) {
    const t = translation(id);
    if (!t || !t.source) return false;
    if (t.source === "esv") return !!cfg().esvProxy;
    if (t.source === "abible") return !!cfg().apiBibleProxy;
    return true;
  }
  function whyNot(id) {
    const t = translation(id);
    if (!t) return "Unknown translation.";
    if (!t.source) return t.id + " isn't connected yet.";
    if (t.source === "esv") return "The ESV needs its proxy set up first (see config.js).";
    if (t.source === "abible") return "The " + t.id + " needs the API.Bible proxy set up first (see config.js).";
    return "";
  }

  // "John 3:16", "1 cor 13:4-7", "Psalm 23" → {book, ch, a, b}
  function findBook(raw) {
    const n = raw.toLowerCase().replace(/\./g, "").replace(/^(first|i)\s+/, "1 ").replace(/^(second|ii)\s+/, "2 ").replace(/^(third|iii)\s+/, "3 ").replace(/\s+/g, " ").trim();
    const flat = n.replace(/\s/g, "");
    for (const b of BOOKS) if (b.slice(3).some(a => a.replace(/\s/g, "") === flat)) return b;
    for (const b of BOOKS) if (b[1].toLowerCase().replace(/\s/g, "").startsWith(flat) && flat.length >= 2) return b;
    return null;
  }
  function parseRef(s) {
    const m = String(s).trim().match(/^([1-3]?\s*[A-Za-z][A-Za-z. ]*?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?\s*$/);
    if (!m) return null;
    const b = findBook(m[1]);
    if (!b || +m[2] < 1 || +m[2] > b[2]) return null;
    return { book: b[0], ch: +m[2], a: m[3] ? +m[3] : null, b: m[4] ? +m[4] : (m[3] ? +m[3] : null) };
  }
  function refString(r) {
    const name = r.book === "PSA" ? "Psalm" : book(r.book)[1];
    if (!r.a) return name + " " + r.ch;
    return name + " " + r.ch + ":" + r.a + (r.b && r.b !== r.a ? "–" + r.b : "");
  }

  // ---------- ESV (through the proxy) ----------
  async function esvPassage(t, r) {
    const url = cfg().esvProxy.replace(/\/+$/, "") + "/passage?q=" + encodeURIComponent(refString(r).replace("–", "-"));
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status === 404 ? "not-found" : "proxy");
    const data = await res.json();
    if (!data.passages || !data.passages.length || !data.passages[0].trim()) throw new Error("not-found");
    let text = data.passages[0];
    // A psalm's title ("A Psalm of David.") comes first, on its own paragraph; it isn't part of verse 1.
    if (r.book === "PSA" && r.a === 1) text = text.replace(/^[^\n]{1,120}\n\s*\n/, "");
    return { text, credit: t.credit };
  }

  // ---------- NKJV, CSB (API.Bible, through the proxy) ----------
  const DAY = 86400000, REFRESH_DAYS = 25, KEEP_DAYS = 30;
  async function abPassage(t, r) {
    const ref = r.book + "." + r.ch + "." + r.a + (r.b && r.b !== r.a ? "-" + r.book + "." + r.ch + "." + r.b : "");
    const res = await fetch(cfg().apiBibleProxy.replace(/\/+$/, "") + "/bible?tr=" + t.id + "&ref=" + ref);
    if (res.status === 410) throw new Error("gone");
    if (!res.ok) throw new Error(res.status === 404 ? "not-found" : "proxy");
    const data = await res.json();
    if (!data.text || !data.text.trim()) throw new Error("not-found");
    return { text: data.text, credit: data.copyright || t.credit, fums: data.fumsToken || "", fetched: Date.now() };
  }
  // Saved API.Bible text is fetched again after 25 days and hidden once it's 30 days old (their terms, section 11).
  // Only text that came from API.Bible counts. Words someone pasted from their own Bible app (src "paste") don't.
  const licensed = it => { const t = it && translation(it.tr); return !!(t && t.source === "abible" && it.src !== "paste"); };
  const age = it => (Date.now() - (it.fetched || 0)) / DAY;
  const needsRefresh = it => licensed(it) && !!it.r && (!it.text || age(it) >= REFRESH_DAYS);
  const expired = it => licensed(it) && age(it) >= KEEP_DAYS;
  const canSpeak = it => !licensed(it);
  const canEdit = it => { const t = it && it.src !== "paste" && translation(it.tr); return !(t && t.editable === false); };

  // FUMS: API.Bible's view counter. Each time NIV, NKJV or CSB text is shown, its token is reported with their
  // script (anonymous device and session ids only). Views while offline wait in localStorage until the next connection.
  const FUMS_KEY = "byheart-fums", seen = {};
  let fumsLoaded = 0; // 0 not yet, 1 loading, 2 ready
  function pendingViews() { try { return JSON.parse(localStorage.getItem(FUMS_KEY) || "[]"); } catch (e) { return []; } }
  function setPending(list) { try { localStorage.setItem(FUMS_KEY, JSON.stringify(list.slice(-200))); } catch (e) { /* fine */ } }
  function loadFums() {
    if (fumsLoaded) return;
    fumsLoaded = 1;
    window.fumsData = window.fumsData || [];
    window.fums = window.fums || function () { window.fumsData.push(arguments); };
    const s = document.createElement("script");
    s.src = "https://pkg.api.bible/fumsV3.min.js"; s.async = true;
    s.onload = () => { fumsLoaded = 2; flushViews(); };
    s.onerror = () => { fumsLoaded = 0; s.remove(); };
    document.head.appendChild(s);
  }
  function flushViews() {
    const list = pendingViews();
    if (!list.length || navigator.onLine === false) return;
    if (fumsLoaded !== 2) { loadFums(); return; }
    window.fums("trackView", list);
    setPending([]);
  }
  function reportView(tokens) {
    const now = Date.now();
    const fresh = [].concat(tokens).filter(k => k && !(seen[k] && now - seen[k] < 10 * 60000)); // one view per screen, not per redraw
    if (!fresh.length) return;
    fresh.forEach(k => { seen[k] = now; });
    setPending(pendingViews().concat(fresh));
    flushViews();
  }
  window.addEventListener("online", flushViews);

  // Tidy text from any source: one line per poetry line, no verse numbers or stray spacing.
  function tidy(text) {
    return String(text).replace(/\r/g, "").replace(/\[\d+\]\s*/g, "").replace(/\(ESV\)\s*$/, "")
      .split("\n").map(l => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n")
      .replace(/^[“"‘']([^“”"]*)$/, "$1").trim();
  }

  // Fetch a passage in a translation. Returns {text, ref, tr, credit, verses}.
  async function passage(trId, r) {
    const t = translation(trId);
    if (!ready(trId)) throw new Error("not-ready");
    if (!r.a) throw new Error("need-verses");
    const verses = (r.b || r.a) - r.a + 1;
    let out;
    if (t.source === "abible") out = await abPassage(t, r);
    else out = await esvPassage(t, r);
    let text = tidy(out.text);
    if (r.book === "PSA") text = text.replace(/^Psalms? \d+\n/i, ""); // a heading some translations put before verse 1
    return { text, credit: out.credit, ref: refString(r), tr: t.id, verses, fums: out.fums, fetched: out.fetched };
  }

  // ---------- pasted from the Bible App ----------
  // What the Bible App (or bible.com) copies or shares looks roughly like
  //   “For God so loved the world…” John 3:16 ESV https://bible.com/bible/59/jhn.3.16.ESV
  // The format isn't documented, so this reads whatever it can find and the person checks it before saving.
  const YV_IDS = { 1: "KJV", 59: "ESV", 97: "MSG", 100: "NASB1995", 111: "NIV", 114: "NKJV", 116: "NLT", 206: "WEB", 1588: "AMP", 1713: "CSB", 2692: "NASB2020", 3034: "BSB" };
  const PASTE_TRS = ["ESV", "NIV", "NKJV", "CSB", "NLT", "NASB", "NASB1995", "NASB2020", "KJV", "AMP", "MSG", "BSB", "WEB", "NIrV", "CEV", "GNT", "NRSV", "RSV", "LSB"];
  function readPasted(raw) {
    let s = String(raw || "").replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, "").trim(); // invisible marks the app puts around dashes
    let tr = "", r = null, ref = "";
    const link = s.match(/https?:\/\/(?:www\.)?bible\.(?:com|us)\/(?:[a-z]{2}(?:-[A-Za-z]+)?\/)?bible\/(\d+)\/([1-3A-Za-z]{3})\.(\d+)(?:\.([\d,-]+))?(?:\.([A-Za-z][A-Za-z0-9-]*))?\S*/i);
    if (link) {
      tr = (link[5] || YV_IDS[link[1]] || "").toUpperCase();
      if (link[4] && book(link[2].toUpperCase())) {
        const nums = link[4].split(/[,-]/).map(Number).filter(Boolean);
        r = { book: link[2].toUpperCase(), ch: +link[3], a: nums[0], b: nums[nums.length - 1] };
      }
    }
    const onlyLink = !!link && !s.replace(/https?:\/\/\S+/g, "").trim();
    s = s.replace(/https?:\/\/\S+/g, " ").trim();
    // the reference, usually after the words: "John 3:16 ESV", "1 John 1:9 (NIV)", "Psalms 23:1-3 NKJV"
    const REF = "((?:[1-3]\\s?)?[A-Z][A-Za-z]+(?:\\s(?:of\\s)?[A-Z][a-z]+)?\\.?\\s\\d{1,3}:\\d{1,3}(?:\\s?[-–,]\\s?\\d{1,3})*)\\s*\\(?([A-Za-z][A-Za-z0-9]{1,9})?\\)?";
    let m = s.match(new RegExp("(?:^|[\\s\"”’'—–-])" + REF + "\\s*$"));
    let at = m ? m.index + m[0].indexOf(m[1]) : -1;
    if (!m) { m = s.match(new RegExp("^" + REF + "\\s*\\n")); at = m ? 0 : -1; }
    if (m) {
      ref = m[1].replace(/\s+/g, " ").replace(/\s?([-–,])\s?/g, "$1").replace("-", "–");
      const abbr = (m[2] || "").toUpperCase();
      if (abbr && (PASTE_TRS.some(t => t.toUpperCase() === abbr) || translation(abbr))) tr = PASTE_TRS.find(t => t.toUpperCase() === abbr) || abbr;
      const p = parseRef(ref.replace(/[,–].*$/, ""));
      if (p && p.a) {
        const last = Number((ref.match(/(\d+)\s*$/) || [])[1]) || p.a;
        r = r || { book: p.book, ch: p.ch, a: p.a, b: Math.max(p.a, last) };
      }
      s = at === 0 ? s.slice(m[0].length) : s.slice(0, at);
    }
    if (r && !/,/.test(ref)) ref = refString(r);
    else if (!ref && r) ref = refString(r);
    // the words: no wrapping quotes, and none of the verse numbers the app puts between verses
    s = s.replace(/[ \t]+/g, " ").replace(/^[\s“"‘']+|[\s”"’']+$/g, "").replace(/[ \t]*\n[ \t]*/g, "\n").trim();
    if (r) {
      let from = 0;
      for (let n = r.a; n <= r.b; n++) {
        const re = new RegExp("(^|[\\s“\"‘(])" + n + "\\s+(?=[A-Za-z“\"‘'(])", "g");
        re.lastIndex = from;
        const hit = re.exec(s);
        if (!hit || hit.index - from > 600) continue;
        s = s.slice(0, hit.index) + hit[1] + s.slice(hit.index + hit[0].length);
        from = hit.index + hit[1].length;
      }
      s = s.replace(/^[“"‘']+/, "").trim();
    }
    return { text: s, ref, r, tr, onlyLink, verses: r ? r.b - r.a + 1 : 1 };
  }

  window.Bible = { BOOKS, OT, TRANSLATIONS, PASTE_TRS, book, translation, ready, whyNot, parseRef, refString, verseCount, passage,
    licensed, needsRefresh, expired, canSpeak, canEdit, reportView, readPasted };
})();
