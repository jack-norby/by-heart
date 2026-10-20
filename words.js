// By Heart: splitting text into words and phrases, hiding cues, and checking answers kindly.
// Checking is forgiving by default: spelling slips, numbers and sound-alike words count as right,
// because the goal is remembering the words, not spelling them.
(function () {
  const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  function numWords(n) {
    if (n < 20) return SMALL[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? SMALL[n % 10] : "");
    if (n < 1000) return SMALL[Math.floor(n / 100)] + "hundred" + (n % 100 ? numWords(n % 100) : "");
    return String(n);
  }

  // A word's comparison key: lowercase letters and digits, no punctuation, numbers spelled out.
  function key(w) {
    let k = String(w).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/^\d+$/.test(k)) k = numWords(parseInt(k, 10));
    return k;
  }

  // Words speech recognition (or spelling) commonly swaps. Same group = same word.
  const ALIKE = [
    ["hallowed", "hollowed", "hallow", "hollow"], ["thy", "thigh"], ["son", "sun"], ["whole", "hole"],
    ["holy", "wholly", "holey"], ["peace", "piece"], ["pray", "prey"], ["praise", "prays", "preys"],
    ["know", "no"], ["knew", "new"], ["knows", "nose"], ["one", "won"], ["for", "four", "fore"],
    ["to", "too", "two"], ["there", "their", "theyre"], ["right", "write", "rite"], ["be", "bee"],
    ["seen", "scene"], ["reign", "rain", "rein"], ["soul", "sole"], ["sow", "so", "sew"], ["weak", "week"],
    ["wait", "weight"], ["lead", "led"], ["mourn", "morn"], ["mary", "marry", "merry"], ["pilate", "pilot"],
    ["shepherd", "shepard", "sheppard"], ["heal", "heel"], ["here", "hear"], ["through", "threw", "thru"],
    ["way", "weigh"], ["by", "buy", "bye"], ["i", "eye"], ["our", "hour"], ["ye", "yee"], ["lo", "low"],
    ["altar", "alter"], ["bread", "bred"], ["rose", "rows"], ["vain", "vein", "vane"], ["amen", "ahmen"],
    ["oh", "o"], ["ok", "okay"], ["art", "are"],
  ];
  const GROUP = {};
  ALIKE.forEach((g, i) => g.forEach(w => { GROUP[w] = i; }));

  // Edit distance where swapping two neighbouring letters counts as one slip.
  function dist(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(new Array(n).fill(0)));
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const c = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[m][n];
  }

  // 2 = same word, 1 = close enough (spelling slip or sound-alike), 0 = different.
  function alike(t, a, forgiving) {
    if (!t || !a) return 0;
    if (t === a) return 2;
    if (!forgiving) return 0;
    if (GROUP[t] !== undefined && GROUP[t] === GROUP[a]) return 1;
    if (t + "s" === a || a + "s" === t) return t.length > 3 ? 1 : 0;
    const L = Math.max(t.length, a.length);
    if (L <= 3 || t[0] !== a[0]) return 0;
    // in short words one changed letter is usually a different word (love/live), so only allow
    // a swapped, missing or extra letter there
    if (L <= 5 && t.length === a.length && [...t].filter((c, i) => c !== a[i]).length === 1) return 0;
    return dist(t, a) <= (L <= 5 ? 1 : L <= 9 ? 2 : 3) ? 1 : 0;
  }

  // Lines of display tokens: [{t: "shepherd;", k: "shepherd"}]. A dash or stray mark joins the word before it.
  function lines(text) {
    return String(text).split(/\n+/).map(line => {
      const out = [];
      line.replace(/—/g, "— ").split(/\s+/).filter(Boolean).forEach(t => {
        const k = key(t);
        if (!k && out.length) out[out.length - 1].t += t;
        else if (k) out.push({ t, k });
      });
      return out;
    }).filter(l => l.length);
  }

  // Split a long line at the punctuation nearest its middle until every piece is short.
  // Without punctuation, break before a joining word like "that" or "but".
  const JOINERS = new Set(["that", "but", "and", "or", "for", "who", "which", "so", "because", "when", "while", "as", "through", "with", "to", "from", "nor", "yet"]);
  function split(tokens, max) {
    if (tokens.length <= max) return [tokens];
    const strong = /[.;:!?]["”’)]?$/, soft = /[,—]["”’)]?$/;
    let best = -1, bestScore = Infinity;
    for (let i = 2; i < tokens.length - 3; i++) { // both pieces keep at least three words
      const t = tokens[i].t;
      const w = strong.test(t) ? 0 : soft.test(t) ? 1.5 : JOINERS.has(tokens[i + 1].k) ? 3 : null;
      if (w === null) continue;
      const score = Math.abs(i + 1 - tokens.length / 2) + w;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0 && tokens.length <= max + 2) return [tokens]; // a slightly long line beats a clumsy break
    if (best < 0) best = Math.ceil(tokens.length / 2) - 1;
    return split(tokens.slice(0, best + 1), max).concat(split(tokens.slice(best + 1), max));
  }

  // The phrases a passage is learned in: its own lines, with long lines split at punctuation.
  // Each phrase is an array of tokens; every token also gets its index in the whole passage.
  function phrases(text, max) {
    max = max || 8;
    const out = [];
    lines(text).forEach(l => split(l, max).forEach(p => out.push(p)));
    // fold a one-word scrap (like "forever." or "Amen.") into the phrase before it
    for (let i = out.length - 1; i > 0; i--) {
      if (out[i].length === 1) { out[i - 1] = out[i - 1].concat(out[i]); out.splice(i, 1); }
    }
    let n = 0;
    out.forEach(p => p.forEach(tok => { tok.i = n++; }));
    return out;
  }

  // How a word looks at each cue level. 0 = whole word, 1 = some words blank, 2 = first letters, 3 = nothing.
  function trailing(t) { const m = t.match(/[^A-Za-z0-9’']+$/); return m ? m[0] : ""; }
  function leading(t) { const m = t.match(/^[^A-Za-z0-9]+/); return m ? m[0] : ""; }
  function firstLetter(t) { const m = t.match(/[A-Za-z0-9]/); return m ? m[0] : ""; }
  function hiddenAt(level, i, seed) { return level >= 2 || (level === 1 && (i + (seed || 0)) % 2 === 1); }

  // Line up an answer with the target words, allowing skipped, extra and joined words.
  // Returns {status: [...per target word: ok | close | wrong | missed | pending], said: [...], extra, ok}.
  // With partial: true (live speech), target words after the last one reached stay "pending".
  function align(target, answer, opts) {
    opts = opts || {};
    const F = opts.forgiving !== false;
    const n = target.length, m = answer.length;
    const S = [], B = [];
    for (let i = 0; i <= n; i++) { S.push(new Float64Array(m + 1)); B.push(new Uint8Array(m + 1)); }
    for (let i = 1; i <= n; i++) { S[i][0] = -i; B[i][0] = 2; }
    for (let j = 1; j <= m; j++) { S[0][j] = -0.5 * j; B[0][j] = 3; }
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const a = alike(target[i - 1], answer[j - 1], F);
        let best = S[i - 1][j - 1] + (a === 2 ? 2 : a === 1 ? 1.6 : -1), b = 1;
        if (j >= 2) {
          const a2 = alike(target[i - 1], answer[j - 2] + answer[j - 1], F);
          if (a2) { const v = S[i - 1][j - 2] + (a2 === 2 ? 2 : 1.6); if (v > best) { best = v; b = 4; } }
        }
        const up = S[i - 1][j] - 1; if (up > best) { best = up; b = 2; }
        const left = S[i][j - 1] - 0.5; if (left > best) { best = left; b = 3; }
        S[i][j] = best; B[i][j] = b;
      }
    }
    let ei = n;
    if (opts.partial) {
      let bv = -Infinity;
      for (let i = 0; i <= n; i++) if (S[i][m] > bv) { bv = S[i][m]; ei = i; }
      if (m === 0) ei = 0;
    }
    const status = new Array(n).fill(opts.partial ? "pending" : "missed");
    const said = new Array(n).fill("");
    let extra = 0, i = ei, j = m;
    while (i > 0 || j > 0) {
      const b = i > 0 && j > 0 ? B[i][j] : i > 0 ? 2 : 3;
      if (b === 1) {
        const a = alike(target[i - 1], answer[j - 1], F);
        status[i - 1] = a === 2 ? "ok" : a === 1 ? "close" : "wrong"; said[i - 1] = answer[j - 1]; i--; j--;
      } else if (b === 4) {
        const a = alike(target[i - 1], answer[j - 2] + answer[j - 1], F);
        status[i - 1] = a === 2 ? "ok" : "close"; said[i - 1] = answer[j - 2] + " " + answer[j - 1]; i--; j -= 2;
      } else if (b === 2) { status[i - 1] = "missed"; i--; }
      else { extra++; j--; }
    }
    const ok = status.filter(s => s === "ok" || s === "close").length;
    return { status, said, extra, ok, reached: ei };
  }

  function keysOf(text) {
    return String(text).replace(/—/g, " ").split(/\s+/).map(key).filter(Boolean);
  }

  window.Words = { key, lines, phrases, align, alike, keysOf, trailing, leading, firstLetter, hiddenAt };
})();
