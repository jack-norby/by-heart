// By Heart accounts (Firebase). Turned off until firebase-config.js has a config; see ACCOUNTS.md.
// Firestore: users/{uid} = { state, updated, device, email }. Only the signed-in person can read or write it.
// Sync is "newest copy wins": every save stamps state.updated, and the newer copy replaces the older one.
// The first time a device signs in to an account, its verses and progress are merged with the account's instead.
// Words fetched from the ESV, NIV, NKJV and CSB services never go to the cloud (their licenses): only the
// reference does, and each device fetches the words again. Pasted, typed and public-domain words are synced.
(function () {
  "use strict";
  const app = window.ByHeart, cfg = window.BYHEART_FIREBASE;
  const A = window.Account = { enabled: !!(app && cfg), loaded: false, user: null, status: "" };
  if (!A.enabled) return;

  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const DEVICE = (() => {
    try {
      let d = localStorage.getItem("byheart-device");
      if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("byheart-device", d); }
      return d;
    } catch (e) { return "unknown"; }
  })();
  let auth = null, db = null, ref = null, unsub = null, timer = null;
  const changed = status => { if (status !== undefined) A.status = status; app.accountChanged(A); };

  A.friendly = err => {
    const code = (err && err.code) || "";
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return "That email and password don't match. Try again, or create an account.";
    if (/email-already-in-use/.test(code)) return "There's already an account with that email. Tap Sign in instead.";
    if (/weak-password/.test(code)) return "Use a password with at least 6 characters.";
    if (/invalid-email|missing-email/.test(code)) return "That email doesn't look right.";
    if (/too-many-requests/.test(code)) return "Too many tries. Wait a minute and try again.";
    if (/network-request-failed|unavailable/.test(code)) return "No connection. Check your internet and try again.";
    if (/requires-recent-login/.test(code)) return "For safety, sign out and sign back in, then try that again.";
    if (/permission-denied/.test(code)) return "Your account storage isn't set up right yet (see ACCOUNTS.md).";
    if (/popup-closed-by-user|cancelled-popup-request/.test(code)) return "";
    if (/unauthorized-domain/.test(code)) return "This website isn't on Firebase's authorized domains list yet (see ACCOUNTS.md).";
    return "Something went wrong. Try again.";
  };

  // ---------- what goes to the cloud ----------
  const LICENSED_SOURCES = ["esv", "abible"];
  function forCloud(state) {
    const s = JSON.parse(JSON.stringify(state));
    s.custom = (s.custom || []).map(c => {
      const t = window.Bible && Bible.translation(c.tr);
      if (c.src !== "paste" && t && LICENSED_SOURCES.includes(t.source)) { c.text = ""; delete c.fums; delete c.fetched; }
      return c;
    });
    delete s.account;
    s.welcomed = true; // anyone with an account has been through setup
    return s;
  }
  // The cloud copy has no licensed words, so keep this device's copy of them where the passage is unchanged.
  function keepWords(incoming, local) {
    const mine = {};
    (local.custom || []).forEach(c => { mine[c.id] = c; });
    (incoming.custom || []).forEach(c => {
      const m = mine[c.id];
      if (!c.text && m && m.text && m.tr === c.tr && JSON.stringify(m.r) === JSON.stringify(c.r)) Object.assign(c, { text: m.text, fums: m.fums, fetched: m.fetched });
    });
    return incoming;
  }
  // First sign-in on this device: keep everything from both copies.
  function merge(cloud, local) {
    const out = keepWords(JSON.parse(JSON.stringify(cloud)), local);
    out.custom = out.custom || []; out.progress = out.progress || {}; out.days = out.days || {};
    const ids = new Set(out.custom.map(c => c.id));
    (local.custom || []).forEach(c => { if (!ids.has(c.id)) out.custom.push(c); });
    Object.keys(local.progress || {}).forEach(id => {
      const a = out.progress[id], b = local.progress[id];
      if (!a || (b.reps || 0) > (a.reps || 0) || ((b.reps || 0) === (a.reps || 0) && (b.last || "") > (a.last || ""))) out.progress[id] = b;
    });
    Object.keys(local.days || {}).forEach(d => {
      const a = out.days[d] || {}, b = local.days[d] || {};
      out.days[d] = { s: Math.max(a.s || 0, b.s || 0), r: Math.max(a.r || 0, b.r || 0) };
    });
    out.edits = Object.assign({}, local.edits || {}, out.edits || {});
    if (!(out.plan && out.plan.anchor) && local.plan) out.plan = local.plan;
    out.welcomed = true;
    return out;
  }

  // ---------- syncing ----------
  function push() {
    clearTimeout(timer); timer = null;
    if (!ref) return Promise.resolve();
    const s = app.state();
    changed("Saving…");
    return ref.set({ state: forCloud(s), updated: s.updated || Date.now(), device: DEVICE, email: (A.user && A.user.email) || "" })
      .then(() => changed("Saved to your account."))
      .catch(err => changed((A.friendly(err) || "Couldn't save to your account.") + " Everything is still saved on this phone."));
  }
  A.saved = () => { if (ref) { clearTimeout(timer); timer = setTimeout(push, 1200); } };
  window.addEventListener("online", () => { if (ref && /Couldn't|No connection/.test(A.status)) push(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && timer) push(); });

  function connect(u) {
    A.user = u;
    ref = db.collection("users").doc(u.uid);
    changed("Connecting to your account…");
    ref.get().then(snap => {
      const local = app.state();
      if (!snap.exists) { local.account = u.uid; app.writeLocal(); return push(); } // remember this phone's account
      const d = snap.data();
      if (local.account !== u.uid) { // this device's first time in this account
        app.replace(Object.assign(merge(d.state || {}, local), { account: u.uid, updated: Date.now() }));
        return push();
      }
      if ((d.updated || 0) > (local.updated || 0)) app.replace(Object.assign(keepWords(d.state || {}, local), { account: u.uid, updated: d.updated }));
      else if ((local.updated || 0) > (d.updated || 0)) return push();
      changed("Saved to your account.");
    }).then(() => {
      if (!A.user || A.user.uid !== u.uid) return; // signed out while connecting
      unsub = ref.onSnapshot(snap => {
        if (snap.metadata.hasPendingWrites || !snap.exists) return;
        const d = snap.data(), local = app.state();
        if (d.device === DEVICE || (d.updated || 0) <= (local.updated || 0)) return;
        app.replace(Object.assign(keepWords(d.state || {}, local), { account: u.uid, updated: d.updated }));
        changed("Saved to your account.");
      }, () => {});
    }).catch(err => changed((A.friendly(err) || "Couldn't reach your account.") + " Everything is still saved on this phone."));
  }
  function disconnect() {
    if (unsub) unsub();
    unsub = null; ref = null; A.user = null; clearTimeout(timer); timer = null;
  }

  // ---------- signing in and out ----------
  A.google = () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider).catch(err => {
      if (err && err.code === "auth/popup-blocked") return auth.signInWithRedirect(provider);
      throw err;
    });
  };
  A.signIn = (email, pass) => auth.signInWithEmailAndPassword(email, pass);
  A.signUp = (email, pass) => auth.createUserWithEmailAndPassword(email, pass);
  A.reset = email => auth.sendPasswordResetEmail(email);
  A.signOut = () => (timer ? push() : Promise.resolve()).then(() => { disconnect(); return auth.signOut(); }).then(() => app.signedOut());
  A.deleteAccount = () => {
    const u = auth.currentUser;
    if (!u) return Promise.resolve();
    // The saved copy goes first (only a signed-in person can delete it). If Firebase then wants a
    // fresh sign-in before removing the account itself, put the copy back so nothing is lost.
    if (unsub) { unsub(); unsub = null; }
    clearTimeout(timer); timer = null;
    return (ref ? ref.delete() : Promise.resolve())
      .then(() => u.delete())
      .then(() => { disconnect(); app.signedOut(); })
      .catch(err => { push(); throw err; });
  };

  // ---------- load Firebase, then start ----------
  function load(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SDK + src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function start() {
    const ready = window.firebase && firebase.firestore ? Promise.resolve() :
      load("firebase-app-compat.js").then(() => Promise.all([load("firebase-auth-compat.js"), load("firebase-firestore-compat.js")]));
    ready.then(() => {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      auth = firebase.auth(); db = firebase.firestore();
      A.loaded = true;
      auth.onAuthStateChanged(u => {
        A.authKnown = true; // Firebase has finished restoring (or not finding) a sign-in
        // app.js reads this on the next launch to skip the welcome screen for signed-in people. Only a real
        // sign-out clears it (app.js signedOut): a passing "no user" (slow network, token refresh) doesn't.
        if (u) { try { localStorage.setItem("byheart-signedin", "1"); } catch (e) { /* the welcome just shows */ } }
        if (u && (!A.user || A.user.uid !== u.uid)) { disconnect(); connect(u); }
        else if (!u && A.user) disconnect();
        changed(u ? undefined : "");
      });
      changed();
    }).catch(() => {
      A.status = "Sign-in needs an internet connection. Everything still works on this phone.";
      A.authKnown = true;
      changed();
      window.addEventListener("online", start, { once: true });
    });
  }
  start();
})();
