// By Heart: the Bible. Books, translations, and fetching a passage from each source.
// - Free translations (BSB, KJV, WEB) come from the Free Use Bible API (bible.helloao.org). No key needed.
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
    { id: "BSB", name: "Berean Standard Bible", source: "free", code: "BSB", credit: "Berean Standard Bible. Public domain." },
    { id: "KJV", name: "King James Version", source: "free", code: "eng_kjv", credit: "King James Version. Public domain." },
    { id: "WEB", name: "World English Bible", source: "free", code: "ENGWEBP", credit: "World English Bible. Public domain." },
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

  // ---------- free translations (Free Use Bible API) ----------
  const chapterCache = {};
  async function freeChapter(code, bookId, ch) {
    const k = code + "/" + bookId + "/" + ch;
    if (!chapterCache[k]) {
      chapterCache[k] = fetch("https://bible.helloao.org/api/" + code + "/" + bookId + "/" + ch + ".json")
        .then(r => { if (!r.ok) throw new Error("not-found"); return r.json(); })
        .catch(e => { delete chapterCache[k]; throw e; });
    }
    return chapterCache[k];
  }
  // One verse's text; poetry lines become "\n".
  function verseText(content) {
    let out = "";
    content.forEach(c => {
      if (typeof c === "string") out += (out && !/[\s\n]$/.test(out) ? " " : "") + c.trim();
      else if (c && c.lineBreak) out += "\n";
      else if (c && typeof c.text === "string") {
        if (c.poem && out && !out.endsWith("\n")) out += "\n";
        else if (out && !/[\s\n]$/.test(out)) out += " ";
        out += c.text.trim();
      }
    });
    return out.trim();
  }
  // The verses of a chapter for the picker: [{n, text}]
  async function chapterVerses(code, bookId, ch) {
    const data = await freeChapter(code, bookId, ch);
    return data.chapter.content.filter(x => x.type === "verse").map(v => ({ n: v.number, text: verseText(v.content) }));
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
    if (t.source === "free") {
      const all = await chapterVerses(t.code, r.book, r.ch);
      const picked = all.filter(v => v.n >= r.a && v.n <= (r.b || r.a));
      if (!picked.length) throw new Error("not-found");
      out = { text: picked.map(v => v.text).join(" ").replace(/ ?\n ?/g, "\n"), credit: t.credit };
    } else if (t.source === "abible") out = await abPassage(t, r);
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

  window.Bible = { BOOKS, OT, TRANSLATIONS, PASTE_TRS, book, translation, ready, whyNot, parseRef, refString, chapterVerses, passage,
    licensed, needsRefresh, expired, canSpeak, canEdit, reportView, readPasted };
})();
