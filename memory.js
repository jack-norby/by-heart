// By Heart: when to review. FSRS-4.5 (the free spaced-repetition scheduler Anki uses) with its default
// weights, plus a "three good days" ladder from the research on successive relearning: a passage
// counts as memorized after it is recalled correctly on three separate days, with short gaps between.
(function () {
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461,
    2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const DECAY = -0.5, FACTOR = 19 / 81;
  const LADDER = [1, 3, 7]; // longest gap (days) before each of the three good days
  const MAX_DAYS = 365;

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const retrievability = (t, s) => Math.pow(1 + FACTOR * t / s, DECAY);
  const intervalFor = (s, r) => s / FACTOR * (Math.pow(r, 1 / DECAY) - 1);
  const initS = g => Math.max(W[g - 1], 0.1);
  const initD = g => clamp(W[4] - (g - 3) * W[5], 1, 10);
  const nextD = (d, g) => clamp(W[7] * W[4] + (1 - W[7]) * (d - W[6] * (g - 3)), 1, 10);
  const recallS = (d, s, r, g) => s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
    (Math.exp((1 - r) * W[10]) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1));
  const forgetS = (d, s, r) => Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]));

  // Dates are local "YYYY-MM-DD" strings.
  function today(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function parse(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
  function addDays(iso, n) { const d = parse(iso); d.setDate(d.getDate() + n); return today(d); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }

  // Grade from a recall: 1 = forgot, 2 = hard (small slips or hints), 3 = good, 4 = easy.
  function grade(accuracy, hints) {
    if (accuracy >= 0.97 && hints === 0) return 3;
    if (accuracy >= 0.85 && hints <= 2) return 2;
    return 1;
  }

  // Record a graded recall in a progress record p and set its next due date. Returns p.
  // The first call (when a passage is first finished) starts the ladder but isn't one of the good days.
  function review(p, g, retention, on) {
    on = on || today();
    const first = p.s == null;
    const sameDay = p.last === on;
    if (first) { p.s = initS(g); p.d = initD(g); }
    else {
      const r = retrievability(Math.max(0, daysBetween(p.last || on, on)), p.s);
      p.s = g === 1 ? forgetS(p.d, p.s, r) : recallS(p.d, p.s, r, g);
      p.d = nextD(p.d, g);
    }
    p.reps = (p.reps || 0) + 1;
    let days = Math.max(1, Math.round(intervalFor(p.s, retention || 0.9)));
    if (p.stage !== "memorized") {
      p.stage = "practicing";
      if (!first && !sameDay && g >= 3) p.good = (p.good || 0) + 1;
      if (g === 1) p.good = Math.max(0, (p.good || 0) - 1);
      p.good = p.good || 0;
      if (p.good >= 3) p.stage = "memorized";
      else days = Math.min(days, LADDER[p.good]);
    }
    if (g === 1) { p.lapses = (p.lapses || 0) + 1; p.refresh = true; days = 1; }
    else p.refresh = false;
    p.last = on;
    p.due = addDays(on, Math.min(days, MAX_DAYS));
    p.history = (p.history || []).concat([{ on, g }]).slice(-30);
    return p;
  }

  // How likely the passage is to come back right now (0–1), for "practice anyway" ordering.
  function strength(p, on) {
    if (!p || p.s == null || !p.last) return 0;
    return retrievability(Math.max(0, daysBetween(p.last, on || today())), p.s);
  }

  window.Memory = { review, grade, strength, today, addDays, daysBetween, parse };
})();
