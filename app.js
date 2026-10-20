// By Heart: screens, practice sessions and saved progress.
// Everything is saved on this device (localStorage key "byheart-v1"). Backups live in Settings.
(function () {
  "use strict";
  const KEY = "byheart-v1";
  const W = window.Words, M = window.Memory;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const TTS = "speechSynthesis" in window;

  // ---------- saved state ----------
  const DEFAULT_SETTINGS = {
    size: 22, ls: 0, ws: 0, lh: 1.6, font: "readable", theme: "auto", calm: false,
    voice: "", rate: 0.85, autoRead: false,
    method: "say", forgiving: true,
    newPhrases: 4, reviewsPerDay: 15, retention: 0.9, weekGoal: 4,
    tr: "ESV",
  };
  function fresh() {
    return { v: 1, created: M.today(), welcomed: false, settings: Object.assign({}, DEFAULT_SETTINGS),
      plan: { anchor: "", time: "07:30", dismissed: false }, progress: {}, custom: [], edits: {}, days: {}, installDismissed: false };
  }
  function migrate(s) {
    const f = fresh();
    return Object.assign(f, s, { settings: Object.assign(f.settings, s.settings || {}), plan: Object.assign(f.plan, s.plan || {}) });
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === "object") return migrate(s); } catch (e) { /* fall through */ }
    return fresh();
  }
  let state = load();
  let warnedSave = false;
  // Every save is stamped so account sync (account.js) can tell which copy is newer.
  function save() {
    state.updated = Date.now();
    writeLocal();
    if (window.Account && Account.saved) Account.saved();
  }
  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { if (!warnedSave) { warnedSave = true; toast("This device wouldn't save your progress. Make a backup in Settings."); } }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const set = () => state.settings;

  // ---------- the library ----------
  function allItems() { return PRAYERS.concat(state.custom); }
  function item(id) {
    const base = allItems().find(x => x.id === id);
    if (!base) return null;
    const e = state.edits[id];
    return e ? Object.assign({}, base, e, { edited: true }) : base;
  }
  const phraseCache = {};
  function phrasesOf(it) {
    const k = it.id + "|" + it.text;
    if (!phraseCache[k]) phraseCache[k] = W.phrases(it.text);
    return phraseCache[k];
  }
  function wordCount(it) { return phrasesOf(it).reduce((n, p) => n + p.length, 0); }
  function prog(id) { return state.progress[id]; }
  function ensureProg(id) {
    if (!state.progress[id]) state.progress[id] = { stage: "learning", learned: 0, started: M.today() };
    return state.progress[id];
  }
  function status(it) {
    const p = prog(it.id);
    if (!p) return { key: "new", label: "New" };
    if (p.stage === "learning" && !it.text) return { key: "learning", label: "Learning" };
    if (p.stage === "learning") return { key: "learning", label: "Learning · " + Math.min(p.learned || 0, phrasesOf(it).length) + "/" + phrasesOf(it).length };
    if (p.stage === "practicing") return { key: "practicing", label: "Practicing", good: p.good || 0 };
    return { key: "memorized", label: p.refresh ? "Memorized · needs a refresh" : "Memorized" };
  }
  function dots(good) {
    let s = '<span class="dots" aria-label="' + good + ' of 3 good days">';
    for (let i = 0; i < 3; i++) s += '<i class="' + (i < good ? "on" : "") + '"></i>';
    return s + "</span>";
  }
  function pill(it) {
    const s = status(it);
    return '<span class="pill pill--' + s.key + '">' + esc(s.label) + (s.key === "practicing" ? " " + dots(s.good) : "") + "</span>";
  }
  function dueItems() {
    const t = M.today();
    return allItems().filter(it => { const p = prog(it.id); return it.text && p && p.stage !== "learning" && p.due && p.due <= t; })
      .sort((a, b) => prog(a.id).due.localeCompare(prog(b.id).due));
  }
  function learningItems() {
    return allItems().filter(it => { const p = prog(it.id); return it.text && p && p.stage === "learning"; })
      .sort((a, b) => (prog(b.id).touched || 0) - (prog(a.id).touched || 0));
  }
  function dayLog(iso) { return state.days[iso || M.today()] || { s: 0, r: 0 }; }
  function logDay(field) {
    const t = M.today();
    const d = state.days[t] || { s: 0, r: 0 };
    d[field] = (d[field] || 0) + 1;
    state.days[t] = d;
  }
  function reviewsLeft() { return Math.max(0, set().reviewsPerDay - dayLog().r); }
  function todayTasks(one) {
    const due = dueItems(), learning = learningItems();
    if (one) {
      if (due.length) return [{ kind: "review", id: due[0].id }];
      if (learning.length) return [{ kind: "learn", id: learning[0].id, one: true }];
      return [];
    }
    const tasks = due.slice(0, reviewsLeft()).map(it => ({ kind: "review", id: it.id }));
    if (learning.length) tasks.push({ kind: "learn", id: learning[0].id });
    return tasks;
  }
  function minutesFor(tasks) {
    let sec = 0;
    tasks.forEach(t => {
      const it = item(t.id), n = phrasesOf(it).length;
      if (t.kind === "review") sec += n * 12;
      else sec += Math.min(n - (prog(t.id).learned || 0), t.one ? 1 : set().newPhrases) * 45 + 20;
    });
    return Math.max(1, Math.round(sec / 60));
  }

  // ---------- reading look ----------
  const FONTS = {
    readable: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    hyperlegible: '"Atkinson Hyperlegible", system-ui, -apple-system, sans-serif',
    lexend: '"Lexend", system-ui, -apple-system, sans-serif',
    classic: 'Palatino, "Palatino Linotype", "Book Antiqua", P052, "URW Palladio L", Georgia, serif',
  };
  const WEB_FONTS = {
    hyperlegible: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap",
    lexend: "https://fonts.googleapis.com/css2?family=Lexend:wght@400;600&display=swap",
  };
  const darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyLook() {
    const s = set(), root = document.documentElement;
    const theme = s.theme === "auto" ? (darkQuery && darkQuery.matches ? "night" : "cream") : s.theme;
    root.dataset.theme = theme;
    root.classList.toggle("calm", !!s.calm);
    root.style.setProperty("--read-size", s.size + "px");
    root.style.setProperty("--read-ls", s.ls + "em");
    root.style.setProperty("--read-ws", s.ws + "em");
    root.style.setProperty("--read-lh", s.lh);
    root.style.setProperty("--read-font", FONTS[s.font] || FONTS.readable);
    if (WEB_FONTS[s.font] && !document.getElementById("font-" + s.font)) {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = WEB_FONTS[s.font]; l.id = "font-" + s.font;
      document.head.appendChild(l);
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(root).getPropertyValue("--bg").trim() || "#f6f1e4";
  }
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener("change", applyLook);

  // ---------- reading aloud ----------
  let voices = [];
  function loadVoices() { if (TTS) voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); }
  if (TTS) { loadVoices(); speechSynthesis.addEventListener && speechSynthesis.addEventListener("voiceschanged", loadVoices); }
  function pickVoice() {
    if (!voices.length) loadVoices();
    const want = set().voice;
    return voices.find(v => v.voiceURI === want) ||
      voices.find(v => /en-US/i.test(v.lang) && /(premium|enhanced|natural)/i.test(v.name)) ||
      voices.find(v => /en-US/i.test(v.lang) && v.localService) || voices[0] || null;
  }
  function forSpeech(text) { return text.replace(/\bLORD\b/g, "Lord").replace(/\bGOD\b/g, "God").replace(/\n/g, " "); }
  // Speak text; onWord(charIndex) fires as each word starts (where the browser supports it).
  function speak(text, onWord, onEnd) {
    if (!TTS) { toast("This browser can't read aloud."); if (onEnd) onEnd(); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(forSpeech(text));
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = set().rate; u.lang = (v && v.lang) || "en-US";
    if (onWord) u.onboundary = e => { if (e.name === undefined || e.name === "word") onWord(e.charIndex); };
    u.onend = () => onEnd && onEnd();
    u.onerror = () => onEnd && onEnd();
    speechSynthesis.speak(u);
  }
  function stopSpeaking() { if (TTS) speechSynthesis.cancel(); }
  // API.Bible's license doesn't allow text-to-speech for the NIV, NKJV or CSB, so those never get a Listen button.
  const canHear = it => TTS && !!it && Bible.canSpeak(it);
  const hearBtn = (label) => canHear(curItem()) ? '<button class="btn" data-act="hear">' + ICON.speaker + label + "</button>" : "";
  // Map a spoken character offset back to a word index in tokens joined by spaces.
  function wordAt(tokens, charIndex) {
    let c = 0;
    for (let i = 0; i < tokens.length; i++) { c += tokens[i].t.length + 1; if (charIndex < c) return i; }
    return tokens.length - 1;
  }

  // ---------- small UI helpers ----------
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
  }
  function announce(msg) { const l = $("#live"); if (l) { l.textContent = ""; setTimeout(() => { l.textContent = msg; }, 30); } }
  function rel(iso) {
    const d = M.daysBetween(M.today(), iso);
    if (d <= 0) return "today";
    if (d === 1) return "tomorrow";
    if (d < 14) return "in " + d + " days";
    if (d < 60) return "in " + Math.round(d / 7) + " weeks";
    return "in " + Math.round(d / 30) + " months";
  }
  function weekDays() { // Sunday-first week containing today
    const t = M.parse(M.today()); const start = new Date(t); start.setDate(t.getDate() - t.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return M.today(d); });
  }
  function practiced(iso) { const d = state.days[iso]; return !!(d && (d.s || d.r)); }
  function weekHTML() {
    const days = weekDays(), t = M.today(), n = days.filter(practiced).length, goal = set().weekGoal;
    const letters = ["S", "M", "T", "W", "T", "F", "S"];
    let s = '<div class="week" role="img" aria-label="' + n + " of " + goal + ' practice days this week">';
    days.forEach((d, i) => { s += '<span class="wd' + (practiced(d) ? " on" : "") + (d === t ? " now" : "") + '"><b>' + letters[i] + "</b><i></i></span>"; });
    s += "</div>";
    const msg = n >= goal ? "You've met this week's goal of " + goal + " days." : n + " of " + goal + " days this week.";
    return s + '<p class="week-msg">' + msg + "</p>";
  }
  const ICON = {
    speaker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // Signed in = Firebase says so, or this phone has synced with an account, or the sign-in marker is set.
  // Signed-in people never see the welcome (owner's request), however the app got here.
  function isSignedIn() {
    if (window.Account && Account.user) return true;
    if (state.account) return true;
    try { return localStorage.getItem("byheart-signedin") === "1"; } catch (e) { return false; }
  }

  // ---------- router ----------
  const main = () => $("#main");
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    stopSpeaking();
    const [name, arg] = location.hash.replace(/^#/, "").split("/").map(decodeURIComponent);
    if (name !== "practice" && S) endSession();
    if (!state.welcomed && isSignedIn()) state.welcomed = true;
    if (name === "welcome" && isSignedIn() && welcomeStep === 0) { location.replace("#today"); return; }
    if (!state.welcomed && name !== "welcome") { location.replace("#welcome"); return; }
    document.body.classList.toggle("in-practice", name === "practice" || name === "listen");
    document.body.classList.toggle("no-tabs", name === "welcome");
    document.querySelectorAll(".tabbar a").forEach(a => a.setAttribute("aria-current", a.dataset.tab === (TAB_OF[name] || "today") ? "page" : "false"));
    const v = VIEWS[name] || VIEWS.today;
    const html = v(arg);
    if (html != null) main().innerHTML = html;
    const sc = $(".scroller"); if (sc && name !== "practice") sc.scrollTop = 0;
    if (name === "practice") afterPracticeRender();
    if (name === "settings") fillVoices();
    if ((name === "item" || name === "listen") && item(arg)) shown(item(arg));
  }
  const TAB_OF = { today: "today", library: "library", item: "library", add: "library", pick: "library", paste: "library", progress: "progress", settings: "settings", copyright: "settings" };
  function shown(it) { if (it && it.fums && it.text) Bible.reportView(it.fums); } // FUMS: tell API.Bible the text was on screen

  // ---------- Today ----------
  function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
  let installEvent = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; });
  function today() {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const tasks = todayTasks(false), due = dueItems(), learning = learningItems();
    let next = "";
    if (tasks.length) {
      const parts = [];
      const nr = tasks.filter(t => t.kind === "review").length;
      if (nr) parts.push("<b>" + nr + "</b> to review");
      const lt = tasks.find(t => t.kind === "learn");
      if (lt) { const it = item(lt.id); parts.push("keep learning <b>" + esc(it.title) + "</b>"); }
      next = '<div class="card card--next"><p class="next-what">' + parts.join(" and ") + '.</p>' +
        '<button class="btn btn--primary btn--big" data-act="start">Start · about ' + minutesFor(tasks) + " min</button>" +
        (tasks.length > 1 || tasks.some(t => t.kind === "learn") ? '<button class="btn btn--quiet" data-act="start-one">Just one (1 minute)</button>' : "") +
        '<p class="fine">You can stop any time. Everything you do is saved.</p></div>';
    } else if (due.length) {
      next = '<div class="card card--next"><p class="next-what">You\'ve done today\'s reviews. Rest is part of remembering.</p>' +
        '<a class="btn" href="#library">Learn something new</a></div>';
    } else {
      const any = allItems().some(it => prog(it.id));
      next = '<div class="card card--next"><p class="next-what">' + (any ? "Nothing is due today." : "Pick something to learn first.") + '</p>' +
        '<a class="btn btn--primary btn--big" href="' + (any ? "#library" : "#pick") + '">' + (any ? "Learn something new" : "Choose a verse") + "</a>" +
        (allItems().some(it => { const p = prog(it.id); return p && p.stage !== "learning"; }) ? '<button class="btn btn--quiet" data-act="practice-anyway">Practice anyway</button>' : "") + "</div>";
    }
    const plan = state.plan;
    let planCard = "";
    if (plan.anchor) planCard = '<p class="plan-line">After I ' + esc(plan.anchor) + ", I'll open By Heart.</p>";
    else if (!plan.dismissed && allItems().some(it => prog(it.id))) planCard = planEditor(true);
    let install = "";
    if (!isStandalone() && !state.installDismissed) {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      install = '<div class="card card--soft"><p><b>Keep By Heart on your Home Screen.</b> ' +
        (ios ? "In Safari, tap the Share button, then <b>Add to Home Screen</b>." : "Use your browser's menu and choose <b>Install app</b> or <b>Add to Home screen</b>.") + "</p>" +
        (installEvent ? '<button class="btn" data-act="install">Install</button> ' : "") + '<button class="btn btn--quiet" data-act="dismiss-install">Not now</button></div>';
    }
    const inProgress = allItems().filter(it => prog(it.id)).sort((a, b) => (prog(a.id).due || "0").localeCompare(prog(b.id).due || "0"));
    const counts = { learning: 0, practicing: 0, memorized: 0 };
    inProgress.forEach(it => { counts[prog(it.id).stage]++; });
    const stats = set().calm || !inProgress.length ? "" :
      '<div class="stats"><span><b>' + counts.memorized + '</b> memorized</span><span><b>' + counts.practicing + '</b> practicing</span><span><b>' + counts.learning + "</b> learning</span></div>";
    const list = inProgress.length ? '<h2 class="h2">Yours</h2><ul class="rows">' + inProgress.slice(0, 8).map(rowHTML).join("") + "</ul>" +
      (inProgress.length > 8 ? '<a class="more" href="#progress">See all</a>' : "") : "";
    const planLine = plan.anchor ? planCard : "", planAsk = plan.anchor ? "" : planCard;
    return '<section class="view"><p class="eyebrow">' + esc(dateStr) + '</p><h1 class="h1">Today</h1>' + planLine + next + install +
      '<div class="card">' + weekHTML() + "</div>" + planAsk + stats + list + "</section>";
  }
  function rowHTML(it) {
    const p = prog(it.id);
    let sub = esc(it.ref) + (it.tr ? " · " + esc(it.tr) : "");
    if (p && p.stage !== "learning" && p.due) sub += " · next " + rel(p.due);
    return '<li><a class="row" href="#item/' + encodeURIComponent(it.id) + '"><span class="row-main"><span class="row-title">' + esc(it.title) +
      '</span><span class="row-sub">' + sub + "</span></span>" + pill(it) + "</a></li>";
  }
  const ANCHORS = ["pour my morning coffee", "brush my teeth", "sit down for breakfast", "get in bed", "finish my devotions", "start my commute"];
  function planEditor(onToday) {
    const p = state.plan;
    return '<div class="card card--soft plan"><p><b>Make a plan.</b> Tie practice to something you already do every day.</p>' +
      '<label class="field"><span>After I…</span><input type="text" id="anchor" value="' + esc(p.anchor) + '" placeholder="pour my morning coffee" autocomplete="off"></label>' +
      '<div class="chips">' + ANCHORS.map(a => '<button class="chip" data-act="anchor" data-v="' + esc(a) + '">' + esc(a) + "</button>").join("") + "</div>" +
      '<p class="fine">…I\'ll open By Heart.</p><div class="btns"><button class="btn btn--primary" data-act="save-plan">Save my plan</button>' +
      (onToday ? '<button class="btn btn--quiet" data-act="dismiss-plan">Not now</button>' : "") + "</div></div>";
  }

  // ---------- Library ----------
  let libTab = "verse", libQuery = "";
  function sameRef(a, b) { return a && b && a.book === b.book && a.ch === b.ch && a.a === b.a && (a.b || a.a) === (b.b || b.a); }
  function have(r, kind) { return state.custom.some(c => sameRef(c.r, r) && c.kind === kind); }
  function suggestRow(e, kind, i) { // a verse or Scripture prayer that isn't on your list yet
    return '<li><a class="row" href="#pick/' + kind + "/" + i + '"><span class="row-main"><span class="row-title">' + esc(e.title) +
      '</span><span class="row-sub">' + esc(Bible.refString(e.r)) + '</span></span><span class="pill pill--add">Add</span></a></li>';
  }
  function library() {
    const q = libQuery.trim().toLowerCase();
    const mineV = state.custom.filter(c => c.kind === "verse"), mineP = state.custom.filter(c => c.kind !== "verse");
    let body;
    if (q) {
      const hits = allItems().filter(it => (it.title + " " + it.ref + " " + it.text).toLowerCase().includes(q));
      const sugg = POPULAR.map((e, i) => [e, "verse", i]).concat(SCRIPTURE_PRAYERS.map((e, i) => [e, "prayer", i]))
        .filter(([e, k]) => !have(e.r, k) && (e.title + " " + Bible.refString(e.r)).toLowerCase().includes(q));
      const r = Bible.parseRef(libQuery);
      body = (r ? '<a class="btn btn--primary btn--wide" href="#pick/ref/' + encodeURIComponent(libQuery.trim()) + '">Open ' + esc(Bible.refString(r)) + "</a>" : "") +
        '<ul class="rows">' + hits.map(rowHTML).join("") + sugg.map(([e, k, i]) => suggestRow(e, k, i)).join("") + "</ul>" +
        (!hits.length && !sugg.length && !r ? '<p class="empty">Nothing matches that. To find any verse, type a reference like <b>John 15:5</b>.</p>' : "");
    } else if (libTab === "verse") {
      body = '<a class="btn btn--primary btn--big" href="#pick">+ Add a verse</a>' +
        '<a class="btn btn--wide" href="#paste">Paste from your Bible app</a>' +
        (mineV.length ? '<h2 class="h2">My verses</h2><ul class="rows">' + mineV.map(rowHTML).join("") + "</ul>" : '<p class="fine center">Pick any verse in the Bible, or start with a popular one.</p>') +
        '<h2 class="h2">Popular verses</h2><ul class="rows">' + POPULAR.map((e, i) => have(e.r, "verse") ? "" : suggestRow(e, "verse", i)).join("") + "</ul>";
    } else {
      body = '<a class="btn btn--wide" href="#add">+ Write your own prayer</a>' +
        (mineP.length ? '<h2 class="h2">My prayers</h2><ul class="rows">' + mineP.map(rowHTML).join("") + "</ul>" : "") +
        '<h2 class="h2">Prayers and creeds</h2><ul class="rows">' + PRAYERS.map(rowHTML).join("") + "</ul>" +
        '<h2 class="h2">Prayers from Scripture</h2><p class="fine">These come in the translation you choose.</p><ul class="rows">' +
        SCRIPTURE_PRAYERS.map((e, i) => have(e.r, "prayer") ? "" : suggestRow(e, "prayer", i)).join("") + "</ul>";
    }
    return '<section class="view"><h1 class="h1">Library</h1>' +
      '<label class="search"><span class="sr-only">Search, or type a reference</span><input type="search" id="lib-q" placeholder="Search, or type John 15:5" value="' + esc(libQuery) + '" autocomplete="off"></label>' +
      (q ? "" : '<div class="seg" role="tablist">' + [["verse", "Verses"], ["prayer", "Prayers"]].map(([v, l]) => '<button role="tab" aria-selected="' + (libTab === v) + '" data-act="lib-tab" data-v="' + v + '">' + l + "</button>").join("") + "</div>") +
      body + "</section>";
  }

  // ---------- one item ----------
  let editing = null;
  function linesHTML(it, cls) {
    return '<div class="reading ' + (cls || "") + '">' + phrasesOf(it).map((p, li) => '<p class="line" data-line="' + li + '">' +
      p.map((t, wi) => '<span class="w" data-w="' + wi + '">' + esc(t.t) + "</span>").join(" ") + "</p>").join("") + "</div>";
  }
  function itemView(id) {
    const it = item(id);
    if (!it) return '<section class="view"><p class="empty">That one isn\'t here anymore.</p><a class="btn" href="#library">Back to the library</a></section>';
    const p = prog(id), s = status(it);
    let primary;
    if (!it.text) primary = "";
    else if (!p) primary = '<button class="btn btn--primary btn--big" data-act="learn" data-id="' + esc(id) + '">Start learning</button>';
    else if (p.stage === "learning") primary = '<button class="btn btn--primary btn--big" data-act="learn" data-id="' + esc(id) + '">Keep learning</button>';
    else primary = '<button class="btn btn--primary btn--big" data-act="review" data-id="' + esc(id) + '">Practice from memory</button>';
    const ladder = s.key === "practicing" ? '<p class="fine">' + dots(s.good) + " Recall it right on three different days and it's memorized. Next practice " + rel(p.due) + ".</p>" :
      s.key === "memorized" ? '<p class="fine">Next practice ' + rel(p.due) + ". Reviews get further apart as it sticks.</p>" : "";
    const body = editing === id ?
      '<div class="card"><label class="field"><span>The words</span><textarea id="edit-text" rows="10">' + esc(it.text) + '</textarea></label>' +
      '<p class="fine">Put each phrase on its own line if you like. Lines are how it gets learned.</p>' +
      '<div class="btns"><button class="btn btn--primary" data-act="save-edit" data-id="' + esc(id) + '">Save</button><button class="btn btn--quiet" data-act="cancel-edit">Cancel</button>' +
      (state.edits[id] ? '<button class="btn btn--quiet" data-act="restore-edit" data-id="' + esc(id) + '">Use the original</button>' : "") + "</div></div>" :
      !it.text ? '<div class="card card--soft"><p>' + (Bible.licensed(it) ? "The " + esc(trLabel(it.tr)) + " words need a quick refresh from API.Bible (its license asks for one every 30 days)." :
        "The " + esc(trLabel(it.tr)) + " words aren't on this device yet (they're never stored in your account, only the reference).") +
        (Bible.ready(it.tr) ? " Connect to the internet and they'll come " + (Bible.licensed(it) ? "back" : "in") + "." : " The " + esc(trLabel(it.tr)) + " isn't connected on this site yet, so they can't load.") +
        " Your progress is kept.</p></div>" :
      '<div class="card">' + linesHTML(it) + "</div>";
    const extra = (it.text && canHear(it) ? '<button class="btn" data-act="listen-all" data-id="' + esc(id) + '">' + ICON.speaker + "Listen</button>" : "") +
      (it.text && p && p.stage !== "learning" ? '<a class="btn" href="#listen/' + encodeURIComponent(id) + '">Say it to someone</a>' : "");
    return '<section class="view"><a class="back" href="#library">' + ICON.back + "Library</a>" +
      '<h1 class="h1">' + esc(it.title) + '</h1><p class="ref">' + esc(it.ref) + trCite(it) + (it.edited ? " · your wording" : "") + "</p>" +
      pill(it) + ladder + primary +
      (extra ? '<div class="btns">' + extra + "</div>" : "") +
      (it.about ? '<div class="card card--soft"><h2 class="h3">What it means</h2><p>' + esc(it.about) + "</p></div>" : "") +
      body +
      '<div class="btns btns--end">' + (editing === id || !Bible.canEdit(it) ? "" : '<button class="btn btn--quiet" data-act="edit" data-id="' + esc(id) + '">Edit the words</button>') +
      (p ? '<button class="btn btn--quiet" data-act="reset-item" data-id="' + esc(id) + '">Start this one over</button>' : "") +
      (it.custom ? '<button class="btn btn--quiet" data-act="remove-item" data-id="' + esc(id) + '">Remove</button>' : "") + "</div>" +
      creditHTML(it.credit, it.tr) + "</section>";
  }
  // The translation after a reference. NIV, NKJV and CSB link to the copyright page, as API.Bible asks.
  function trCite(it) { // an item, or a fetched passage ({tr})
    if (!it || !it.tr) return "";
    return " · " + (Bible.licensed(it) ? '<a href="#copyright">' + esc(trLabel(it.tr)) + "</a>" : esc(trLabel(it.tr)));
  }
  function linkTo(url, text) { return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text || url.replace(/^https?:\/\/(www\.)?/, "")) + "</a>"; }
  function creditHTML(credit, tr) {
    if (!credit) return "";
    const t = Bible.translation(tr);
    return '<p class="fine">' + esc(credit) + (t && t.link ? " " + linkTo(t.link, t.linkText) : "") +
      (Bible.licensed({ tr }) ? (t.link ? "." : "") + ' Provided through <a href="https://api.bible" target="_blank" rel="noopener">API.Bible</a>. <a href="#copyright">Copyright details</a>' : "") + "</p>";
  }

  // ---------- copyright ----------
  // API.Bible asks for a copyright page that citations link to; it lists every translation's full notice.
  function copyright() {
    const credit = t => { const c = state.custom.find(x => x.tr === t.id && x.credit); return c ? c.credit : t.credit; };
    const rows = Bible.TRANSLATIONS.filter(t => t.credit && (Bible.ready(t.id) || state.custom.some(c => c.tr === t.id))).map(t => '<div class="card"><h2 class="h3">' + esc(t.id) + " · " + esc(t.name) + "</h2>" +
      '<p class="fine">' + esc(credit(t)) + "</p>" + (t.link ? '<p class="fine">' + linkTo(t.link) + "</p>" : "") +
      (t.source === "abible" ? '<p class="fine">Provided through <a href="https://api.bible" target="_blank" rel="noopener">API.Bible</a>. Not read aloud, and the words can\'t be changed, as its license asks.</p>' : "") + "</div>").join("");
    return '<section class="view"><a class="back" href="#settings">' + ICON.back + "Settings</a><h1 class=\"h1\">Copyright</h1>" + rows +
      '<div class="card card--soft"><p class="fine">When NIV, NKJV or CSB words are on screen, By Heart tells API.Bible anonymously (their FUMS view count, which the publishers rely on). It sends no name or account, only random device and session numbers.</p>' +
      '<p class="fine">Prayers use traditional wording; ELLC texts © 1988 English Language Liturgical Consultation.</p></div></section>';
  }

  // ---------- picking a verse ----------
  // #pick browses books → chapters → verses. #pick/verse/3 and #pick/prayer/2 open a suggestion;
  // #pick/ref/John 3:16 opens a typed reference. The chosen verses are then fetched in the chosen translation.
  let pick = null;
  const MAX_VERSES = 30;
  function trLabel(id) { const t = Bible.translation(id); return t ? t.id : id === "eng_kjv" ? "KJV" : id === "ENGWEBP" ? "WEB" : id; }
  function currentTr() {
    if (Bible.ready(set().tr)) return set().tr;
    const t = Bible.TRANSLATIONS.find(x => Bible.ready(x.id));
    return t ? t.id : "ESV";
  }
  function trChips(sel, act) {
    return '<div class="chips tr-chips" role="group" aria-label="Translation">' + Bible.TRANSLATIONS.map(t => {
      const ok = Bible.ready(t.id);
      return '<button class="chip' + (sel === t.id ? " on" : "") + (ok ? "" : " chip--off") + '" aria-pressed="' + (sel === t.id) + '" data-act="' + (act || "pick-tr") + '" data-v="' + t.id + '" aria-label="' + esc(t.name) + (ok ? "" : ", not set up yet") + '">' + t.id + "</button>";
    }).join("") + "</div>";
  }
  function fetchError(e, tr) {
    const m = e && e.message;
    if (m === "not-ready") return Bible.whyNot(tr);
    if (m === "not-found") return "Couldn't find that in the " + tr + ".";
    if (m === "proxy") return "The " + tr + " server didn't answer. Try again in a minute.";
    if (m === "gone") return "The " + tr + " isn't turned on for this app's API.Bible account.";
    return "Couldn't reach the Bible. Check your connection and try again.";
  }
  function pickView() {
    const parts = location.hash.replace(/^#/, "").split("/").map(decodeURIComponent);
    const key = parts.slice(1).join("/");
    if (!pick || pick.key !== key) {
      pick = { key, kind: "verse" };
      if (parts[1] === "verse" || parts[1] === "prayer") {
        const e = (parts[1] === "verse" ? POPULAR : SCRIPTURE_PRAYERS)[+parts[2]];
        if (e) Object.assign(pick, { kind: parts[1], title: e.title, about: e.about, from: e.from }, e.r);
      } else if (parts[1] === "ref") {
        const r = Bible.parseRef(parts.slice(2).join("/"));
        if (r) Object.assign(pick, r);
      }
      if (pick.a) setTimeout(getPicked, 0);
    }
    const tr = currentTr();
    let body;
    if (pick.result || pick.loading || pick.error) body = previewHTML(tr);
    else if (!pick.book) body = booksHTML();
    else if (!pick.ch) body = chaptersHTML();
    else body = versesHTML(tr);
    const back = pick.result || pick.error ? "" : pick.ch ? '<button class="back" data-act="pick-back">' + ICON.back + esc(Bible.book(pick.book)[1]) + "</button>" :
      pick.book ? '<button class="back" data-act="pick-back">' + ICON.back + "Books</button>" : '<a class="back" href="#library">' + ICON.back + "Library</a>";
    return '<section class="view view--pick">' + back + '<h1 class="h1">' + (pick.kind === "prayer" ? "Add a prayer" : "Add a verse") + "</h1>" +
      trChips(tr) + body + "</section>";
  }
  function booksHTML() {
    const grid = list => '<div class="bookgrid">' + list.map(b => '<button class="book" data-act="pick-book" data-v="' + b[0] + '">' + esc(b[1]) + "</button>").join("") + "</div>";
    return '<label class="search"><span class="sr-only">Type a reference</span><input type="text" id="pick-ref" placeholder="Or type it: Romans 8:38–39" autocomplete="off" autocapitalize="words" enterkeyhint="go"></label>' +
      '<p class="fine">Have it open in your Bible app? <a href="#paste">Paste it from there</a> in any translation.</p>' +
      '<h2 class="h3">Old Testament</h2>' + grid(Bible.BOOKS.slice(0, Bible.OT)) + '<h2 class="h3">New Testament</h2>' + grid(Bible.BOOKS.slice(Bible.OT));
  }
  function chaptersHTML() {
    const b = Bible.book(pick.book);
    let s = '<h2 class="h3">' + esc(b[1]) + ': pick a chapter</h2><div class="chapgrid">';
    for (let c = 1; c <= b[2]; c++) s += '<button class="chap" data-act="pick-ch" data-v="' + c + '">' + c + "</button>";
    return s + "</div>";
  }
  // The verse list always comes from a free translation (the chosen one if it's free), so browsing
  // never uses up the licensed translations' limits.
  function versesHTML(tr) {
    const name = (pick.book === "PSA" ? "Psalm " : Bible.book(pick.book)[1] + " ") + pick.ch;
    const n = Bible.verseCount(pick.book, pick.ch), a = pick.a, b = pick.b || pick.a;
    const sel = a ? Bible.refString({ book: pick.book, ch: pick.ch, a, b }) : "";
    let grid = '<div class="chapgrid versegrid">';
    for (let v = 1; v <= n; v++) {
      const on = !!(a && v >= a && v <= b);
      grid += '<button class="chap' + (on ? " on" : "") + '" data-act="pick-verse" data-v="' + v + '" aria-pressed="' + on + '" aria-label="Verse ' + v + '">' + v + "</button>";
    }
    return '<h2 class="h3">' + esc(name) + ": tap the first verse, then the last</h2>" + grid + "</div>" +
      (a ? '<div class="pickbar"><span>' + esc(sel) + " · " + esc(tr) + '</span><button class="btn btn--primary" data-act="pick-get">Get it</button></div>' : "");
  }
  async function getPicked() {
    if (!pick || !pick.a) return;
    const tr = currentTr(), r = { book: pick.book, ch: pick.ch, a: pick.a, b: pick.b || pick.a };
    if (r.b - r.a + 1 > MAX_VERSES) { toast("That's a lot to learn at once. Pick " + MAX_VERSES + " verses or fewer."); return; }
    const mine = pick, ask = (mine.ask || 0) + 1; // only the latest request counts (switching translation mid-load)
    Object.assign(pick, { loading: true, error: null, result: null, ask });
    route();
    try {
      const res = await Bible.passage(tr, r);
      if (mine.ask !== ask) return;
      if (mine.from && res.text.includes(mine.from)) res.text = res.text.slice(res.text.indexOf(mine.from));
      Object.assign(mine, { loading: false, result: res });
    } catch (e) {
      if (mine.ask !== ask) return;
      Object.assign(mine, { loading: false, error: fetchError(e, tr) });
    }
    if (pick === mine) route();
  }
  function previewHTML(tr) {
    const r = { book: pick.book, ch: pick.ch, a: pick.a, b: pick.b || pick.a };
    if (pick.loading) return '<p class="empty">Getting ' + esc(Bible.refString(r)) + " in the " + esc(tr) + "…</p>";
    if (pick.error) return '<div class="card card--soft"><p>' + esc(pick.error) + '</p><div class="btns"><button class="btn" data-act="pick-retry">Try again</button><button class="btn btn--quiet" data-act="pick-change">Choose different verses</button></div></div>';
    const res = pick.result;
    const t = Bible.translation(res.tr);
    let over = "";
    if (t && t.maxVerses) {
      const stored = state.custom.filter(c => c.tr === res.tr).reduce((n, c) => n + (c.verses || 1), 0);
      if (stored + res.verses > t.maxVerses) over = '<p class="fine">You already have ' + stored + " " + esc(res.tr) + " verses saved. The " + esc(res.tr) + "'s free license allows " + t.maxVerses + " on a device, so remove some or pick another translation.</p>";
    }
    if (res.fums) Bible.reportView(res.fums);
    return '<div class="card"><p class="ref">' + esc(res.ref) + trCite(res) + "</p>" +
      '<div class="reading">' + res.text.split("\n").map(l => '<p class="line">' + esc(l) + "</p>").join("") + "</div>" +
      creditHTML(res.credit, res.tr) + "</div>" +
      '<label class="field"><span>Name (optional)</span><input type="text" id="pick-title" value="' + esc(pick.title || "") + '" placeholder="' + esc(res.ref) + '" autocomplete="off"></label>' +
      (over || '<button class="btn btn--primary btn--big" data-act="pick-save">' + (pick.kind === "prayer" ? "Add to my prayers" : "Add to my verses") + "</button>") +
      '<button class="btn btn--quiet btn--wide" data-act="pick-change">Choose different verses</button>';
  }

  // ---------- pasting from the Bible App ----------
  // Copy in the Bible App, paste here. Android can also share straight in (manifest share_target → ?text=…).
  let pasted = null; // {raw, text, ref, r, tr, onlyLink, verses}
  function pasteView() {
    const p = pasted;
    const trs = Bible.PASTE_TRS.concat(p && p.tr && !Bible.PASTE_TRS.includes(p.tr) ? [p.tr] : []);
    let found = "";
    if (p && p.onlyLink) found = '<div class="card card--soft"><p>Only a link came through, not the words. In the Bible App, tap the verse and choose <b>Copy</b>, then paste again.</p></div>';
    else if (p && p.text) {
      found = '<div class="card">' +
        (p.ref ? "" : '<p class="fine">Couldn\'t find the reference. Type it in below.</p>') +
        '<label class="field"><span>Reference</span><input type="text" id="paste-ref" value="' + esc(p.ref) + '" placeholder="John 3:16" autocomplete="off" autocapitalize="words"></label>' +
        '<label class="field"><span>Translation</span><select id="paste-tr"><option value="">Not sure</option>' +
        trs.map(t => '<option value="' + esc(t) + '"' + (p.tr === t ? " selected" : "") + ">" + esc(t) + "</option>").join("") + "</select></label>" +
        '<label class="field"><span>The words</span><textarea id="paste-text" rows="8">' + esc(p.text) + "</textarea></label>" +
        '<p class="fine">Check the words match your Bible. Put each phrase on its own line if you like.</p>' +
        '<label class="field"><span>Name (optional)</span><input type="text" id="paste-title" placeholder="' + esc(p.ref || "John 3:16") + '" autocomplete="off"></label>' +
        '<label class="field"><span>Is it a verse or a prayer?</span><select id="paste-kind"><option value="verse">A verse to memorize</option><option value="prayer">A prayer from Scripture</option></select></label>' +
        '<button class="btn btn--primary btn--big" data-act="paste-save">Add it</button>' +
        '<button class="btn btn--quiet btn--wide" data-act="paste-clear">Start over</button></div>';
    }
    return '<section class="view"><a class="back" href="#library">' + ICON.back + 'Library</a><h1 class="h1">Paste from your Bible app</h1>' +
      (p && (p.text || p.onlyLink) ? "" :
        '<ol class="steps"><li>In the Bible App (or bible.com), tap the verse. Tap more verses to include them.</li><li>Choose <b>Copy</b>.</li><li>Come back here and tap <b>Paste</b>.</li></ol>' +
        ("clipboard" in navigator && navigator.clipboard.readText ? '<button class="btn btn--primary btn--big" data-act="paste-read">Paste</button>' : "") +
        '<label class="field"><span>' + ("clipboard" in navigator && navigator.clipboard.readText ? "Or paste it here" : "Paste it here") + '</span><textarea id="paste-raw" rows="5" placeholder="Press and hold, then Paste"></textarea></label>' +
        '<button class="btn btn--wide" data-act="paste-use">Use this</button>' +
        '<p class="fine">Any translation works. The words are saved only on this device, for your own memorizing.</p>') +
      found + "</section>";
  }
  function takePasted(raw) {
    raw = String(raw || "").trim();
    if (!raw) { toast("Nothing to paste yet. Copy a verse in your Bible app first."); return; }
    pasted = Object.assign({ raw }, Bible.readPasted(raw));
    if (!pasted.text && !pasted.onlyLink) pasted.text = raw;
    if (location.hash === "#paste") route(); else go("#paste");
  }

  // ---------- writing your own ----------
  function add() {
    return '<section class="view"><a class="back" href="#library">' + ICON.back + 'Library</a><h1 class="h1">Write your own</h1>' +
      '<div class="card"><label class="field"><span>Name</span><input type="text" id="own-title" placeholder="Morning prayer" autocomplete="off"></label>' +
      '<label class="field"><span>The words</span><textarea id="own-text" rows="8" placeholder="Type or paste the prayer. Put each phrase on its own line if you like."></textarea></label>' +
      '<label class="field"><span>Where it\'s from (optional)</span><input type="text" id="own-ref" placeholder="My church, a hymn, my own…" autocomplete="off"></label>' +
      '<label class="field"><span>Is it a prayer or a verse?</span><select id="own-kind"><option value="prayer">A prayer</option><option value="verse">A Bible verse I typed in</option></select></label>' +
      '<button class="btn btn--primary btn--big" data-act="save-own">Add it</button><p class="fine">It stays on this device.</p></div></section>';
  }
  function addCustom(o) {
    const id = "u-" + Date.now().toString(36);
    state.custom.push(Object.assign({ id, custom: true }, o));
    save();
    return id;
  }

  // ---------- Progress ----------
  function progress() {
    const mine = allItems().filter(it => prog(it.id));
    const by = st => mine.filter(it => prog(it.id).stage === st);
    const words = by("memorized").reduce((n, it) => n + wordCount(it), 0);
    const total = Object.keys(state.days).filter(practiced).length;
    // last 12 weeks
    const t = M.parse(M.today()); const start = new Date(t); start.setDate(t.getDate() - t.getDay() - 77);
    let grid = '<div class="grid" role="img" aria-label="Practice days over the last 12 weeks">';
    for (let i = 0; i < 84; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const iso = M.today(d); grid += '<i class="' + (practiced(iso) ? "on" : "") + (iso > M.today() ? " future" : "") + '"></i>'; }
    grid += "</div>";
    const section = (st, title) => { const l = by(st); return l.length ? '<h2 class="h2">' + title + '</h2><ul class="rows">' + l.map(rowHTML).join("") + "</ul>" : ""; };
    return '<section class="view"><h1 class="h1">Progress</h1><div class="card">' + weekHTML() +
      '<label class="field field--inline"><span>Weekly goal</span><select data-set="weekGoal">' + [1, 2, 3, 4, 5, 6, 7].map(n => '<option value="' + n + '"' + (set().weekGoal === n ? " selected" : "") + ">" + n + " day" + (n > 1 ? "s" : "") + "</option>").join("") + "</select></label></div>" +
      '<div class="stats stats--big"><span><b>' + words + '</b> words by heart</span><span><b>' + total + "</b> day" + (total === 1 ? "" : "s") + " practiced</span></div>" +
      '<div class="card">' + grid + '<p class="fine">Missed days don\'t erase anything. Pick up where you left off.</p></div>' +
      section("memorized", "Memorized") + section("practicing", "Practicing") + section("learning", "Learning") +
      (mine.length ? "" : '<p class="empty">Nothing yet. Start with something short from the <a href="#library">library</a>.</p>') + "</section>";
  }

  // ---------- Account (sign-in and sync live in account.js) ----------
  function accountCard() {
    const A = window.Account;
    if (!A || !A.enabled) return "";
    if (A.user) {
      return '<div class="card" id="account"><h2 class="h3">Account</h2><p>Signed in as <b>' + esc(A.user.email || A.user.displayName || "you") + "</b>. Your verses, prayers, progress and settings follow you to any phone or computer where you sign in.</p>" +
        '<p class="fine" id="sync-status" aria-live="polite">' + esc(A.status) + "</p>" +
        '<div class="btns"><button class="btn" data-act="acct-signout">Sign out</button><button class="btn btn--quiet" data-act="acct-delete">Delete my account</button></div>' +
        '<p class="fine" id="acct-msg" aria-live="polite"></p></div>';
    }
    if (!A.loaded) return '<div class="card" id="account"><h2 class="h3">Account</h2><p class="fine">' + esc(A.status || "Loading sign-in…") + "</p></div>";
    return '<div class="card" id="account"><h2 class="h3">Account</h2><p>Sign in to keep your verses, prayers and progress on every device. It\'s optional: without it, everything stays on this phone.</p>' +
      '<button class="btn btn--primary btn--wide" data-act="acct-google">Continue with Google</button>' +
      '<label class="field"><span>Email</span><input type="email" id="acct-email" autocomplete="email" autocapitalize="off" spellcheck="false"></label>' +
      '<label class="field"><span>Password</span><input type="password" id="acct-pass" autocomplete="current-password"></label>' +
      '<div class="btns"><button class="btn" data-act="acct-signin">Sign in</button><button class="btn" data-act="acct-signup">Create account</button><button class="btn btn--quiet" data-act="acct-forgot">Forgot password</button></div>' +
      '<p class="fine" id="acct-msg" aria-live="polite"></p>' +
      '<p class="fine">Signing in saves your email and your list in By Heart\'s account storage (Google Firebase). Words from the ESV, NIV, NKJV and CSB services are never stored there, only their references.</p></div>';
  }
  function accountMsg(m) { const e = $("#acct-msg"); if (e) e.textContent = m || ""; }
  function accountForm() {
    const email = ($("#acct-email").value || "").trim(), pass = $("#acct-pass").value || "";
    if (!email || !pass) { accountMsg("Type your email and a password first."); return null; }
    return { email, pass };
  }
  function accountDo(promise) {
    accountMsg("");
    promise.catch(err => accountMsg(Account.friendly(err)));
  }
  let lastUid = null;
  let deciding = false; // waiting to learn whether someone is signed in before showing the welcome
  function endDeciding() { deciding = false; document.body.classList.remove("deciding"); }
  function accountChanged(A) {
    const uid = A.user ? A.user.uid : null, here = location.hash;
    if (deciding && A.authKnown) { if (uid && here === "#welcome") go("#today"); endDeciding(); }
    // signed in after all (the account finished loading): skip the welcome for someone already set up
    if (uid && here === "#welcome" && welcomeStep === 0) { lastUid = uid; state.welcomed = true; writeLocal(); go("#today"); return; }
    const stale = uid !== lastUid || !$("#account") || (A.loaded && !A.user && !$("#acct-email"));
    lastUid = uid;
    if (here === "#settings" && stale) route(); // signed in or out, or sign-in just finished loading
    else if (here === "#welcome" && !A.user && !$('[data-act="welcome-signin"]')) route();
    else { const st = $("#sync-status"); if (st) st.textContent = A.status || ""; }
  }
  // A newer copy came from the account (or this phone signed in for the first time).
  let waitingState = null;
  function replaceState(next) {
    if (S) { waitingState = next; return; } // don't pull the rug out mid-practice
    state = migrate(next);
    if (isSignedIn()) state.welcomed = true;
    writeLocal(); applyLook(); refreshLicensed();
    if (location.hash !== "#practice") route();
  }
  // Signed out: this phone starts fresh (it may be shared), keeping only how the app looks.
  function signedOut() {
    try { localStorage.setItem("byheart-signedin", ""); } catch (e) { /* fine */ }
    const keep = { settings: state.settings, installDismissed: state.installDismissed };
    state = Object.assign(fresh(), keep, { welcomed: true });
    writeLocal(); applyLook();
    toast("Signed out. Your verses are saved in your account.");
    go("#today");
  }

  // ---------- Settings ----------
  const FMT = { size: v => v + "px", ls: v => Math.round(v * 100) + "%", ws: v => Math.round(v * 100) + "%", lh: v => (+v).toFixed(1), rate: v => (+v).toFixed(2) + "×" };
  function range(key, label, min, max, step) {
    const v = set()[key];
    return '<label class="field field--range"><span>' + label + ' <output>' + (FMT[key] || (x => x))(v) + '</output></span><input type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + v + '" data-set="' + key + '"></label>';
  }
  function select(key, label, opts) {
    return '<label class="field"><span>' + label + '</span><select data-set="' + key + '">' + opts.map(([v, l]) => '<option value="' + v + '"' + (String(set()[key]) === String(v) ? " selected" : "") + ">" + l + "</option>").join("") + "</select></label>";
  }
  function toggle(key, label, hint) {
    return '<label class="toggle"><input type="checkbox" data-set="' + key + '"' + (set()[key] ? " checked" : "") + '><span class="toggle-ui" aria-hidden="true"></span><span><b>' + label + "</b>" + (hint ? "<small>" + hint + "</small>" : "") + "</span></label>";
  }
  const METHODS = [["say", "Say it, then check"], ["speak", "Speak (microphone)"], ["tiles", "Tap the words"], ["letters", "Type first letters"], ["type", "Type it out"]];
  function methods() { return METHODS.filter(m => m[0] !== "speak" || SR); }
  function settings() {
    const s = set();
    return '<section class="view"><h1 class="h1">Settings</h1>' + accountCard() +
      '<div class="card"><h2 class="h3">Reading</h2>' +
      '<div class="preview reading">The LORD is my shepherd;<br>I shall not want.</div>' +
      range("size", "Text size", 16, 36, 1) + range("ls", "Letter spacing", 0, 0.2, 0.01) +
      range("ws", "Word spacing", 0, 0.5, 0.02) + range("lh", "Line spacing", 1.3, 2.2, 0.1) +
      select("font", "Font", [["readable", "Clear (system)"], ["hyperlegible", "Atkinson Hyperlegible"], ["lexend", "Lexend"], ["classic", "Palatino (classic)"]]) +
      select("theme", "Colors", [["auto", "Match my device"], ["cream", "Cream"], ["light", "White"], ["mist", "Soft blue"], ["oxblood", "Oxblood"], ["night", "Night"]]) +
      toggle("calm", "Calm screen", "No motion, fewer numbers.") + "</div>" +
      '<div class="card"><h2 class="h3">Listening</h2>' +
      (TTS ? '<label class="field"><span>Voice</span><select id="voice" data-set="voice"><option value="">Default</option></select></label>' +
        range("rate", "Reading speed", 0.5, 1.2, 0.05) + toggle("autoRead", "Read new lines aloud", "Hear each new line as it appears.") +
        '<button class="btn" data-act="test-voice">' + ICON.speaker + "Try it</button>" : '<p class="fine">This browser can\'t read aloud.</p>') + "</div>" +
      '<div class="card"><h2 class="h3">Answering</h2>' + select("method", "How you answer", methods()) +
      toggle("forgiving", "Forgiving checking", "Spelling slips and sound-alike words count as right. Turn off to need exact spelling.") +
      (SR ? "" : '<p class="fine">Speaking answers needs a browser with speech recognition, like Safari or Chrome.</p>') + "</div>" +
      '<div class="card"><h2 class="h3">Pace</h2>' + range("newPhrases", "New lines per session", 1, 8, 1) +
      range("reviewsPerDay", "Most reviews a day", 3, 40, 1) +
      select("retention", "How often to review", [["0.85", "Less often"], ["0.9", "Balanced"], ["0.95", "More often (stronger memory)"]]) + "</div>" +
      '<div class="card"><h2 class="h3">Your plan</h2>' + planEditor(false) +
      '<label class="field"><span>Reminder time</span><input type="time" id="plan-time" value="' + esc(state.plan.time) + '"></label>' +
      '<button class="btn" data-act="ics">Add a daily reminder to my calendar</button><p class="fine">Downloads a calendar event that repeats every day. Your calendar app does the reminding.</p></div>' +
      '<div class="card"><h2 class="h3">Bible translation</h2>' + select("tr", "For verses you add", Bible.TRANSLATIONS.filter(t => Bible.ready(t.id)).map(t => [t.id, t.name + " (" + t.id + ")"])) +
      '<ul class="tr-status">' + Bible.TRANSLATIONS.filter(t => !Bible.ready(t.id)).map(t => "<li><b>" + t.id + "</b> " + esc(Bible.whyNot(t.id)) + "</li>").join("") + "</ul></div>" +
      '<div class="card"><h2 class="h3">Backup</h2><p class="fine">Your progress lives only on this device. Save a backup now and then, especially before changing phones.' +
      (state.custom.some(Bible.licensed) ? " NIV, NKJV and CSB words aren't saved in backups (their license); they're fetched again after you restore." : "") + "</p>" +
      '<div class="btns"><button class="btn" data-act="backup-file">Download backup</button><button class="btn" data-act="backup-code">Copy backup code</button></div>' +
      '<label class="field"><span>Restore from a backup code or file</span><textarea id="restore" rows="3" placeholder="Paste a backup code"></textarea></label>' +
      '<div class="btns"><button class="btn" data-act="restore-code">Restore code</button><label class="btn">Choose file<input type="file" id="restore-file" accept=".json,application/json" hidden></label></div></div>' +
      '<div class="card"><h2 class="h3">How By Heart works</h2><ul class="how">' +
      "<li><b>Recall, don't reread.</b> Pulling words from memory builds memory far better than reading them again.</li>" +
      "<li><b>Short lines, fading help.</b> You learn a line at a time, with hints that fade: blanks, then first letters, then nothing. Slip up and the help comes back.</li>" +
      "<li><b>Spaced reviews.</b> Reviews come back just before you'd forget, further apart each time (the FSRS scheduler).</li>" +
      "<li><b>Three good days.</b> A passage counts as memorized after you recall it on three different days.</li>" +
      "<li><b>Forgiving checks.</b> Spelling isn't memory, so small slips count as right.</li></ul></div>" +
      '<div class="card"><h2 class="h3">About</h2><p class="fine">ESV: Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. NIV, NKJV and CSB come through API.Bible. Prayers use traditional wording; ELLC texts © 1988 English Language Liturgical Consultation. <a href="#copyright">All copyright notices</a></p>' +
      '<p class="fine">By Heart · Version ' + VERSION + " · " + (window.Account && Account.user ? "signed in" : "not signed in") +
        " · saved account: " + (state.account ? "yes" : "no") + " · marker: " + (isSignedIn() ? "on" : "off") + '</p><button class="btn btn--quiet" data-act="start-over">Start over (erase everything)</button></div></section>';
  }
  function fillVoices() {
    const sel = $("#voice"); if (!sel || !TTS) return;
    loadVoices();
    sel.innerHTML = '<option value="">Default</option>' + voices.map(v => '<option value="' + esc(v.voiceURI) + '"' + (set().voice === v.voiceURI ? " selected" : "") + ">" + esc(v.name) + " (" + esc(v.lang) + ")</option>").join("");
  }
  function icsFile() {
    const [hh, mm] = (state.plan.time || "07:30").split(":");
    const d = new Date(); d.setDate(d.getDate() + 1);
    const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const what = state.plan.anchor ? "After I " + state.plan.anchor + ", I'll open By Heart." : "A few minutes with Scripture and prayer.";
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//By Heart//EN", "BEGIN:VEVENT", "UID:byheart-daily-" + Date.now() + "@byheart",
      "DTSTAMP:" + stamp, "DTSTART:" + ymd + "T" + hh + mm + "00", "DURATION:PT5M", "RRULE:FREQ=DAILY", "SUMMARY:By Heart",
      "DESCRIPTION:" + what.replace(/,/g, "\\,"), "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:By Heart", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }
  function download(name, type, text) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function backupJSON() {
    const copy = JSON.parse(JSON.stringify(state));
    copy.custom.forEach(c => { if (Bible.licensed(c)) { c.text = ""; c.fetched = 0; delete c.fums; } });
    return JSON.stringify(copy);
  }
  function backupCode() { return btoa(unescape(encodeURIComponent(backupJSON()))); }
  function restore(json) {
    let s;
    try { s = typeof json === "string" ? JSON.parse(json) : json; } catch (e) { s = null; }
    if (!s || typeof s !== "object" || !s.settings) { toast("That doesn't look like a By Heart backup."); return; }
    if (!confirm("Replace what's on this device with the backup?")) return;
    state = migrate(s); state.welcomed = true; save(); applyLook(); toast("Backup restored."); go("#today"); refreshLicensed();
  }

  // ---------- Welcome ----------
  let welcomeStep = 0, helps = {};
  const HELPS = [["listen", "Hearing it read aloud"], ["speak", "Saying it out loud"], ["tiles", "Tapping words in order"], ["letters", "Typing first letters"],
    ["big", "Bigger text and more space"], ["calm", "A calm, simple screen"], ["short", "Short sessions"]];
  function welcome() {
    if (welcomeStep === 0) {
      return '<section class="view view--welcome"><svg class="mark" aria-hidden="true"><use href="#mark"/></svg><h1 class="h1 h1--brand">By Heart</h1>' +
        '<p class="lead">Learn Scripture and prayers by heart, a few minutes at a time.</p>' +
        '<p>You practice a line at a time, with help that fades as you remember. Reviews come back just before you\'d forget. There\'s no clock and no penalty for mistakes.</p>' +
        '<p class="verse">“I have stored up your word in my heart.” <span>Psalm 119:11 (ESV)</span></p>' +
        '<button class="btn btn--primary btn--big" data-act="welcome-next">Get started</button>' +
        (window.Account && Account.enabled ? '<button class="btn btn--quiet btn--wide" data-act="welcome-signin">I have an account</button>' : "") + "</section>";
    }
    if (welcomeStep === 1) {
      return '<section class="view view--welcome"><h1 class="h1">What helps you learn?</h1><p>Pick any that fit. You can change them later in Settings.</p>' +
        '<div class="choices">' + HELPS.filter(h => h[0] !== "speak" || SR).map(([k, l]) => '<button class="choice' + (helps[k] ? " on" : "") + '" aria-pressed="' + !!helps[k] + '" data-act="help" data-v="' + k + '">' + l + "</button>").join("") + "</div>" +
        '<button class="btn btn--primary btn--big" data-act="welcome-next">Next</button></section>';
    }
    const tr = currentTr();
    const firsts = [["verse", 0], ["verse", 1], ["prayer-fixed", "p-lords-prayer"], ["verse", 4], ["verse", 3], ["verse", 2]];
    return '<section class="view view--welcome"><h1 class="h1">Pick your first one</h1><p>Choose a translation, then start with something short. You can add any verse later.</p>' +
      trChips(tr, "welcome-tr") +
      '<ul class="rows">' + firsts.map(([k, v]) => {
        if (k === "prayer-fixed") { const it = item(v); return '<li><button class="row" data-act="welcome-pick" data-id="' + it.id + '"><span class="row-main"><span class="row-title">' + esc(it.title) + '</span><span class="row-sub">' + esc(it.ref) + " · " + wordCount(it) + " words</span></span></button></li>"; }
        const e = POPULAR[v];
        return '<li><button class="row" data-act="welcome-verse" data-i="' + v + '"><span class="row-main"><span class="row-title">' + esc(e.title) + '</span><span class="row-sub">' + esc(Bible.refString(e.r)) + "</span></span></button></li>";
      }).join("") + "</ul>" +
      '<a class="btn btn--wide" href="#pick" data-act="welcome-done">Find another verse</a>' +
      '<button class="btn btn--quiet" data-act="welcome-browse">I\'ll look around first</button></section>';
  }
  function applyHelps() {
    const s = set();
    if (helps.listen) s.autoRead = true;
    if (helps.big) Object.assign(s, { size: 26, ls: 0.04, ws: 0.12, lh: 1.8 });
    if (helps.calm) s.calm = true;
    if (helps.short) Object.assign(s, { newPhrases: 2, reviewsPerDay: 8 });
    s.method = helps.speak && SR ? "speak" : helps.letters ? "letters" : helps.tiles ? "tiles" : "say";
    applyLook();
  }

  // ---------- practice sessions ----------
  // A session runs tasks (learn or review one passage). Each task is a list of steps; each step covers
  // a range of lines at a cue level (0 full text, 1 blanks, 2 first letters, 3 from memory).
  let S = null;
  function planSteps(t) {
    const it = item(t.id), N = phrasesOf(it).length, p = prog(t.id) || {};
    const R = (a, b, cue, kind, purpose) => ({ range: [a, b], cue, kind, purpose, tries: 0 });
    if (t.kind === "review") {
      const steps = [];
      if (p.refresh) steps.push(R(0, N - 1, 2, "recall", "warmup"));
      steps.push(R(0, N - 1, 3, "recall", "review"));
      return steps;
    }
    const steps = [];
    const start = Math.min(p.learned || 0, N), end = Math.min(N, start + (t.one ? 1 : set().newPhrases));
    if (start > 0 && start < N) steps.push(R(Math.max(0, start - 4), start - 1, 2, "recall", "warmup"));
    for (let k = start; k < end; k++) {
      steps.push(R(k, k, 0, "meet", "new"), R(k, k, 1, "recall", "new"), R(k, k, 2, "recall", "new"), R(k, k, 3, "recall", "new"));
      if (k > 0) steps.push(R(k - 1, k, 3, "recall", "link"));
    }
    if (end === N) {
      if (N === 1 && steps.length) steps[steps.length - 1].purpose = "final";
      else {
        if (N > 2 && N <= 12 && start === 0) steps.push(R(0, N - 1, 2, "recall", "whole"));
        steps.push(R(0, N - 1, 3, "recall", "final"));
      }
    }
    return steps;
  }
  function startSession(tasks) {
    tasks = tasks.filter(t => t && item(t.id) && item(t.id).text);
    if (!tasks.length) return;
    tasks.forEach(t => { if (t.kind === "learn") ensureProg(t.id); });
    save();
    S = { tasks, ti: -1, plans: tasks.map(planSteps), done: [], doneSteps: 0, flow: false, grade: null, finished: false };
    nextTask();
    go("#practice");
  }
  function endSession() { stopListening(); stopSpeaking(); S = null; if (waitingState) { const w = waitingState; waitingState = null; replaceState(w); } }
  function totalSteps() { return S.plans.reduce((n, p) => n + p.length, 0); }
  function nextTask() {
    S.ti++;
    if (S.ti >= S.tasks.length) { S.finished = true; return; }
    S.steps = S.plans[S.ti]; S.si = 0; S.hints = 0;
    if (!S.steps.length) { nextTask(); return; }
    shown(curItem());
    beginStep();
  }
  function cur() { return S.steps[S.si]; }
  function curItem() { return item(S.tasks[S.ti].id); }
  function beginStep() {
    const st = cur(), ph = phrasesOf(curItem());
    S.lines = [];
    for (let k = st.range[0]; k <= st.range[1]; k++) S.lines.push(newLine(ph[k], k));
    S.li = 0; S.hintLevel = 0;
    prepLine();
  }
  function newLine(tokens, k) {
    return { k, tokens, status: tokens.map(() => "todo"), errors: tokens.map(() => 0), pos: 0, revealed: false, done: false, heard: "", checked: false };
  }
  function line() { return S.lines[S.li]; }
  // In tap and first-letter modes, words the cue already shows count as given; you only supply the hidden ones.
  function prepLine() {
    const L = line(), st = cur(), m = set().method;
    if (st.kind === "meet" || (m !== "tiles" && m !== "letters")) return;
    L.given = L.tokens.map((t, i) => st.cue === 1 && !W.hiddenAt(1, i, S.si));
    if (m === "tiles") L.tiles = shuffle(L.tokens.map((t, i) => ({ t: t.t, k: t.k, i, used: false })).filter(x => !L.given[x.i]));
    skipGiven(L);
  }
  function skipGiven(L) {
    while (L.given && L.pos < L.tokens.length && L.given[L.pos]) { L.status[L.pos] = "ok"; L.pos++; }
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    if (a.length > 2 && a.every((x, i) => x.i === i)) a.push(a.shift());
    return a;
  }
  const PURPOSE = {
    meet: ["New line", "Read it out loud."], warmup: ["Warm up", "Start with what you know. First letters will help."],
    new1: ["New line", "Some words are hidden."], new2: ["New line", "Only first letters now."],
    new3: ["New line", "Now from memory."], link: ["Join them", "This line and the one before it."],
    whole: ["All together", "The whole thing, with first letters."], final: ["All together", "The whole thing, from memory."],
    review: ["Review", "From memory, one line at a time."],
  };
  const HOW = { say: "Say it, then check.", speak: "Tap Speak and say it.", tiles: "Tap the words in order.", letters: "Type the first letter of each word.", type: "Type it." };
  function purposeOf(st) {
    if (st.kind === "meet") return PURPOSE.meet;
    const p = st.purpose === "new" ? PURPOSE["new" + st.cue] : PURPOSE[st.purpose] || PURPOSE.review;
    return [p[0], p[1] + " " + (HOW[set().method] || HOW.say)];
  }

  function practice() {
    if (!S) { setTimeout(() => go("#today"), 0); return ""; }
    if (S.finished) return summaryHTML();
    if (S.grade) return gradeHTML();
    const st = cur(), it = curItem();
    const [eyebrow, howto] = purposeOf(st);
    const pct = Math.round(100 * S.doneSteps / Math.max(1, totalSteps()));
    const ml = (methods().find(m => m[0] === set().method) || methods()[0])[1];
    return '<section class="practice">' +
      '<div class="p-top"><button class="icon-btn" data-act="exit" aria-label="Stop for now">' + ICON.close + "</button>" +
      '<div class="bar" role="progressbar" aria-label="Session progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
      (st.kind === "meet" ? '<span class="p-top-pad"></span>' : '<button class="chip" data-act="method-menu" aria-haspopup="true">' + esc(ml) + "</button>") + "</div>" +
      '<div class="p-head"><p class="eyebrow">' + esc(eyebrow) + (S.tasks.length > 1 ? " · " + (S.ti + 1) + " of " + S.tasks.length : "") + '</p><h1 class="h2">' + esc(it.title) + '</h1><p class="ref">' + esc(it.ref) + trCite(it) + '</p><p class="howto">' + esc(howto) + "</p></div>" +
      '<div class="p-lines reading">' + S.lines.map((L, i) => lineHTML(L, i)).join("") + "</div>" +
      '<div class="p-controls">' + controlsHTML() + "</div>" +
      '<div id="method-menu" class="menu" hidden role="menu">' + methods().map(([v, l]) => '<button role="menuitemradio" aria-checked="' + (set().method === v) + '" data-act="method" data-v="' + v + '">' + l + "</button>").join("") + "</div>" +
      "</section>";
  }
  function lineHTML(L, i) {
    const st = cur(), active = i === S.li, cue = st.kind === "meet" ? 0 : Math.max(0, st.cue - (active ? S.hintLevel : 0));
    const cls = "pline" + (active ? " active" : "") + (L.done ? " done" : "") + (i > S.li ? " todo" : "");
    let words = "";
    L.tokens.forEach((t, wi) => {
      const s = L.status[wi];
      const tap = active && L.revealed && set().method === "say" && !L.done;
      if (s === "ok" || s === "close" || s === "missed" || s === "wrong" || (L.revealed && s === "todo")) {
        const c = s === "todo" ? "w w--shown" : "w w--" + s;
        const label = s === "missed" ? " (missed)" : s === "wrong" ? " (you said " + L.saidAt[wi] + ")" : s === "close" ? " (close)" : "";
        words += tap ? '<button class="' + c + (L.marked && L.marked[wi] ? " w--marked" : "") + '" data-act="mark" data-w="' + wi + '" aria-pressed="' + !!(L.marked && L.marked[wi]) + '">' + esc(t.t) + "</button> "
          : '<span class="' + c + '"' + (label ? ' aria-label="' + esc(t.t + label) + '"' : "") + ">" + esc(t.t) + "</span> ";
      } else {
        words += cueHTML(t, wi, i > S.li && st.cue >= 3 ? 3 : cue) + " ";
      }
    });
    if (st.cue >= 3 && !active && i > S.li) words = '<span class="slot" aria-hidden="true"></span>';
    if (active && cue >= 3 && L.status.every(s => s === "todo") && !L.revealed) words = '<span class="slot slot--active">Line ' + (L.k + 1) + "</span>";
    return '<p class="' + cls + '" data-line="' + i + '">' + words + "</p>";
  }
  function cueHTML(t, wi, cue) {
    if (cue <= 0) return '<span class="w">' + esc(t.t) + "</span>";
    if (cue === 1 && !W.hiddenAt(1, wi, S.si)) return '<span class="w">' + esc(t.t) + "</span>";
    if (cue === 1) return '<span class="w w--blank" style="--n:' + Math.max(2, t.k.length) + '" aria-label="blank"></span>' + esc(W.trailing(t.t));
    if (cue === 2) return '<span class="w w--fl">' + esc(W.leading(t.t) + W.firstLetter(t.t)) + "</span>" + esc(W.trailing(t.t));
    return '<span class="w w--gap" aria-hidden="true"></span>';
  }
  function controlsHTML() {
    const st = cur(), L = line(), m = set().method;
    if (st.kind === "meet") {
      return '<div class="btns btns--center">' + hearBtn("Listen") + '<button class="btn btn--primary btn--big" data-act="said">I said it</button></div>';
    }
    if (L.done && !L.perfect) {
      return '<p class="feedback">' + feedbackText(L) + '</p><div class="btns btns--center">' + hearBtn("Hear it") +
        (m === "speak" || m === "type" ? '<button class="btn" data-act="override">I had it right</button>' : "") + '<button class="btn btn--primary btn--big" data-act="next-line">Next</button></div>';
    }
    if (L.done) return '<p class="feedback feedback--good">All there.</p>';
    const hint = '<button class="btn" data-act="hint">Hint</button>';
    if (m === "say") {
      if (L.revealed) return '<p class="feedback">Tap any words you missed or changed.</p><div class="btns btns--center">' + hearBtn("Hear it") + '<button class="btn btn--primary btn--big" data-act="say-done">' + (L.marked && L.marked.some(Boolean) ? "Done" : "Got it all") + "</button></div>";
      return '<p class="fine center">Say it out loud or in your head, then check.</p><div class="btns btns--center">' + hint + '<button class="btn btn--primary btn--big" data-act="check">Check</button></div>';
    }
    if (m === "speak") {
      const on = !!listening;
      return '<p class="heard" aria-live="polite">' + (L.heard ? esc(L.heard) : on ? "Listening…" : "") + '</p><div class="btns btns--center">' + hint +
        '<button class="btn btn--primary btn--big btn--mic' + (on ? " on" : "") + '" data-act="mic" aria-pressed="' + on + '">' + ICON.mic + (on ? "Done" : "Speak") + "</button></div>";
    }
    if (m === "tiles") {
      return '<div class="tiles">' + L.tiles.map((x, ti) => '<button class="tile' + (x.used ? " used" : "") + '" data-act="tile" data-t="' + ti + '"' + (x.used ? " disabled" : "") + ">" + esc(x.t.replace(/[^A-Za-z0-9’'-]/g, "")) + "</button>").join("") + '</div><div class="btns btns--center">' + hint + "</div>";
    }
    if (m === "letters") {
      return '<label class="letters"><span>Type the first letter of each word</span><input id="letters" type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="next"></label><div class="btns btns--center">' + hint + "</div>";
    }
    return '<label class="field"><span class="sr-only">Type the line</span><textarea id="typed" rows="3" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false" placeholder="Type the line"></textarea></label><div class="btns btns--center">' + hint + '<button class="btn btn--primary btn--big" data-act="type-check">Check</button></div>';
  }
  function feedbackText(L) {
    const missed = L.tokens.filter((t, i) => L.status[i] === "missed" || L.status[i] === "wrong").length;
    if (!missed) return "Close enough. Spelling slips are underlined.";
    return missed === 1 ? "Nearly. One word to look at." : missed + " words to look at.";
  }
  function rerender() {
    if (location.hash !== "#practice") return;
    main().innerHTML = practice();
    afterPracticeRender();
  }
  function afterPracticeRender() {
    if (!S || S.finished || S.grade) return;
    const a = $(".pline.active");
    if (a && a.scrollIntoView) a.scrollIntoView({ block: "center", behavior: set().calm ? "auto" : "smooth" });
    const li = $("#letters"); if (li) li.focus({ preventScroll: true });
    const ty = $("#typed"); if (ty) ty.focus({ preventScroll: true });
    if (cur().kind === "meet" && set().autoRead && !S.readThis && canHear(curItem())) { S.readThis = true; hearLine(); }
    if (set().method === "speak" && S.flow && !listening && !line().done && cur().kind !== "meet") startListening();
  }

  // finishing lines and steps
  function finishLine(perfect) {
    const L = line();
    L.done = true; L.perfect = perfect; L.revealed = true;
    L.tokens.forEach((t, i) => { if (L.status[i] === "todo") L.status[i] = "missed"; });
    stopListening();
    const n = L.tokens.length, ok = L.status.filter(s => s === "ok" || s === "close").length;
    announce(perfect ? "All there." : (n - ok) + " of " + n + " words to look at.");
    rerender();
    if (perfect) setTimeout(() => { if (S && line() === L) nextLine(); }, set().calm ? 900 : 650);
  }
  function nextLine() {
    if (S.li < S.lines.length - 1) { S.li++; S.hintLevel = 0; prepLine(); rerender(); return; }
    finishStep();
  }
  function stepAccuracy() {
    let n = 0, ok = 0;
    S.lines.forEach(L => { n += L.tokens.length; ok += L.status.filter(s => s === "ok" || s === "close").length; });
    return n ? ok / n : 1;
  }
  function finishStep() {
    const st = cur(), t = S.tasks[S.ti], p = prog(t.id) || ensureProg(t.id);
    const acc = st.kind === "meet" ? 1 : stepAccuracy();
    S.doneSteps++; S.readThis = false;
    p.touched = Date.now();
    logDay("s");
    const pass = acc >= 0.9;
    if (t.kind === "learn") {
      if (!pass && st.kind !== "meet" && st.tries < 2) {
        const back = Math.max(0, st.cue - 1);
        const help = { range: st.range, cue: back, kind: back === 0 ? "meet" : "recall", purpose: st.purpose === "new" ? "new" : st.purpose, tries: 9 };
        S.steps.splice(S.si + 1, 0, help, Object.assign({}, st, { tries: st.tries + 1 }));
        toast("Let's look at it again with a little more help.");
      }
      if (pass && st.cue === 3 && st.range[0] === st.range[1]) p.learned = Math.max(p.learned || 0, st.range[1] + 1);
      if (st.purpose === "final" && pass && p.stage === "learning") {
        p.learned = phrasesOf(curItem()).length;
        M.review(p, Math.max(2, M.grade(acc, S.hints)), set().retention);
        S.done.push({ id: t.id, kind: "learned" });
      }
      save();
      if (st.purpose === "final" && !pass && st.tries >= 2) S.done.push({ id: t.id, kind: "almost" });
    } else if (st.purpose === "review") {
      const g = M.grade(acc, S.hints);
      S.grade = { id: t.id, g, acc, words: S.lines.reduce((n, L) => n + L.tokens.length, 0), missed: [] };
      S.lines.forEach(L => L.tokens.forEach((tok, i) => { if (L.status[i] !== "ok" && L.status[i] !== "close") S.grade.missed.push(tok.t.replace(/[^A-Za-z0-9’'-]/g, "")); }));
      save();
      rerender();
      return;
    }
    advanceStep();
  }
  function advanceStep() {
    S.si++;
    if (S.si >= S.steps.length) {
      if (S.tasks[S.ti].kind === "learn" && !S.done.some(d => d.id === S.tasks[S.ti].id)) S.done.push({ id: S.tasks[S.ti].id, kind: "progress" });
      nextTask();
    } else beginStep();
    rerender();
  }
  function gradeHTML() {
    const G = S.grade, p = prog(G.id), it = item(G.id);
    const copy = JSON.parse(JSON.stringify(p));
    M.review(copy, G.g, set().retention);
    const got = Math.round(G.acc * G.words);
    const msg = G.g >= 3 ? "Every word. Well done." : G.g === 2 ? "Nearly all of it. Every word on another day earns a good day." : "Some of it slipped. That's normal, and it comes back faster each time.";
    return '<section class="practice practice--result"><div class="p-head"><p class="eyebrow">Review</p><h1 class="h2">' + esc(it.title) + "</h1></div>" +
      '<div class="card result"><p class="big">You remembered ' + got + " of " + G.words + " words.</p><p>" + msg + "</p>" +
      (G.missed.length ? '<p class="fine">To look at: ' + G.missed.slice(0, 12).map(esc).join(", ") + (G.missed.length > 12 ? "…" : "") + "</p>" : "") +
      (copy.stage === "memorized" && p.stage !== "memorized" ? '<p class="win">Three good days. This one is memorized.</p>' :
        copy.stage === "practicing" ? "<p>" + dots(copy.good) + " " + copy.good + " of 3 good days</p>" : "") +
      '<p class="fine">Next practice ' + rel(copy.due) + ".</p></div>" +
      '<div class="btns btns--center">' + (G.g === 3 ? '<button class="btn" data-act="grade" data-g="4">That was easy</button>' : "") +
      (G.g < 3 ? '<button class="btn" data-act="grade" data-g="3">I actually had it</button>' : "") +
      '<button class="btn btn--primary btn--big" data-act="grade" data-g="' + G.g + '">Continue</button></div></section>';
  }
  function applyGrade(g) {
    const G = S.grade, p = prog(G.id);
    const before = p.stage;
    M.review(p, g, set().retention);
    logDay("r");
    S.done.push({ id: G.id, kind: "reviewed", g, memorizedNow: before !== "memorized" && p.stage === "memorized" });
    S.grade = null; save();
    advanceStep();
  }
  function summaryHTML() {
    const rows = S.done.map(d => {
      const it = item(d.id); if (!it) return "";
      const p = prog(d.id);
      const what = d.kind === "learned" ? "Learned. First review " + rel(p.due) + "." :
        d.kind === "almost" ? "Almost there. We'll finish it next time." :
        d.kind === "progress" ? "Learned " + Math.min(p.learned || 0, phrasesOf(it).length) + " of " + phrasesOf(it).length + " lines so far." :
        d.memorizedNow ? "Memorized." : "Next practice " + rel(p.due) + ".";
      return '<li class="row row--static"><span class="row-main"><span class="row-title">' + esc(it.title) + '</span><span class="row-sub">' + esc(what) + "</span></span></li>";
    }).join("");
    const more = todayTasks(false).length;
    return '<section class="practice practice--result"><div class="p-head"><p class="eyebrow">Done</p><h1 class="h1">That\'s it for now.</h1></div>' +
      '<div class="card">' + weekHTML() + "</div>" + (rows ? '<ul class="rows">' + rows + "</ul>" : "") +
      '<div class="btns btns--center">' + (more ? '<button class="btn" data-act="start">Keep going</button>' : "") + '<a class="btn btn--primary btn--big" href="#today">Done</a></div></section>';
  }

  // answering
  function hearLine() {
    const L = line();
    if (!canHear(curItem())) return;
    const els = document.querySelectorAll('.pline.active .w');
    speak(L.tokens.map(t => t.t).join(" "), ci => {
      const wi = wordAt(L.tokens, ci);
      els.forEach((e, i) => e.classList.toggle("w--now", i === wi));
    }, () => els.forEach(e => e.classList.remove("w--now")));
  }
  function markFromAlign(L, answerText, partial) {
    const r = W.align(L.tokens.map(t => t.k), W.keysOf(answerText), { forgiving: set().forgiving, partial });
    L.status = r.status.map(s => s === "pending" ? "todo" : s);
    L.saidAt = r.said;
    return r;
  }
  let listening = null, heardBase = "";
  function startListening() {
    if (!SR) { toast("Speaking isn't available in this browser."); return; }
    const L = line();
    stopSpeaking();
    let rec;
    try { rec = new SR(); } catch (e) { toast("Speaking isn't available here."); return; }
    rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    heardBase = L.heard ? L.heard + " " : "";
    rec.onresult = e => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript + " ";
      L.heard = (heardBase + s).trim();
      const r = markFromAlign(L, L.heard, true);
      const allIn = r.reached >= L.tokens.length;
      if (allIn && L.status.every(x => x === "ok" || x === "close")) { finishLine(true); return; }
      rerenderLineOnly();
    };
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast("The microphone is off for this app. Switched to Say it, then check.");
        set().method = "say"; save(); S.flow = false;
      }
    };
    rec.onend = () => { if (listening === rec) { listening = null; if (S && !line().done) rerender(); } };
    try { rec.start(); listening = rec; S.flow = true; } catch (e) { listening = null; }
    rerender();
  }
  function stopListening() { if (listening) { const r = listening; listening = null; try { r.stop(); } catch (e) { /* already stopped */ } } }
  function rerenderLineOnly() {
    const el = $(".pline.active");
    if (!el) return rerender();
    el.outerHTML = lineHTML(line(), S.li);
    const h = $(".heard"); if (h) h.textContent = line().heard || "Listening…";
  }
  function finishSpoken() {
    const L = line();
    stopListening();
    markFromAlign(L, L.heard || "", false);
    finishLine(L.status.every(s => s === "ok" || s === "close") && L.tokens.length > 0 && !!L.heard);
  }
  function tapTile(ti) {
    const L = line(), x = L.tiles[ti];
    if (!x || x.used) return;
    const want = L.tokens[L.pos];
    if (x.k === want.k) {
      x.used = true;
      L.status[L.pos] = L.errors[L.pos] ? "close" : "ok";
      L.pos++;
    } else {
      L.errors[L.pos]++;
      const btn = document.querySelector('[data-t="' + ti + '"]');
      if (btn && !set().calm) { btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake"); }
      if (L.errors[L.pos] >= 2) { placeMissed(L); }
      else { announce("Not that one."); return; }
    }
    skipGiven(L);
    if (L.pos >= L.tokens.length) finishLine(L.status.every(s => s === "ok"));
    else rerender();
  }
  function placeMissed(L) { // reveal the next word as missed (after two wrong tries, or a hint)
    L.status[L.pos] = "missed";
    if (L.tiles) { const tile = L.tiles.find(x => !x.used && x.k === L.tokens[L.pos].k); if (tile) tile.used = true; }
    L.pos++;
  }
  function typedLetter(ch) {
    const L = line(); if (L.done) return;
    const want = L.tokens[L.pos];
    const c = ch.toLowerCase();
    const raw = W.firstLetter(want.t).toLowerCase();
    if (c === raw || c === want.k[0]) {
      L.status[L.pos] = L.errors[L.pos] ? "close" : "ok"; L.pos++;
    } else {
      L.errors[L.pos]++;
      if (L.errors[L.pos] >= 2) placeMissed(L);
      else {
        const box = $("#letters"); if (box && !set().calm) { box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake"); }
        announce("Try another letter."); return;
      }
    }
    skipGiven(L);
    if (L.pos >= L.tokens.length) finishLine(L.status.every(s => s === "ok"));
    else rerenderLineOnly();
  }

  // ---------- listener mode ("say it to someone") ----------
  let listenerMarks = {};
  function listen(id) {
    const it = item(id);
    if (!it) return VIEWS.today();
    let n = 0;
    return '<section class="practice"><div class="p-top"><a class="icon-btn" href="#item/' + encodeURIComponent(id) + '" aria-label="Close">' + ICON.close + '</a><span></span><span class="p-top-pad"></span></div>' +
      '<div class="p-head"><p class="eyebrow">Say it to someone</p><h1 class="h2">' + esc(it.title) + '</h1><p class="ref">' + esc(it.ref) + "</p>" +
      '<p class="howto">Hand your phone to a friend. As you say it, they follow along and tap any word you miss or change.</p></div>' +
      '<div class="p-lines reading">' + phrasesOf(it).map(p => '<p class="pline">' + p.map(t => { const i = n++; return '<button class="w w--shown' + (listenerMarks[i] ? " w--marked" : "") + '" data-act="lmark" data-w="' + i + '" aria-pressed="' + !!listenerMarks[i] + '">' + esc(t.t) + "</button>"; }).join(" ") + "</p>").join("") + "</div>" +
      '<div class="btns btns--center"><button class="btn btn--primary btn--big" data-act="listener-done" data-id="' + esc(id) + '">Finished</button></div></section>';
  }

  // ---------- keeping NIV, NKJV and CSB text current ----------
  // API.Bible's terms: check saved text at least every 30 days, show nothing older, and take it down when access
  // ends. Passages are fetched again after 25 days (one call each); after 30 days without a refresh the words are hidden.
  let refreshing = false;
  async function refreshLicensed() {
    let changed = false;
    const busy = c => S && S.tasks.some(t => t.id === c.id);
    state.custom.forEach(c => { if (c.text && Bible.expired(c) && !busy(c)) { c.text = ""; changed = true; } });
    if (!refreshing && navigator.onLine !== false) {
      refreshing = true;
      const missing = c => !c.text && !!c.r && c.src !== "paste" && !Bible.licensed(c);
      for (const c of state.custom.filter(c => Bible.needsRefresh(c) || missing(c))) {
        if (busy(c) || !Bible.ready(c.tr)) continue;
        try {
          const res = await Bible.passage(c.tr, c.r);
          if (c.from && res.text.includes(c.from)) res.text = res.text.slice(res.text.indexOf(c.from));
          Object.assign(c, { text: res.text, credit: res.credit, fums: res.fums, fetched: res.fetched });
          changed = true;
        } catch (e) {
          if (e.message === "gone") { c.text = ""; changed = true; } else if (e.message !== "not-found") break; // offline or proxy down: later
        }
      }
      refreshing = false;
    }
    if (changed) { save(); if (location.hash !== "#practice") route(); }
  }

  // ---------- events ----------
  const ACTIONS = {
    start: () => startSession(todayTasks(false)),
    "start-one": () => startSession(todayTasks(true)),
    "practice-anyway": () => {
      const pool = allItems().filter(it => { const p = prog(it.id); return p && p.stage !== "learning"; })
        .sort((a, b) => M.strength(prog(a.id)) - M.strength(prog(b.id))).slice(0, 3);
      startSession(pool.map(it => ({ kind: "review", id: it.id })));
    },
    learn: el => startSession([{ kind: "learn", id: el.dataset.id }]),
    review: el => startSession([{ kind: "review", id: el.dataset.id }]),
    exit: () => { endSession(); go("#today"); },
    "method-menu": () => { const m = $("#method-menu"); m.hidden = !m.hidden; },
    method: el => { set().method = el.dataset.v; save(); stopListening(); S.flow = false; S.lines[S.li] = newLine(line().tokens, line().k); prepLine(); rerender(); },
    hear: () => hearLine(),
    said: () => { line().status = line().status.map(() => "ok"); nextLine(); },
    hint: () => {
      const L = line(); S.hints++;
      if (set().method === "tiles" || set().method === "letters") { placeMissed(L); skipGiven(L); if (L.pos >= L.tokens.length) finishLine(false); else rerender(); return; }
      if (cur().cue - S.hintLevel > 1) S.hintLevel++;
      else { S.hintLevel = cur().cue; }
      rerender();
    },
    check: () => { const L = line(); L.revealed = true; L.marked = L.tokens.map(() => false); rerender(); },
    mark: el => { const L = line(), i = +el.dataset.w; L.marked[i] = !L.marked[i]; rerender(); },
    "say-done": () => { const L = line(); L.status = L.tokens.map((t, i) => L.marked[i] ? "missed" : "ok"); finishLine(!L.marked.some(Boolean)); },
    mic: () => { if (listening) finishSpoken(); else startListening(); },
    tile: el => tapTile(+el.dataset.t),
    "type-check": () => { const L = line(), v = $("#typed").value; if (!v.trim()) return; markFromAlign(L, v, false); finishLine(L.status.every(s => s === "ok")); },
    override: () => { const L = line(); L.status = L.status.map(() => "ok"); L.perfect = true; nextLine(); },
    "next-line": () => nextLine(),
    grade: el => applyGrade(+el.dataset.g),
    lmark: el => { const i = +el.dataset.w; listenerMarks[i] = !listenerMarks[i]; el.classList.toggle("w--marked", listenerMarks[i]); el.setAttribute("aria-pressed", listenerMarks[i]); },
    "listener-done": el => {
      const id = el.dataset.id, it = item(id), n = wordCount(it), missed = Object.values(listenerMarks).filter(Boolean).length;
      const p = prog(id); const g = M.grade((n - missed) / n, 0);
      M.review(p, g, set().retention); logDay("r"); save(); listenerMarks = {};
      toast(missed ? missed + " word" + (missed > 1 ? "s" : "") + " to look at. Next practice " + rel(p.due) + "." : "Every word. Next practice " + rel(p.due) + ".");
      go("#item/" + encodeURIComponent(id));
    },
    "listen-all": el => {
      const it = item(el.dataset.id);
      if (!canHear(it)) return;
      const lines = document.querySelectorAll(".reading .line"), ph = phrasesOf(it);
      let i = 0;
      const nextL = () => {
        lines.forEach(l => l.classList.remove("line--now"));
        if (i >= ph.length || location.hash.indexOf("#item/") !== 0) return;
        const el2 = lines[i]; if (el2) el2.classList.add("line--now");
        const ws = el2 ? el2.querySelectorAll(".w") : [];
        const toks = ph[i]; i++;
        speak(toks.map(t => t.t).join(" "), ci => { const wi = wordAt(toks, ci); ws.forEach((w, j) => w.classList.toggle("w--now", j === wi)); }, () => { ws.forEach(w => w.classList.remove("w--now")); nextL(); });
      };
      nextL();
    },
    edit: el => { if (Bible.canEdit(item(el.dataset.id))) { editing = el.dataset.id; route(); } },
    "cancel-edit": () => { editing = null; route(); },
    "save-edit": el => {
      const id = el.dataset.id, it = item(id), v = $("#edit-text").value.trim();
      if (!v) return;
      if (v !== it.text) {
        if (prog(id) && !confirm("Changing the words starts this one over. Continue?")) return;
        delete state.progress[id];
        const c = state.custom.find(x => x.id === id);
        if (c) c.text = v; else state.edits[id] = { text: v };
        save();
      }
      editing = null; route();
    },
    "restore-edit": el => { const id = el.dataset.id; if (prog(id) && !confirm("Going back to the original words starts this one over. Continue?")) return; delete state.edits[id]; delete state.progress[id]; save(); editing = null; route(); },
    "reset-item": el => { if (confirm("Start this one over? Its progress will be cleared.")) { delete state.progress[el.dataset.id]; save(); route(); } },
    "remove-item": el => { if (confirm("Remove this from your list?")) { const id = el.dataset.id; state.custom = state.custom.filter(x => x.id !== id); delete state.progress[id]; save(); go("#library"); } },
    "lib-tab": el => { libTab = el.dataset.v; route(); },
    "pick-tr": el => {
      const v = el.dataset.v;
      if (!Bible.ready(v)) { toast(Bible.whyNot(v)); return; }
      set().tr = v; save();
      if (pick && (pick.result || pick.error || pick.loading)) getPicked(); else route();
    },
    "pick-book": el => { pick.book = el.dataset.v; pick.ch = null; pick.a = pick.b = null; route(); $(".scroller").scrollTop = 0; },
    "pick-ch": el => { pick.ch = +el.dataset.v; pick.a = pick.b = null; route(); $(".scroller").scrollTop = 0; },
    "pick-back": () => { if (pick.ch) { pick.ch = null; pick.a = pick.b = null; } else pick.book = null; route(); },
    "pick-verse": el => {
      const n = +el.dataset.v;
      if (!pick.a || (pick.b && pick.b !== pick.a) || n < pick.a) { pick.a = n; pick.b = n; }
      else pick.b = n;
      const top = $(".scroller").scrollTop; route(); $(".scroller").scrollTop = top;
    },
    "pick-get": () => getPicked(),
    "pick-retry": () => getPicked(),
    "pick-change": () => { Object.assign(pick, { result: null, error: null, loading: false }); route(); },
    "pick-save": () => {
      const res = pick.result; if (!res) return;
      const title = ($("#pick-title").value || "").trim() || res.ref;
      const id = addCustom({ kind: pick.kind, title, about: pick.about, ref: res.ref, tr: res.tr, text: res.text, credit: res.credit,
        r: { book: pick.book, ch: pick.ch, a: pick.a, b: pick.b || pick.a }, verses: res.verses, from: pick.from, fums: res.fums, fetched: res.fetched });
      libTab = pick.kind === "prayer" ? "prayer" : "verse"; pick = null; go("#item/" + id);
    },
    "paste-read": async () => {
      try { takePasted(await navigator.clipboard.readText()); }
      catch (e) { const t = $("#paste-raw"); if (t) t.focus(); toast("Press and hold in the box, then choose Paste."); }
    },
    "paste-clear": () => { pasted = null; route(); },
    "paste-use": () => takePasted(($("#paste-raw") || {}).value),
    "paste-save": () => {
      const text = $("#paste-text").value.trim();
      if (!text) { toast("Add the words first."); return; }
      const refIn = $("#paste-ref").value.trim(), r = Bible.parseRef(refIn.replace(/\s*[,–-].*$/, ""));
      const last = Number((refIn.match(/[-–,]\s*(\d+)\s*$/) || [])[1]);
      const rr = r && r.a ? Object.assign({}, r, { b: Math.max(r.a, last || r.a) }) : null;
      const ref = rr && !/,/.test(refIn) ? Bible.refString(rr) : refIn || "Your Bible";
      const kind = $("#paste-kind").value === "prayer" ? "prayer" : "verse";
      const id = addCustom({ kind, title: $("#paste-title").value.trim() || ref, ref, tr: $("#paste-tr").value, text, src: "paste",
        r: rr || undefined, verses: rr ? rr.b - rr.a + 1 : 1 });
      pasted = null; libTab = kind; go("#item/" + id);
    },
    "save-own": () => {
      const title = $("#own-title").value.trim(), text = $("#own-text").value.trim();
      if (!title || !text) { toast("Add a name and the words."); return; }
      const kind = $("#own-kind").value === "verse" ? "verse" : "prayer";
      const id = addCustom({ kind, title, ref: $("#own-ref").value.trim() || "Your own", text });
      libTab = kind; go("#item/" + id);
    },
    anchor: el => { const a = $("#anchor"); if (a) a.value = el.dataset.v; },
    "save-plan": () => { const v = ($("#anchor").value || "").trim().replace(/[.,]+$/, ""); if (!v) { toast("Add something you already do every day."); return; } state.plan.anchor = v; save(); toast("Saved. After you " + v + ", open By Heart."); route(); },
    "dismiss-plan": () => { state.plan.dismissed = true; save(); route(); },
    install: async () => { if (installEvent) { installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; route(); } },
    "dismiss-install": () => { state.installDismissed = true; save(); route(); },
    "test-voice": () => speak("The LORD is my shepherd; I shall not want."),
    ics: () => { const t = $("#plan-time"); if (t) { state.plan.time = t.value || "07:30"; save(); } download("by-heart-reminder.ics", "text/calendar", icsFile()); },
    "backup-file": () => download("by-heart-backup-" + M.today() + ".json", "application/json", backupJSON()),
    "backup-code": async () => {
      const code = backupCode();
      try { await navigator.clipboard.writeText(code); toast("Backup code copied. Paste it somewhere safe, like a note or an email to yourself."); }
      catch (e) { const r = $("#restore"); if (r) { r.value = code; r.select(); } toast("Copy the code from the box below."); }
    },
    "restore-code": () => {
      const v = ($("#restore").value || "").trim(); if (!v) return;
      let json = null; try { json = decodeURIComponent(escape(atob(v))); } catch (e) { json = v; }
      restore(json);
    },
    "welcome-signin": () => { state.welcomed = true; writeLocal(); go("#settings"); },
    "acct-google": () => accountDo(Account.google()),
    "acct-signin": () => { const f = accountForm(); if (f) accountDo(Account.signIn(f.email, f.pass)); },
    "acct-signup": () => { const f = accountForm(); if (f) accountDo(Account.signUp(f.email, f.pass)); },
    "acct-forgot": () => {
      const email = ($("#acct-email").value || "").trim();
      if (!email) { accountMsg("Type your email first, then tap Forgot password."); return; }
      Account.reset(email).then(() => accountMsg("Check your email for a link to reset your password.")).catch(err => accountMsg(Account.friendly(err)));
    },
    "acct-signout": () => { if (confirm("Sign out? Your verses stay in your account, and this phone starts fresh.")) Account.signOut(); },
    "acct-delete": () => {
      if (!confirm("Delete your account and everything saved in it? This phone keeps nothing either. This can't be undone.")) return;
      Account.deleteAccount().catch(err => accountMsg(Account.friendly(err)));
    },
    "start-over": () => {
      const user = window.Account && Account.user;
      if (!confirm("Erase all progress, settings and added verses " + (user ? "on this device and in your account?" : "on this device?")) || !confirm("This can't be undone. Erase everything?")) return;
      state = fresh();
      if (user) state.account = user.uid; // so the empty copy replaces the account's instead of merging with it
      save(); applyLook(); welcomeStep = 0; helps = {}; go("#welcome");
    },
    "welcome-next": () => {
      if (welcomeStep === 0 && state.welcomed) { go("#today"); return; } // already set up: straight in
      if (welcomeStep === 1) applyHelps();
      welcomeStep++; save(); route();
    },
    help: el => { helps[el.dataset.v] = !helps[el.dataset.v]; route(); },
    "welcome-tr": el => { if (!Bible.ready(el.dataset.v)) { toast(Bible.whyNot(el.dataset.v)); return; } set().tr = el.dataset.v; save(); route(); },
    "welcome-verse": async el => {
      const e = POPULAR[+el.dataset.i], tr = currentTr();
      el.disabled = true; toast("Getting " + Bible.refString(e.r) + "…");
      try {
        const res = await Bible.passage(tr, e.r);
        const id = addCustom({ kind: "verse", title: e.title, about: e.about, ref: res.ref, tr: res.tr, text: res.text, credit: res.credit, r: e.r, verses: res.verses, fums: res.fums, fetched: res.fetched });
        state.welcomed = true; save(); startSession([{ kind: "learn", id }]);
      } catch (err) { el.disabled = false; toast(fetchError(err, tr)); }
    },
    "welcome-done": () => { state.welcomed = true; save(); go("#pick"); },
    "welcome-pick": el => { state.welcomed = true; save(); startSession([{ kind: "learn", id: el.dataset.id }]); },
    "welcome-browse": () => { state.welcomed = true; save(); go("#library"); },
  };
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    const menu = $("#method-menu");
    if (menu && !menu.hidden && (!el || (el.dataset.act !== "method-menu" && el.dataset.act !== "method"))) menu.hidden = true;
    if (!el) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener("input", e => {
    const el = e.target;
    if (el.id === "lib-q") {
      libQuery = el.value;
      const pos = el.selectionStart; route();
      const n = $("#lib-q"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) { /* search inputs */ } }
      return;
    }
    if (el.id === "letters") { const v = el.value; el.value = ""; for (const ch of v) if (/[A-Za-z0-9]/.test(ch)) typedLetter(ch); return; }
    if (el.dataset.set && el.type === "range") {
      const k = el.dataset.set; set()[k] = +el.value; save(); applyLook();
      const out = el.parentElement.querySelector("output");
      if (out) out.textContent = (FMT[k] || (v => v))(+el.value);
    }
  });
  document.addEventListener("paste", e => { if (e.target.id === "paste-raw") setTimeout(() => takePasted(e.target.value), 0); });
  document.addEventListener("change", e => {
    const el = e.target;
    if (el.id === "restore-file" && el.files && el.files[0]) { el.files[0].text().then(restore); return; }
    if (el.id === "plan-time") { state.plan.time = el.value; save(); return; }
    if (!el.dataset.set) return;
    const k = el.dataset.set;
    if (el.type === "checkbox") set()[k] = el.checked;
    else if (el.type === "range") set()[k] = +el.value;
    else set()[k] = (k === "weekGoal" || k === "retention") ? +el.value : el.value;
    save(); applyLook();
    if (k === "weekGoal") route();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.id === "lib-q") { const r = Bible.parseRef(e.target.value); if (r) { e.preventDefault(); go("#pick/ref/" + encodeURIComponent(e.target.value.trim())); } }
    if (e.key === "Enter" && e.target.id === "pick-ref") {
      e.preventDefault();
      const r = Bible.parseRef(e.target.value);
      if (!r) { toast("Try a reference like John 15:5 or Psalm 23:1–3."); return; }
      Object.assign(pick, r, { a: r.a, b: r.b });
      if (r.a) getPicked(); else route();
    }
    if (e.key === "Enter" && e.target.id === "typed" && !e.shiftKey) { e.preventDefault(); ACTIONS["type-check"](); }
  });
  window.addEventListener("hashchange", route);
  window.addEventListener("online", refreshLicensed);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { stopListening(); stopSpeaking(); } else refreshLicensed(); });

  const VIEWS = { today, library, item: itemView, add, pick: pickView, paste: pasteView, progress, settings, welcome, practice, listen, copyright };
  const VERSION = document.documentElement.dataset.version || "dev";
  // Shared from another app on Android (manifest share_target): open the Paste screen with it.
  const shared = new URLSearchParams(location.search);
  if (shared.get("text") || shared.get("url")) {
    const raw = [shared.get("text"), shared.get("url")].filter(Boolean).join("\n");
    pasted = Object.assign({ raw }, Bible.readPasted(raw));
    if (!pasted.text && !pasted.onlyLink) pasted.text = raw;
    state.welcomed = true; save();
    history.replaceState(null, "", location.pathname + "#paste");
  }
  // The welcome greets anyone who isn't signed in each time the app opens; signed-in people go straight in.
  // Firebase restores a sign-in a moment after load, so account.js leaves a hint for this check.
  // No hint yet (first launch after this was added): a phone that has synced with an account counts as signed in.
  // If this phone can't tell yet (no hint saved), the screen stays blank until the account answers (at most
  // a few seconds) instead of flashing the welcome at someone who is signed in.
  let hint = null;
  try { hint = localStorage.getItem("byheart-signedin"); } catch (e) { /* treat as unknown */ }
  const signedInHint = isSignedIn();
  if (signedInHint && !state.welcomed) { state.welcomed = true; writeLocal(); } // signed-in people never need the welcome
  if (!signedInHint && !/^#(welcome|paste|pick|item|listen)/.test(location.hash)) {
    history.replaceState(null, "", location.pathname + location.search + "#welcome");
    if (hint === null && window.BYHEART_FIREBASE) { // accounts are on (account.js loads next): wait for its answer
      deciding = true;
      document.body.classList.add("deciding");
      setTimeout(endDeciding, 3000);
    }
  }
  applyLook();
  route();
  refreshLicensed();
  // offline support; skipped on localhost so edits show up while previewing (add ?sw to test it)
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw\b/.test(location.search);
  if ("serviceWorker" in navigator && location.protocol !== "file:" && !local) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  // account.js uses replace and signedOut; the rest is for debugging in the console
  window.ByHeart = { state: () => state, session: () => S, save, writeLocal, replace: replaceState, signedOut, accountChanged, Words: W, Memory: M };
})();
