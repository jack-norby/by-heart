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
    tr: "BSB", tradition: "all",
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
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { if (!warnedSave) { warnedSave = true; toast("This device wouldn't save your progress. Make a backup in Settings."); } }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const set = () => state.settings;

  // ---------- the library ----------
  function allItems() { return LIBRARY.concat(state.custom); }
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
  function shown(it) { // prayers filtered by the chosen tradition
    if (it.kind === "verse" || !it.tradition) return true;
    const t = set().tradition;
    return t === "all" || it.tradition.includes("all") || it.tradition.includes(t);
  }
  function status(it) {
    const p = prog(it.id);
    if (!p) return { key: "new", label: "New" };
    if (p.stage === "learning") return { key: "learning", label: "Learning · " + Math.min(p.learned || 0, phrasesOf(it).length) + " of " + phrasesOf(it).length + " lines" };
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
    return allItems().filter(it => { const p = prog(it.id); return p && p.stage !== "learning" && p.due && p.due <= t; })
      .sort((a, b) => prog(a.id).due.localeCompare(prog(b.id).due));
  }
  function learningItems() {
    return allItems().filter(it => { const p = prog(it.id); return p && p.stage === "learning"; })
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

  // ---------- router ----------
  const main = () => $("#main");
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    stopSpeaking();
    const [name, arg] = location.hash.replace(/^#/, "").split("/").map(decodeURIComponent);
    if (name !== "practice" && S) endSession();
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
  }
  const TAB_OF = { today: "today", library: "library", item: "library", add: "library", progress: "progress", settings: "settings" };

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
        '<a class="btn btn--primary btn--big" href="#library">' + (any ? "Learn something new" : "Choose a verse or prayer") + "</a>" +
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
  function library() {
    const tabs = [["verse", "Verses"], ["prayer", "Prayers"], ["mine", "Mine"]];
    const q = libQuery.trim().toLowerCase();
    let items = allItems().filter(it => libTab === "mine" ? it.custom : libTab === "prayer" ? (it.kind === "prayer" || it.kind === "catechism") && !it.custom : it.kind === "verse" && !it.custom);
    if (libTab === "prayer") items = items.filter(shown);
    if (q) items = allItems().filter(it => (it.title + " " + it.ref + " " + it.text + " " + (it.tags || []).join(" ")).toLowerCase().includes(q));
    const trad = libTab === "prayer" && !q ? '<div class="chips" role="group" aria-label="Show prayers from">' +
      [["all", "All"], ["catholic", "Catholic"], ["orthodox", "Orthodox"], ["protestant", "Protestant"]].map(([v, l]) =>
        '<button class="chip' + (set().tradition === v ? " on" : "") + '" aria-pressed="' + (set().tradition === v) + '" data-act="tradition" data-v="' + v + '">' + l + "</button>").join("") + "</div>" : "";
    const empty = libTab === "mine" && !items.length && !q ? '<p class="empty">Verses and prayers you add show up here.</p>' : (!items.length ? '<p class="empty">Nothing matches that.</p>' : "");
    return '<section class="view"><h1 class="h1">Library</h1>' +
      '<label class="search"><span class="sr-only">Search</span><input type="search" id="lib-q" placeholder="Search verses and prayers" value="' + esc(libQuery) + '"></label>' +
      (q ? "" : '<div class="seg" role="tablist">' + tabs.map(([v, l]) => '<button role="tab" aria-selected="' + (libTab === v) + '" data-act="lib-tab" data-v="' + v + '">' + l + "</button>").join("") + "</div>") +
      trad + '<a class="btn btn--wide" href="#add">+ Add a verse or prayer</a>' +
      '<ul class="rows">' + items.map(rowHTML).join("") + "</ul>" + empty + "</section>";
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
    if (!p) primary = '<button class="btn btn--primary btn--big" data-act="learn" data-id="' + esc(id) + '">Start learning</button>';
    else if (p.stage === "learning") primary = '<button class="btn btn--primary btn--big" data-act="learn" data-id="' + esc(id) + '">Keep learning</button>';
    else primary = '<button class="btn btn--primary btn--big" data-act="review" data-id="' + esc(id) + '">Practice from memory</button>';
    const ladder = s.key === "practicing" ? '<p class="fine">' + dots(s.good) + " Recall it right on three different days and it's memorized. Next practice " + rel(p.due) + ".</p>" :
      s.key === "memorized" ? '<p class="fine">Next practice ' + rel(p.due) + ". Reviews get further apart as it sticks.</p>" : "";
    const body = editing === id ?
      '<div class="card"><label class="field"><span>The words</span><textarea id="edit-text" rows="10">' + esc(it.text) + '</textarea></label>' +
      '<p class="fine">Put each phrase on its own line if you like. Lines are how it gets learned.</p>' +
      '<div class="btns"><button class="btn btn--primary" data-act="save-edit" data-id="' + esc(id) + '">Save</button><button class="btn btn--quiet" data-act="cancel-edit">Cancel</button>' +
      (state.edits[id] ? '<button class="btn btn--quiet" data-act="restore-edit" data-id="' + esc(id) + '">Use the original</button>' : "") + "</div></div>" :
      '<div class="card">' + linesHTML(it) + "</div>";
    return '<section class="view"><a class="back" href="#library">' + ICON.back + "Library</a>" +
      '<h1 class="h1">' + esc(it.title) + '</h1><p class="ref">' + esc(it.ref) + (it.tr ? " · " + esc(trName(it.tr)) : "") + (it.edited ? " · your wording" : "") + "</p>" +
      pill(it) + ladder + primary +
      '<div class="btns"><button class="btn" data-act="listen-all" data-id="' + esc(id) + '">' + ICON.speaker + "Listen</button>" +
      (p && p.stage !== "learning" ? '<a class="btn" href="#listen/' + encodeURIComponent(id) + '">Say it to someone</a>' : "") + "</div>" +
      (it.about ? '<div class="card card--soft"><h2 class="h3">What it means</h2><p>' + esc(it.about) + "</p></div>" : "") +
      body +
      '<div class="btns btns--end">' + (editing === id ? "" : '<button class="btn btn--quiet" data-act="edit" data-id="' + esc(id) + '">Edit the words</button>') +
      (p ? '<button class="btn btn--quiet" data-act="reset-item" data-id="' + esc(id) + '">Start this one over</button>' : "") +
      (it.custom ? '<button class="btn btn--quiet" data-act="remove-item" data-id="' + esc(id) + '">Remove</button>' : "") + "</div>" +
      (it.credit ? '<p class="fine">' + esc(it.credit) + "</p>" : "") +
      (it.tr === "BSB" ? '<p class="fine">Berean Standard Bible. Public domain.</p>' : "") + "</section>";
  }

  // ---------- adding verses and prayers ----------
  const TRANSLATIONS = [["BSB", "Berean Standard Bible"], ["eng_kjv", "King James Version"], ["ENGWEBP", "World English Bible"], ["eng_dra", "Douay-Rheims (Catholic)"]];
  function trName(id) { const t = TRANSLATIONS.find(x => x[0] === id); return t ? (id === "BSB" ? "BSB" : id === "eng_kjv" ? "KJV" : id === "ENGWEBP" ? "WEB" : id === "eng_dra" ? "Douay-Rheims" : t[1]) : id; }
  const BOOKS = [["GEN", "Genesis", "gen", "gn"], ["EXO", "Exodus", "ex", "exod"], ["LEV", "Leviticus", "lev", "lv"], ["NUM", "Numbers", "num", "nm"], ["DEU", "Deuteronomy", "deut", "dt"],
    ["JOS", "Joshua", "josh", "jos"], ["JDG", "Judges", "judg", "jdg"], ["RUT", "Ruth", "ru"], ["1SA", "1 Samuel", "1sam", "1sa"], ["2SA", "2 Samuel", "2sam", "2sa"],
    ["1KI", "1 Kings", "1kgs", "1ki"], ["2KI", "2 Kings", "2kgs", "2ki"], ["1CH", "1 Chronicles", "1chr", "1ch"], ["2CH", "2 Chronicles", "2chr", "2ch"], ["EZR", "Ezra", "ezr"],
    ["NEH", "Nehemiah", "neh"], ["EST", "Esther", "esth", "est"], ["JOB", "Job", "jb"], ["PSA", "Psalms", "psalm", "ps", "psa", "pss"], ["PRO", "Proverbs", "prov", "pr", "prv"],
    ["ECC", "Ecclesiastes", "eccl", "ecc", "qoh"], ["SNG", "Song of Songs", "song of solomon", "song", "sos", "sng"], ["ISA", "Isaiah", "isa", "is"], ["JER", "Jeremiah", "jer"],
    ["LAM", "Lamentations", "lam"], ["EZK", "Ezekiel", "ezek", "ezk"], ["DAN", "Daniel", "dan", "dn"], ["HOS", "Hosea", "hos"], ["JOL", "Joel", "jl"], ["AMO", "Amos", "am"],
    ["OBA", "Obadiah", "obad", "ob"], ["JON", "Jonah", "jon"], ["MIC", "Micah", "mic"], ["NAM", "Nahum", "nah"], ["HAB", "Habakkuk", "hab"], ["ZEP", "Zephaniah", "zeph", "zep"],
    ["HAG", "Haggai", "hag"], ["ZEC", "Zechariah", "zech", "zec"], ["MAL", "Malachi", "mal"], ["MAT", "Matthew", "matt", "mt"], ["MRK", "Mark", "mk", "mrk"], ["LUK", "Luke", "lk", "luk"],
    ["JHN", "John", "jn", "jhn"], ["ACT", "Acts", "act"], ["ROM", "Romans", "rom", "rm"], ["1CO", "1 Corinthians", "1cor", "1co"], ["2CO", "2 Corinthians", "2cor", "2co"],
    ["GAL", "Galatians", "gal"], ["EPH", "Ephesians", "eph"], ["PHP", "Philippians", "phil", "php"], ["COL", "Colossians", "col"], ["1TH", "1 Thessalonians", "1thess", "1th"],
    ["2TH", "2 Thessalonians", "2thess", "2th"], ["1TI", "1 Timothy", "1tim", "1ti"], ["2TI", "2 Timothy", "2tim", "2ti"], ["TIT", "Titus", "tit"], ["PHM", "Philemon", "phlm", "phm"],
    ["HEB", "Hebrews", "heb"], ["JAS", "James", "jas", "jm"], ["1PE", "1 Peter", "1pet", "1pe"], ["2PE", "2 Peter", "2pet", "2pe"], ["1JN", "1 John", "1jn", "1jhn"],
    ["2JN", "2 John", "2jn"], ["3JN", "3 John", "3jn"], ["JUD", "Jude", "jud"], ["REV", "Revelation", "rev", "rv", "revelations"]];
  function findBook(raw) {
    const n = raw.toLowerCase().replace(/\./g, "").replace(/^(first|i)\s+/, "1 ").replace(/^(second|ii)\s+/, "2 ").replace(/^(third|iii)\s+/, "3 ").replace(/\s+/g, " ").trim();
    const flat = n.replace(/\s/g, "");
    for (const b of BOOKS) if (b.slice(2).some(a => a.replace(/\s/g, "") === flat)) return b;
    for (const b of BOOKS) if (b[1].toLowerCase().replace(/\s/g, "").startsWith(flat) && flat.length >= 2) return b;
    return null;
  }
  function parseRef(s) {
    const m = String(s).trim().match(/^([1-3]?\s*[A-Za-z][A-Za-z. ]*?)\s*(\d+)(?:\s*[:.]\s*(\d+)(?:\s*[-–—]\s*(\d+))?)?\s*$/);
    if (!m) return null;
    const b = findBook(m[1]);
    if (!b) return null;
    return { book: b[0], name: b[1], ch: +m[2], a: m[3] ? +m[3] : null, b: m[4] ? +m[4] : (m[3] ? +m[3] : null) };
  }
  function chapterText(content, a, b) {
    let out = "", count = 0;
    content.forEach(item => {
      if (item.type !== "verse" || (a && (item.number < a || item.number > b))) return;
      count++;
      item.content.forEach(c => {
        if (typeof c === "string") out += (out && !/[\s\n]$/.test(out) ? " " : "") + c.trim();
        else if (c && c.lineBreak) out += "\n";
        else if (c && typeof c.text === "string") {
          if (c.poem && out && !out.endsWith("\n")) out += "\n";
          else if (out && !/[\s\n]$/.test(out)) out += " ";
          out += c.text.trim();
        }
      });
    });
    out = out.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/[‘’](?=\s*$)/, "").trim();
    return { text: out, count };
  }
  let addTab = "find", found = null;
  function add() {
    const tabs = '<div class="seg" role="tablist"><button role="tab" aria-selected="' + (addTab === "find") + '" data-act="add-tab" data-v="find">Find a verse</button>' +
      '<button role="tab" aria-selected="' + (addTab === "own") + '" data-act="add-tab" data-v="own">Write your own</button></div>';
    let body;
    if (addTab === "find") {
      body = '<div class="card"><label class="field"><span>Reference</span><input type="text" id="ref" placeholder="Romans 8:38–39" autocomplete="off" autocapitalize="words"></label>' +
        '<label class="field"><span>Translation</span><select id="tr">' + TRANSLATIONS.map(([v, l]) => '<option value="' + v + '"' + (set().tr === v ? " selected" : "") + ">" + l + "</option>").join("") + "</select></label>" +
        '<button class="btn btn--primary" data-act="find">Find it</button><p class="fine">Needs an internet connection. These translations are free to use (public domain). For another translation, use <b>Write your own</b>.</p></div>' +
        '<div id="found"></div>';
    } else {
      body = '<div class="card"><label class="field"><span>Name</span><input type="text" id="own-title" placeholder="Psalm 1 or Morning prayer" autocomplete="off"></label>' +
        '<label class="field"><span>Reference or source (optional)</span><input type="text" id="own-ref" placeholder="ESV, my church\'s wording…" autocomplete="off"></label>' +
        '<label class="field"><span>The words</span><textarea id="own-text" rows="8" placeholder="Paste or type it here. Put each phrase on its own line if you like."></textarea></label>' +
        '<button class="btn btn--primary" data-act="save-own">Add it</button><p class="fine">Use any translation you own or your church\'s wording. It stays on this device.</p></div>';
    }
    return '<section class="view"><a class="back" href="#library">' + ICON.back + 'Library</a><h1 class="h1">Add</h1>' + tabs + body + "</section>";
  }
  async function findVerse() {
    const raw = $("#ref").value, tr = $("#tr").value, box = $("#found");
    const r = parseRef(raw);
    if (!r) { box.innerHTML = '<p class="empty">Try a reference like <b>John 15:5</b> or <b>Psalm 1</b>.</p>'; return; }
    box.innerHTML = '<p class="empty">Looking…</p>';
    try {
      const res = await fetch("https://bible.helloao.org/api/" + tr + "/" + r.book + "/" + r.ch + ".json");
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      let { text, count } = chapterText(data.chapter.content, r.a, r.b);
      if (!count) { box.innerHTML = '<p class="empty">Couldn\'t find that verse in this translation.</p>'; return; }
      if (!r.a && count > 40) { box.innerHTML = '<p class="empty">That chapter is long. Try a range, like ' + esc(r.name) + " " + r.ch + ":1–12.</p>"; return; }
      const ref = (r.book === "PSA" ? "Psalm" : r.name) + " " + r.ch + (r.a ? ":" + r.a + (r.b !== r.a ? "–" + r.b : "") : "");
      found = { ref, text, tr };
      box.innerHTML = '<div class="card"><p class="ref">' + esc(ref) + " · " + esc(trName(tr)) + '</p><div class="reading">' + esc(text).replace(/\n/g, "<br>") + "</div>" +
        '<label class="field"><span>Name (optional)</span><input type="text" id="found-title" placeholder="' + esc(ref) + '"></label>' +
        '<button class="btn btn--primary" data-act="save-found">Add to my list</button></div>';
    } catch (e) {
      box.innerHTML = '<p class="empty">Couldn\'t reach the Bible library. Check your connection, or paste the verse under <b>Write your own</b>.</p>';
    }
  }
  function addCustom(o) {
    const id = "u-" + Date.now().toString(36);
    state.custom.push(Object.assign({ id, custom: true, tags: [] }, o));
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
    return '<section class="view"><h1 class="h1">Settings</h1>' +
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
      '<div class="card"><h2 class="h3">Verses you add</h2>' + select("tr", "Translation", TRANSLATIONS) + "</div>" +
      '<div class="card"><h2 class="h3">Backup</h2><p class="fine">Your progress lives only on this device. Save a backup now and then, especially before changing phones.</p>' +
      '<div class="btns"><button class="btn" data-act="backup-file">Download backup</button><button class="btn" data-act="backup-code">Copy backup code</button></div>' +
      '<label class="field"><span>Restore from a backup code or file</span><textarea id="restore" rows="3" placeholder="Paste a backup code"></textarea></label>' +
      '<div class="btns"><button class="btn" data-act="restore-code">Restore code</button><label class="btn">Choose file<input type="file" id="restore-file" accept=".json,application/json" hidden></label></div></div>' +
      '<div class="card"><h2 class="h3">How By Heart works</h2><ul class="how">' +
      "<li><b>Recall, don't reread.</b> Pulling words from memory builds memory far better than reading them again.</li>" +
      "<li><b>Short lines, fading help.</b> You learn a line at a time, with hints that fade: blanks, then first letters, then nothing. Slip up and the help comes back.</li>" +
      "<li><b>Spaced reviews.</b> Reviews come back just before you'd forget, further apart each time (the FSRS scheduler).</li>" +
      "<li><b>Three good days.</b> A passage counts as memorized after you recall it on three different days.</li>" +
      "<li><b>Forgiving checks.</b> Spelling isn't memory, so small slips count as right.</li></ul></div>" +
      '<div class="card"><h2 class="h3">About</h2><p class="fine">Scripture in the library is the Berean Standard Bible (public domain). Verses you find can come from the BSB, KJV, World English Bible or Douay-Rheims, all public domain, through the Free Use Bible API (bible.helloao.org). Prayers use traditional wording; ELLC texts © 1988 English Language Liturgical Consultation.</p>' +
      '<p class="fine">By Heart · Version ' + VERSION + '</p><button class="btn btn--quiet" data-act="start-over">Start over (erase everything)</button></div></section>';
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
  function backupCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); }
  function restore(json) {
    let s;
    try { s = typeof json === "string" ? JSON.parse(json) : json; } catch (e) { s = null; }
    if (!s || typeof s !== "object" || !s.settings) { toast("That doesn't look like a By Heart backup."); return; }
    if (!confirm("Replace what's on this device with the backup?")) return;
    state = migrate(s); state.welcomed = true; save(); applyLook(); toast("Backup restored."); go("#today");
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
        '<p class="verse">“I have hidden Your word in my heart.” <span>Psalm 119:11</span></p>' +
        '<button class="btn btn--primary btn--big" data-act="welcome-next">Get started</button></section>';
    }
    if (welcomeStep === 1) {
      return '<section class="view view--welcome"><h1 class="h1">What helps you learn?</h1><p>Pick any that fit. You can change them later in Settings.</p>' +
        '<div class="choices">' + HELPS.filter(h => h[0] !== "speak" || SR).map(([k, l]) => '<button class="choice' + (helps[k] ? " on" : "") + '" aria-pressed="' + !!helps[k] + '" data-act="help" data-v="' + k + '">' + l + "</button>").join("") + "</div>" +
        '<button class="btn btn--primary btn--big" data-act="welcome-next">Next</button></section>';
    }
    const t = set().tradition;
    const ids = ["v-psalm-119-11", "v-john-3-16", t === "catholic" ? "p-our-father" : "p-lords-prayer", "p-jesus-prayer", "v-psalm-23-1-6", "v-philippians-4-6-7"];
    return '<section class="view view--welcome"><h1 class="h1">Pick your first one</h1><p>Start small. You can add more any time.</p>' +
      '<div class="chips" role="group" aria-label="Your tradition">' + [["all", "Any church"], ["catholic", "Catholic"], ["orthodox", "Orthodox"], ["protestant", "Protestant"]].map(([v, l]) =>
        '<button class="chip' + (t === v ? " on" : "") + '" aria-pressed="' + (t === v) + '" data-act="welcome-trad" data-v="' + v + '">' + l + "</button>").join("") + "</div>" +
      '<ul class="rows">' + ids.map(item).filter(Boolean).map(it => '<li><button class="row" data-act="welcome-pick" data-id="' + it.id + '"><span class="row-main"><span class="row-title">' + esc(it.title) +
        '</span><span class="row-sub">' + esc(it.ref) + " · " + wordCount(it) + " words</span></span></button></li>").join("") + "</ul>" +
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
    tasks = tasks.filter(t => t && item(t.id));
    if (!tasks.length) return;
    tasks.forEach(t => { if (t.kind === "learn") ensureProg(t.id); });
    save();
    S = { tasks, ti: -1, plans: tasks.map(planSteps), done: [], doneSteps: 0, flow: false, grade: null, finished: false };
    nextTask();
    go("#practice");
  }
  function endSession() { stopListening(); stopSpeaking(); S = null; }
  function totalSteps() { return S.plans.reduce((n, p) => n + p.length, 0); }
  function nextTask() {
    S.ti++;
    if (S.ti >= S.tasks.length) { S.finished = true; return; }
    S.steps = S.plans[S.ti]; S.si = 0; S.hints = 0;
    if (!S.steps.length) { nextTask(); return; }
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
      '<div class="p-head"><p class="eyebrow">' + esc(eyebrow) + (S.tasks.length > 1 ? " · " + (S.ti + 1) + " of " + S.tasks.length : "") + '</p><h1 class="h2">' + esc(it.title) + '</h1><p class="ref">' + esc(it.ref) + '</p><p class="howto">' + esc(howto) + "</p></div>" +
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
      return '<div class="btns btns--center"><button class="btn" data-act="hear">' + ICON.speaker + 'Listen</button><button class="btn btn--primary btn--big" data-act="said">I said it</button></div>';
    }
    if (L.done && !L.perfect) {
      return '<p class="feedback">' + feedbackText(L) + '</p><div class="btns btns--center"><button class="btn" data-act="hear">' + ICON.speaker + "Hear it</button>" +
        (m === "speak" || m === "type" ? '<button class="btn" data-act="override">I had it right</button>' : "") + '<button class="btn btn--primary btn--big" data-act="next-line">Next</button></div>';
    }
    if (L.done) return '<p class="feedback feedback--good">All there.</p>';
    const hint = '<button class="btn" data-act="hint">Hint</button>';
    if (m === "say") {
      if (L.revealed) return '<p class="feedback">Tap any words you missed or changed.</p><div class="btns btns--center"><button class="btn" data-act="hear">' + ICON.speaker + 'Hear it</button><button class="btn btn--primary btn--big" data-act="say-done">' + (L.marked && L.marked.some(Boolean) ? "Done" : "Got it all") + "</button></div>";
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
    if (cur().kind === "meet" && set().autoRead && !S.readThis) { S.readThis = true; hearLine(); }
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
      const it = item(el.dataset.id), lines = document.querySelectorAll(".reading .line"), ph = phrasesOf(it);
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
    edit: el => { editing = el.dataset.id; route(); },
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
    tradition: el => { set().tradition = el.dataset.v; save(); route(); },
    "add-tab": el => { addTab = el.dataset.v; route(); },
    find: () => findVerse(),
    "save-found": () => {
      if (!found) return;
      const title = ($("#found-title").value || "").trim() || found.ref;
      const id = addCustom({ kind: "verse", title, ref: found.ref, tr: found.tr, text: found.text });
      found = null; libTab = "mine"; go("#item/" + id);
    },
    "save-own": () => {
      const title = $("#own-title").value.trim(), text = $("#own-text").value.trim();
      if (!title || !text) { toast("Add a name and the words."); return; }
      const id = addCustom({ kind: "prayer", title, ref: $("#own-ref").value.trim() || "Your own", text });
      libTab = "mine"; go("#item/" + id);
    },
    anchor: el => { const a = $("#anchor"); if (a) a.value = el.dataset.v; },
    "save-plan": () => { const v = ($("#anchor").value || "").trim().replace(/[.,]+$/, ""); if (!v) { toast("Add something you already do every day."); return; } state.plan.anchor = v; save(); toast("Saved. After you " + v + ", open By Heart."); route(); },
    "dismiss-plan": () => { state.plan.dismissed = true; save(); route(); },
    install: async () => { if (installEvent) { installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; route(); } },
    "dismiss-install": () => { state.installDismissed = true; save(); route(); },
    "test-voice": () => speak("The LORD is my shepherd; I shall not want."),
    ics: () => { const t = $("#plan-time"); if (t) { state.plan.time = t.value || "07:30"; save(); } download("by-heart-reminder.ics", "text/calendar", icsFile()); },
    "backup-file": () => download("by-heart-backup-" + M.today() + ".json", "application/json", JSON.stringify(state)),
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
    "start-over": () => { if (confirm("Erase all progress, settings and added verses on this device?") && confirm("This can't be undone. Erase everything?")) { state = fresh(); save(); applyLook(); welcomeStep = 0; helps = {}; go("#welcome"); } },
    "welcome-next": () => { if (welcomeStep === 1) applyHelps(); welcomeStep++; save(); route(); },
    help: el => { helps[el.dataset.v] = !helps[el.dataset.v]; route(); },
    "welcome-trad": el => { set().tradition = el.dataset.v; save(); route(); },
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
    if (e.key === "Enter" && e.target.id === "ref") { e.preventDefault(); findVerse(); }
    if (e.key === "Enter" && e.target.id === "typed" && !e.shiftKey) { e.preventDefault(); ACTIONS["type-check"](); }
  });
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { stopListening(); stopSpeaking(); } });

  const VIEWS = { today, library, item: itemView, add, progress, settings, welcome, practice, listen };
  const VERSION = document.documentElement.dataset.version || "dev";
  applyLook();
  route();
  // offline support; skipped on localhost so edits show up while previewing (add ?sw to test it)
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw\b/.test(location.search);
  if ("serviceWorker" in navigator && location.protocol !== "file:" && !local) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  window.ByHeart = { state: () => state, session: () => S, save, Words: W, Memory: M }; // for debugging in the console
})();
