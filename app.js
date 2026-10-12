/* Planz — swipe your way to a NYC weekend.
 * Plain JS, no build step, no backend. Everything a user does is kept in
 * localStorage on their device. */
(function () {
  "use strict";

  const CATS = window.PLANZ_CATEGORIES;
  const EVENTS = window.PLANZ_EVENTS;
  const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const BY_ID = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

  const HOODS = {
    Manhattan: ["East Village", "West Village", "Lower East Side", "Chelsea", "Midtown", "Upper West Side", "Upper East Side", "Harlem", "Financial District", "Hell's Kitchen"],
    Brooklyn: ["Williamsburg", "Greenpoint", "Bushwick", "Park Slope", "Prospect Heights", "Fort Greene", "Bed-Stuy", "Crown Heights", "DUMBO", "Cobble Hill"],
    Queens: ["Astoria", "Long Island City", "Sunnyside", "Jackson Heights", "Ridgewood", "Forest Hills", "Flushing"],
  };
  // Rough door-to-door subway minutes between boroughs.
  const BORO_MIN = {
    Manhattan: { Manhattan: 25, Brooklyn: 35, Queens: 35 },
    Brooklyn: { Manhattan: 35, Brooklyn: 25, Queens: 45 },
    Queens: { Manhattan: 35, Brooklyn: 45, Queens: 25 },
  };
  const WHO = [
    { id: "solo", name: "Solo", icon: "🙋" },
    { id: "date", name: "Date night", icon: "💞" },
    { id: "crew", name: "With friends", icon: "👯" },
    { id: "singles", name: "Singles events", icon: "💘" },
  ];
  const TODS = [
    { id: "morning", name: "Morning" },
    { id: "afternoon", name: "Afternoon" },
    { id: "evening", name: "Evening" },
    { id: "late", name: "Late night" },
  ];
  const PRICE = ["Free", "$", "$$", "$$$", "$$$$"];
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const SPRINT_SECONDS = 30;

  // ---------- Storage ----------
  const KEY = "planz.v1";
  const defaults = () => ({
    onboarded: false,
    prefs: { home: "Williamsburg", homeBoro: "Brooklyn", maxCommute: 60, cats: [], subs: [], who: [], artists: "", maxPrice: 3, loveFree: true, energy: 2 },
    taste: { cat: {}, sub: {}, who: {}, energy: {} },
    saved: {}, // id -> { at, fav }
    passed: {}, // id -> timestamp
  });
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = defaults();
        const s = JSON.parse(raw);
        return { ...d, ...s, prefs: { ...d.prefs, ...s.prefs }, taste: { ...d.taste, ...s.taste } };
      }
    } catch (_) { /* private mode etc. */ }
    return defaults();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* ignore */ }
  }

  // Session-only UI state
  const F = { date: "weekend", tod: null, who: null, cat: null, sub: null, prices: [] };
  let tab = "discover";
  let savedMode = "ranked";
  let sprint = null; // { deck, idx, endAt, likes:[], stars:[], passes:[], timer }
  let quizStep = 0;
  let quizDraft = null;

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

  function fmtTime(t) {
    const [h, m] = t.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    const hh = h % 12 || 12;
    return m ? `${hh}:${String(m).padStart(2, "0")} ${ap}` : `${hh} ${ap}`;
  }
  function fmtDay(d) {
    const diff = Math.round((d - today) / 864e5);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
  }
  function todOf(e) {
    const h = Number(e.time.split(":")[0]);
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    if (h < 21) return "evening";
    return "late";
  }
  const isRecurring = (e) => Array.isArray(e.weekly);
  const isTrip = (e) => e.cat === "trips";
  function recurText(e) {
    if (!isRecurring(e)) return "";
    if (e.weekly.length === 7) return "Every day";
    return "Every " + e.weekly.map((d) => DOW[d]).join(" & ");
  }

  // All dates this event happens in the next 4 weeks.
  function occurrences(e) {
    if (e.planAhead) return [];
    if (isRecurring(e)) {
      const out = [];
      for (let i = 0; i < 28; i++) { const d = addDays(today, i); if (e.weekly.includes(d.getDay())) out.push(d); }
      return out;
    }
    return (e.days || []).map((n) => addDays(today, n));
  }

  // The set of day keys the date filter covers.
  function windowKeys() {
    if (F.date === "any") return new Set(Array.from({ length: 14 }, (_, i) => keyOf(addDays(today, i))));
    if (F.date === "today") return new Set([keyOf(today)]);
    if (F.date === "tomorrow") return new Set([keyOf(addDays(today, 1))]);
    if (F.date === "weekend") {
      const dow = today.getDay();
      const keys = new Set();
      // Fri–Sun of this weekend (or what's left of it).
      const start = dow === 0 ? 0 : dow === 6 ? -1 : 5 - dow;
      for (let i = start; i <= start + 2; i++) if (i >= 0) keys.add(keyOf(addDays(today, i)));
      return keys;
    }
    return new Set([F.date]);
  }
  function nextInWindow(e, keys = windowKeys()) {
    return occurrences(e).find((d) => keys.has(keyOf(d))) || null;
  }
  function whenText(e, keys) {
    if (e.planAhead) return e.planAhead;
    const d = (keys && nextInWindow(e, keys)) || occurrences(e)[0];
    return d ? `${fmtDay(d)} · ${fmtTime(e.time)}` : fmtTime(e.time);
  }

  function travel(e) {
    if (e.travel) return e.travel;
    const p = S.prefs;
    if (e.hood === p.home) return 10;
    const base = (BORO_MIN[p.homeBoro] || BORO_MIN.Brooklyn)[e.boro] ?? 40;
    return Math.max(10, base + (hash(e.hood + p.home) % 13) - 6);
  }
  const travelText = (e) => (isTrip(e) ? `${travel(e)} min · ${e.transit}` : `~${travel(e)} min away`);

  // Does an event pass the current filter bar? Big trips skip the commute
  // limit — they're "worth going farther" by definition.
  function passes(e, { ignoreCat = false, keys = windowKeys() } = {}) {
    if (!e.planAhead && !nextInWindow(e, keys)) return false;
    if (F.tod && !e.planAhead && todOf(e) !== F.tod) return false;
    if (F.who && !e.who.includes(F.who)) return false;
    if (F.prices.length && !F.prices.includes(e.price)) return false;
    if (!ignoreCat && F.cat && e.cat !== F.cat) return false;
    if (!ignoreCat && F.sub && e.sub !== F.sub) return false;
    if (!isTrip(e) && travel(e) > S.prefs.maxCommute) return false;
    return true;
  }

  // ---------- Taste / ranking ----------
  function score(e, extra) {
    const p = S.prefs, t = S.taste;
    let s = 0;
    if (p.cats.includes(e.cat)) s += 3;
    if (p.subs.includes(e.sub)) s += 2;
    if (e.who.some((w) => p.who.includes(w))) s += 1;
    if (F.who && e.who.includes(F.who)) s += 1;
    if (e.price > p.maxPrice) s -= 3;
    if (e.price === 0 && p.loveFree) s += 1.5;
    s -= Math.abs(e.energy - p.energy) * 0.7;
    s += clamp(t.cat[e.cat] || 0) * 0.8 + clamp(t.sub[e.sub] || 0) * 0.8 + clamp(t.energy[e.energy] || 0) * 0.4;
    for (const w of e.who) s += clamp(t.who[w] || 0) * 0.2;
    if (p.artists && p.artists.split(",").some((a) => a.trim() && (e.title + e.tagline).toLowerCase().includes(a.trim().toLowerCase()))) s += 5;
    if (!isTrip(e)) s -= travel(e) / 60;
    if (S.passed[e.id]) s -= 1;
    if (extra) s += extra(e);
    return s + (hash(e.id) % 100) / 1000; // stable tiebreak
  }
  const clamp = (v) => Math.max(-6, Math.min(6, v));
  function learn(e, w) {
    const t = S.taste;
    t.cat[e.cat] = (t.cat[e.cat] || 0) + w;
    t.sub[e.sub] = (t.sub[e.sub] || 0) + w;
    t.energy[e.energy] = (t.energy[e.energy] || 0) + w;
    for (const x of e.who) t.who[x] = (t.who[x] || 0) + w * 0.5;
  }
  const ranked = (list, extra) => list.map((e) => [score(e, extra), e]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);

  // ---------- Saving ----------
  const isSaved = (id) => !!S.saved[id];
  const isFav = (id) => !!(S.saved[id] && S.saved[id].fav);
  function setSaved(id, on) {
    if (on) S.saved[id] = S.saved[id] || { at: Date.now(), fav: false };
    else delete S.saved[id];
    save(); updateBadge();
  }
  function toggleFav(id) {
    const on = !isFav(id);
    S.saved[id] = { ...(S.saved[id] || { at: Date.now() }), fav: on };
    save(); updateBadge();
    toast(on ? "⭐ Starred as a favorite" : "Removed from favorites");
  }
  function updateBadge() {
    const n = Object.keys(S.saved).length;
    const b = $("#savedCount");
    b.textContent = n;
    b.classList.toggle("hidden", !n);
  }

  // ---------- Rendering: pieces ----------
  function artHTML(e, { showTags = true } = {}) {
    const tags = [];
    if (showTags) {
      if (e.price === 0) tags.push(`<span class="tag free">Free</span>`);
      if (isTrip(e)) tags.push(`<span class="tag trip">Worth the trip</span>`);
      if (isRecurring(e)) tags.push(`<span class="tag rec">↻ ${esc(recurText(e))}</span>`);
      if (e.who.includes("singles") && e.cat === "social") tags.push(`<span class="tag">Singles</span>`);
    }
    return `<div class="art cat-${e.cat}">
      <div class="tags">${tags.join("")}</div>
      ${isFav(e.id) ? `<span class="fav" aria-label="Favorite">⭐</span>` : ""}
      <span class="emoji" aria-hidden="true">${CAT[e.cat].icon}</span>
    </div>`;
  }
  function tileHTML(e, keys) {
    return `<button class="tile" data-open="${e.id}">
      ${artHTML(e)}
      <div class="body">
        <h3>${esc(e.title)}</h3>
        <div class="meta">${esc(whenText(e, keys))}</div>
        <div class="meta dim">${esc(e.hood)} · ${isTrip(e) ? travel(e) + " min" : "~" + travel(e) + " min"} · ${esc(e.priceText)}</div>
      </div>
    </button>`;
  }
  function rowHTML(e, { rank, keys, actions = true } = {}) {
    return `<div class="row" data-open="${e.id}" role="button" tabindex="0">
      ${rank ? `<span class="rank">${rank}</span>` : ""}
      ${artHTML(e, { showTags: false })}
      <div class="info">
        <h3>${esc(e.title)}</h3>
        <div class="meta">${esc(isRecurring(e) && keys === null ? recurText(e) + " · " + fmtTime(e.time) : whenText(e, keys))}</div>
        <div class="meta dim">${esc(e.venue)} · ${esc(e.priceText)}${e.price === 0 ? "" : " · " + PRICE[e.price]}</div>
      </div>
      ${actions ? `<div class="acts">
        <button class="icon-btn ${isFav(e.id) ? "on" : ""}" data-fav="${e.id}" aria-label="Star">${isFav(e.id) ? "⭐" : "☆"}</button>
        <button class="icon-btn ${isSaved(e.id) ? "on" : ""}" data-save="${e.id}" aria-label="Save">${isSaved(e.id) ? "❤️" : "🤍"}</button>
      </div>` : ""}
    </div>`;
  }
  function section(title, sub, inner) {
    return `<section class="section"><div class="section-h"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ""}</div>${inner}</section>`;
  }

  // ---------- Filter bar ----------
  function renderFilters() {
    const el = $("#filters");
    if (tab === "saved" || tab === "profile" || (tab === "swipe" && sprint && !sprint.done)) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    const dates = [];
    dates.push(`<button class="chip brand ${F.date === "weekend" ? "on" : ""}" data-date="weekend">This weekend</button>`);
    for (let i = 0; i < 10; i++) {
      const d = addDays(today, i), k = keyOf(d);
      const label = i === 0 ? "Today" : i === 1 ? "Tmrw" : DOW[d.getDay()];
      const val = i === 0 ? "today" : i === 1 ? "tomorrow" : k;
      dates.push(`<button class="chip date-chip ${F.date === val ? "on" : ""}" data-date="${val}"><span>${label}</span><b>${d.getDate()}</b></button>`);
    }
    const custom = /^\d{4}-/.test(F.date) && !Array.from({ length: 10 }, (_, i) => keyOf(addDays(today, i))).includes(F.date);
    dates.push(`<label class="chip cal-chip ${custom ? "on" : ""}">📅 ${custom ? fmtDay(fromKey(F.date)) : "Pick date"}<input type="date" id="datePick" min="${keyOf(today)}" max="${keyOf(addDays(today, 27))}" aria-label="Pick a date"></label>`);
    dates.push(`<button class="chip ${F.date === "any" ? "on" : ""}" data-date="any">Next 2 weeks</button>`);

    const opts = [];
    for (const t of TODS) opts.push(`<button class="chip ${F.tod === t.id ? "on" : ""}" data-tod="${t.id}">${t.name}</button>`);
    for (const w of WHO) opts.push(`<button class="chip ${F.who === w.id ? "on" : ""}" data-who="${w.id}">${w.icon} ${w.name}</button>`);
    PRICE.forEach((p, i) => opts.push(`<button class="chip ${F.prices.includes(i) ? "on" : ""}" data-price="${i}">${p}</button>`));

    const cats = CATS.map((c) => `<button class="cat ${F.cat === c.id ? "on" : ""}" data-cat="${c.id}"><span class="ic">${c.icon}</span>${c.name}</button>`);
    let subs = "";
    if (F.cat) subs = `<div class="scroller">${CAT[F.cat].subs.map((s) => `<button class="chip ${F.sub === s ? "on" : ""}" data-sub="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;

    el.innerHTML = `<div class="scroller">${dates.join("")}</div>
      <div class="scroller">${opts.join("")}</div>
      <div class="scroller cats">${cats.join("")}</div>${subs}`;
    const dp = $("#datePick");
    dp.addEventListener("click", () => { try { dp.showPicker(); } catch (_) { /* older browsers open on focus */ } });
    dp.addEventListener("change", () => { if (dp.value) { F.date = dp.value; rerender(); } });
  }

  // ---------- Views ----------
  function renderDiscover() {
    const keys = windowKeys();
    const pool = EVENTS.filter((e) => passes(e, { keys }));
    const local = ranked(pool.filter((e) => !isTrip(e)));
    const trips = ranked(EVENTS.filter((e) => isTrip(e) && passes(e, { keys, ignoreCat: true }) && (!F.cat || F.cat === "trips")));
    const label = F.date === "weekend" ? "this weekend" : F.date === "any" ? "in the next 2 weeks" : fmtDay(fromKey(F.date === "today" ? keyOf(today) : F.date === "tomorrow" ? keyOf(addDays(today, 1)) : F.date)).toLowerCase();

    let h = `<div class="hero">
      <span class="deco">🔥</span>
      <h1>Too many options? Swipe for 30 seconds.</h1>
      <p>We'll read your mood and hand you a ranked shortlist for ${esc(label)}.</p>
      <button class="go" data-go="swipe">Start swiping →</button>
    </div>`;

    if (!local.length && !trips.length) {
      return h + `<div class="empty"><div class="big">🫥</div>Nothing matches those filters.<br>Try another day, a longer commute, or fewer filters.</div>`;
    }
    const tiles = (list) => `<div class="hrow">${list.map((e) => tileHTML(e, keys)).join("")}</div>`;
    if (local.length) h += section("Picked for you", label, tiles(local.slice(0, 10)));
    const free = local.filter((e) => e.price === 0);
    if (free.length && !F.prices.length) h += section("Free stuff", `${free.length} plans`, tiles(free));
    const singles = local.filter((e) => e.who.includes("singles") && e.cat === "social");
    if (singles.length && (S.prefs.who.includes("singles") || F.who === "singles") && F.cat !== "social") h += section("💘 Singles events", "", tiles(singles));
    const rec = local.filter(isRecurring);
    if (rec.length) h += section("↻ Every week", "save once, never miss it", tiles(rec));
    if (trips.length) h += section("🚆 Worth the trip", "a train ride away", tiles(trips));
    if (local.length) h += section(`All plans`, `${local.length}`, `<div class="list">${local.map((e) => rowHTML(e, { keys })).join("")}</div>`);
    h += `<p class="note">Demo listings for the prototype. Tapping “Go” opens the official site for that venue or ticket seller.</p>`;
    return h;
  }

  // ----- Swipe sprint -----
  function buildDeck() {
    const keys = windowKeys();
    const pool = EVENTS.filter((e) => !isSaved(e.id) && passes(e, { keys }));
    const locals = ranked(pool.filter((e) => !isTrip(e)));
    const trips = F.cat && F.cat !== "trips" ? [] : ranked(EVENTS.filter((e) => isTrip(e) && !isSaved(e.id) && passes(e, { keys, ignoreCat: true })));
    if (F.cat === "trips") return trips.slice(0, 30);
    // Mostly your taste, but every 4th card is a wildcard from outside it so
    // you still discover new things; every 6th is a big-trip idea.
    const top = locals.slice(0, Math.ceil(locals.length / 2));
    const rest = locals.slice(top.length);
    const deck = [];
    const seed = Date.now();
    let ti = 0;
    while ((top.length || rest.length || ti < trips.length) && deck.length < 30) {
      const n = deck.length + 1;
      if (n % 6 === 0 && ti < trips.length) deck.push(trips[ti++]);
      else if (n % 4 === 0 && rest.length) deck.push(rest.splice((seed + n) % rest.length, 1)[0]);
      else if (top.length) deck.push(top.shift());
      else if (rest.length) deck.push(rest.shift());
      else if (ti < trips.length) deck.push(trips[ti++]);
      else break;
    }
    return deck;
  }

  function startSprint() {
    const deck = buildDeck();
    if (!deck.length) { toast("Nothing left to swipe for those filters — try another day"); return; }
    sprint = { deck, idx: 0, endAt: Date.now() + SPRINT_SECONDS * 1000, likes: [], stars: [], passes: [], done: false };
    sprint.timer = setInterval(tick, 250);
    renderFilters();
    render();
  }
  function stopSprint() {
    if (sprint && sprint.timer) clearInterval(sprint.timer);
  }
  function tick() {
    if (!sprint || sprint.done) return;
    const left = Math.max(0, sprint.endAt - Date.now());
    const bar = $("#timerBar"), num = $("#timerNum");
    if (bar) bar.style.width = (left / (SPRINT_SECONDS * 1000)) * 100 + "%";
    if (num) num.textContent = Math.ceil(left / 1000) + "s";
    if (left <= 0) finishSprint();
  }
  function finishSprint() {
    stopSprint();
    sprint.done = true;
    renderFilters();
    render();
  }

  function cardHTML(e, keys) {
    const facts = [
      `📅 ${whenText(e, keys)}`,
      `📍 ${e.hood}`,
      `🚇 ${isTrip(e) ? travel(e) + " min" : "~" + travel(e) + " min"}`,
      `💵 ${e.priceText}`,
      ...(isRecurring(e) ? [`↻ ${recurText(e)}`] : []),
    ];
    return `<div class="card" data-card="${e.id}">
      ${artHTML(e)}
      <span class="stamp like">GOING</span><span class="stamp nope">NOPE</span><span class="stamp star">FAVE</span>
      <div class="body">
        <div class="meta dim">${esc(CAT[e.cat].name)} · ${esc(e.sub)} · via ${esc(e.source)}</div>
        <h2>${esc(e.title)}</h2>
        <p class="tagline">${esc(e.tagline)} — <b>${esc(e.venue)}</b></p>
        <div class="facts">${facts.map((f) => `<span class="fact">${esc(f)}</span>`).join("")}</div>
      </div>
    </div>`;
  }

  function renderSwipe() {
    if (!sprint) {
      const n = buildDeck().length;
      return `<div class="start-card">
        <div class="big">⏱️</div>
        <h1>30-second swipe</h1>
        <p>Swipe right on anything you'd actually go to, left to skip, up to star it as a favorite. When time's up we'll guess your mood and rank your top picks.</p>
        <button class="btn" data-action="start" ${n ? "" : "disabled"}>Start · ${n} plans ready</button>
        <p class="swipe-hint" style="margin-top:14px">Uses the day, time & category filters above. Big-trip ideas get shuffled in.</p>
      </div>`;
    }
    if (sprint.done) return renderResults();
    const keys = windowKeys();
    const cards = sprint.deck.slice(sprint.idx, sprint.idx + 3).reverse().map((e) => cardHTML(e, keys)).join("");
    const left = Math.max(0, sprint.endAt - Date.now());
    return `<div class="swipe-wrap">
      <div class="timer"><div class="bar"><i id="timerBar" style="width:${(left / (SPRINT_SECONDS * 1000)) * 100}%"></i></div><b id="timerNum">${Math.ceil(left / 1000)}s</b></div>
      <div class="deck" id="deck">${cards}</div>
      <div class="swipe-btns">
        <button data-swipe="left" aria-label="Skip">✖️</button>
        <button data-swipe="up" class="s-star" aria-label="Favorite">⭐</button>
        <button data-swipe="right" aria-label="Interested">💚</button>
      </div>
      <div class="swipe-hint">← skip · ↑ favorite · → going &nbsp;·&nbsp; <a href="#" data-action="finish">I'm done</a></div>
    </div>`;
  }

  const MOOD_CAT = { music: "live-music", comedy: "laugh-it-off", arts: "artsy", food: "snacky", night: "night-owl", outdoors: "fresh-air", sports: "game-day", social: "meet-new-people", shopping: "treasure-hunting", trips: "get-out-of-town" };
  function mood(likes) {
    if (!likes.length) return null;
    const avg = likes.reduce((a, e) => a + e.energy, 0) / likes.length;
    const energy = avg < 1.6 ? "low-key" : avg < 2.4 ? "social" : "go-big";
    const counts = {};
    for (const e of likes) counts[e.cat] = (counts[e.cat] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const cheap = likes.filter((e) => e.price <= 1).length / likes.length > 0.6;
    const who = {};
    for (const e of likes) for (const w of e.who) who[w] = (who[w] || 0) + 1;
    const topWho = Object.entries(who).sort((a, b) => b[1] - a[1])[0][0];
    const whoLine = { solo: "Good solo energy.", date: "Feels like date-night material.", crew: "Rally the group chat.", singles: "You might meet someone." }[topWho];
    return { title: `You're in a ${energy}, ${MOOD_CAT[top]} mood`, line: `${cheap ? "Keeping it cheap. " : ""}${whoLine}` };
  }

  function renderResults() {
    const keys = windowKeys();
    const liked = [...sprint.stars, ...sprint.likes];
    const swiped = new Set([...liked, ...sprint.passes].map((e) => e.id));
    // Weight this session's swipes heavily so the ranking reflects *today's* mood.
    const sess = { cat: {}, sub: {}, energy: {} };
    const bump = (e, w) => { sess.cat[e.cat] = (sess.cat[e.cat] || 0) + w; sess.sub[e.sub] = (sess.sub[e.sub] || 0) + w; sess.energy[e.energy] = (sess.energy[e.energy] || 0) + w; };
    sprint.likes.forEach((e) => bump(e, 1));
    sprint.stars.forEach((e) => bump(e, 2));
    sprint.passes.forEach((e) => bump(e, -0.5));
    const extra = (e) => (sess.cat[e.cat] || 0) * 1.2 + (sess.sub[e.sub] || 0) + (sess.energy[e.energy] || 0) * 0.6 + (sprint.stars.includes(e) ? 3 : 0);
    const top = ranked(liked, extra);
    const more = ranked(EVENTS.filter((e) => !swiped.has(e.id) && !isSaved(e.id) && passes(e, { keys, ignoreCat: true })), extra).slice(0, 3);
    const m = mood(liked);

    let h = m
      ? `<div class="mood"><div class="k">Your mood read · ${liked.length} like${liked.length > 1 ? "s" : ""}</div><h1>${esc(m.title)}</h1><p>${esc(m.line)} Top picks are ranked below and saved to your list.</p></div>`
      : `<div class="mood"><div class="k">Your mood read</div><h1>Nothing grabbed you</h1><p>Totally fair. Try a different day or time, open up the commute, or pick a category.</p></div>`;
    if (top.length) h += section("Your top picks", "ranked", `<div class="list">${top.map((e, i) => rowHTML(e, { rank: i + 1, keys })).join("")}</div>`);
    if (more.length) h += section("You might also like", "based on those swipes", `<div class="list">${more.map((e) => rowHTML(e, { keys })).join("")}</div>`);
    h += `<div style="display:flex;gap:10px;padding:18px 16px 0">
      <button class="btn ghost block" data-action="again">Swipe again</button>
      ${top.length ? `<button class="btn block" data-action="share-top">Share top picks</button>` : ""}
    </div>`;
    return h;
  }

  function onSwipe(dir) {
    if (!sprint || sprint.done) return;
    const e = sprint.deck[sprint.idx];
    if (!e) return;
    const card = document.querySelector(`[data-card="${e.id}"]`);
    if (dir === "right") { sprint.likes.push(e); setSaved(e.id, true); learn(e, 1); delete S.passed[e.id]; }
    else if (dir === "up") { sprint.stars.push(e); setSaved(e.id, true); S.saved[e.id].fav = true; learn(e, 2); delete S.passed[e.id]; }
    else { sprint.passes.push(e); learn(e, -0.4); S.passed[e.id] = Date.now(); }
    save();
    const advance = () => {
      sprint.idx++;
      if (sprint.idx >= sprint.deck.length) finishSprint();
      else { $("#view").innerHTML = renderSwipe(); bindDeck(); }
    };
    if (card) {
      const x = dir === "right" ? 600 : dir === "left" ? -600 : 0;
      const y = dir === "up" ? -800 : 40;
      card.style.transition = "transform .28s ease-in, opacity .28s";
      card.style.transform = `translate(${x}px, ${y}px) rotate(${x / 20}deg)`;
      card.style.opacity = "0";
      setTimeout(advance, 220);
    } else advance();
  }

  function bindDeck() {
    const deck = $("#deck");
    if (!deck) return;
    const card = deck.lastElementChild;
    if (!card) return;
    let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;
    const like = card.querySelector(".stamp.like"), nope = card.querySelector(".stamp.nope"), star = card.querySelector(".stamp.star");
    card.addEventListener("pointerdown", (ev) => {
      dragging = true; sx = ev.clientX; sy = ev.clientY; dx = dy = 0;
      card.setPointerCapture(ev.pointerId); card.style.transition = "none";
    });
    card.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      dx = ev.clientX - sx; dy = ev.clientY - sy;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      like.style.opacity = Math.max(0, Math.min(1, dx / 100));
      nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
      star.style.opacity = Math.max(0, Math.min(1, -dy / 120 - Math.abs(dx) / 200));
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (dx > 100) onSwipe("right");
      else if (dx < -100) onSwipe("left");
      else if (dy < -120) onSwipe("up");
      else {
        card.style.transition = "transform .2s"; card.style.transform = "";
        like.style.opacity = nope.style.opacity = star.style.opacity = 0;
      }
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  // ----- Saved -----
  function renderSaved() {
    const ids = Object.keys(S.saved).filter((id) => BY_ID[id]);
    if (!ids.length) return `<div class="empty"><div class="big">🤍</div>Nothing saved yet.<br>Swipe right or tap 🤍 on anything that looks fun.<br><br><button class="btn" data-go="swipe">Start swiping</button></div>`;
    const all = ids.map((id) => BY_ID[id]);
    const seg = [["ranked", "Ranked"], ["date", "By date"], ["fav", "⭐ Faves"], ["recurring", "↻ Weekly"]]
      .map(([k, n]) => `<button class="${savedMode === k ? "on" : ""}" data-saved-mode="${k}">${n}</button>`).join("");
    let list, opts = {};
    const anyKeys = new Set(Array.from({ length: 28 }, (_, i) => keyOf(addDays(today, i))));
    if (savedMode === "date") {
      const first = (e) => (e.planAhead ? Infinity : (occurrences(e)[0] || { getTime: () => Infinity }).getTime());
      list = all.slice().sort((a, b) => first(a) - first(b));
      opts.keys = anyKeys;
    } else if (savedMode === "fav") {
      list = ranked(all.filter((e) => isFav(e.id)));
      opts.keys = anyKeys;
    } else if (savedMode === "recurring") {
      list = ranked(all.filter(isRecurring));
      opts.keys = null;
    } else {
      list = ranked(all);
      opts.keys = anyKeys;
    }
    const body = list.length
      ? `<div class="list">${list.map((e, i) => rowHTML(e, { ...opts, rank: savedMode === "ranked" ? i + 1 : 0 })).join("")}</div>`
      : `<div class="empty">${savedMode === "fav" ? "Star something (⭐) to keep it at the top." : "No weekly events saved yet. Look for the ↻ tag."}</div>`;
    return `<div class="section-h" style="margin-top:14px"><h2>Your plans</h2><button class="chip" data-action="share-saved">Share list ↗</button></div>
      <div class="seg">${seg}</div>${body}`;
  }

  // ----- Profile -----
  function renderProfile() {
    const p = S.prefs;
    const likedCats = Object.entries(S.taste.cat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => CAT[k] ? CAT[k].icon + " " + CAT[k].name : k);
    return `<div style="padding:14px 16px">
      <h2 style="margin:0 0 4px">Your taste</h2>
      <p class="meta">Home: <b>${esc(p.home)}, ${esc(p.homeBoro)}</b> · up to ${p.maxCommute} min commute · budget up to ${PRICE[p.maxPrice]}</p>
      <p class="meta">Into: ${p.cats.map((c) => CAT[c] ? CAT[c].icon + " " + CAT[c].name : c).join(", ") || "—"}</p>
      ${likedCats.length ? `<p class="meta">Learned from your swipes: ${likedCats.join(", ")}</p>` : ""}
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <button class="btn dark" data-action="retake">Retake the quiz</button>
        <button class="btn ghost" data-action="loc">Location & commute</button>
      </div>
      <h2 style="margin:26px 0 6px">Dinner before or after?</h2>
      <a class="beli" href="https://beliapp.com" target="_blank" rel="noopener"><span style="font-size:26px">🍽️</span><span><b>Find a spot on Beli</b><small>Planz does events — Beli is the standard for restaurants.</small></span></a>
      <h2 style="margin:26px 0 6px">Coming soon</h2>
      <p class="meta">🎧 Connect Spotify so concerts match bands you actually listen to<br>📸 Connect Instagram to pull in accounts you follow<br>👯 Swipe with friends and match on plans<br>🔔 Alerts when a favorite recurring event is this weekend</p>
      <div style="margin-top:26px"><button class="btn ghost" data-action="reset">Reset everything</button></div>
    </div>`;
  }

  // ---------- Sheets ----------
  function openSheet(html) {
    $("#sheet").innerHTML = `<div class="grab"></div>${html}`;
    $("#sheet").classList.remove("hidden");
    $("#sheetBackdrop").classList.remove("hidden");
    $("#sheet").scrollTop = 0;
  }
  function closeSheet() {
    $("#sheet").classList.add("hidden");
    $("#sheetBackdrop").classList.add("hidden");
  }

  function openEvent(id) {
    const e = BY_ID[id];
    if (!e) return;
    const occ = occurrences(e).slice(0, 4);
    const when = e.planAhead ? e.planAhead : occ.length ? occ.map((d) => fmtDay(d)).join(", ") + ` · ${fmtTime(e.time)}` : fmtTime(e.time);
    openSheet(`<div style="position:relative">
        <button class="close" data-action="close" aria-label="Close">✕</button>
        ${artHTML(e)}
      </div>
      <div class="content">
        <div class="meta dim">${esc(CAT[e.cat].name)} · ${esc(e.sub)}</div>
        <h2>${esc(e.title)}</h2>
        <div class="meta">${esc(e.tagline)}</div>
        <div class="kv">
          <span>📅</span><span>${esc(when)}${isRecurring(e) ? `<br><small class="meta dim">↻ ${esc(recurText(e))} — save it once and it stays on your list</small>` : ""}</span>
          <span>📍</span><span>${esc(e.venue)}, ${esc(e.hood)}</span>
          <span>🚇</span><span>${esc(travelText(e))}${isTrip(e) ? "" : ` from ${esc(S.prefs.home)}`}</span>
          <span>💵</span><span>${esc(e.priceText)}</span>
          <span>👥</span><span>${e.who.map((w) => WHO.find((x) => x.id === w).name).join(" · ")}</span>
          <span>🔗</span><span>${e.source === "Venue" ? "Listed on the venue's site" : "Listed on " + esc(e.source)}</span>
        </div>
        <a class="btn block" href="${esc(e.url)}" target="_blank" rel="noopener">Go — open official site ↗</a>
        <div class="actions">
          <button class="btn ghost" data-save="${e.id}">${isSaved(e.id) ? "❤️ Saved" : "🤍 Save"}</button>
          <button class="btn ghost" data-fav="${e.id}">${isFav(e.id) ? "⭐ Starred" : "☆ Star"}</button>
          <button class="btn ghost" data-action="share-one" data-id="${e.id}">↗ Share</button>
        </div>
        ${isTrip(e) ? "" : `<a class="beli" href="https://beliapp.com" target="_blank" rel="noopener"><span style="font-size:22px">🍽️</span><span><b>Dinner near ${esc(e.hood)}?</b><small>Find a spot on Beli</small></span></a>`}
      </div>`);
  }

  function openLocation() {
    const p = S.prefs;
    const hoods = Object.entries(HOODS).map(([b, hs]) => `<optgroup label="${b}">${hs.map((h) => `<option value="${esc(b + "|" + h)}" ${h === p.home ? "selected" : ""}>${esc(h)}</option>`).join("")}</optgroup>`).join("");
    openSheet(`<div class="content">
      <h2>Where are you starting?</h2>
      <div class="field"><label for="homeSel">Neighborhood</label><select id="homeSel">${hoods}</select></div>
      <div class="field"><label for="commute">Max commute: <span id="commuteVal">${p.maxCommute} min</span></label>
        <input type="range" id="commute" min="15" max="60" step="5" value="${p.maxCommute}">
        <div class="meta dim">Brooklyn, Manhattan & Queens. Big trips (a train ride away) still show up — they're worth it.</div></div>
      <button class="btn block" data-action="save-loc">Done</button>
    </div>`);
    $("#commute").addEventListener("input", (ev) => { $("#commuteVal").textContent = ev.target.value + " min"; });
  }

  function shareIds(ids, title) {
    const url = `${location.origin}${location.pathname}#plan=${ids.join(",")}`;
    const text = `${title}: ` + ids.map((id) => BY_ID[id] && BY_ID[id].title).filter(Boolean).join(", ");
    if (navigator.share) {
      navigator.share({ title: "Planz", text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => toast("Link copied — send it to the group chat"), () => prompt("Copy this link", url));
    } else prompt("Copy this link", url);
  }

  function openShared(ids) {
    const list = ids.map((id) => BY_ID[id]).filter(Boolean);
    if (!list.length) return;
    const anyKeys = new Set(Array.from({ length: 28 }, (_, i) => keyOf(addDays(today, i))));
    openSheet(`<div class="content">
      <div class="meta dim">Shared with you</div>
      <h2>A friend's plan · ${list.length} thing${list.length > 1 ? "s" : ""}</h2>
      <div class="list" style="padding:0;margin:14px 0">${list.map((e) => rowHTML(e, { keys: anyKeys })).join("")}</div>
      <button class="btn block" data-action="save-all" data-ids="${list.map((e) => e.id).join(",")}">Save all to my list</button>
    </div>`);
  }

  // ---------- Quiz ----------
  function startQuiz() {
    quizStep = 0;
    quizDraft = JSON.parse(JSON.stringify(S.prefs));
    $("#main").classList.add("hidden");
    $("#quiz").classList.remove("hidden");
    renderQuiz();
  }
  function renderQuiz() {
    const d = quizDraft;
    const steps = 6;
    const prog = `<div class="quiz-progress">${Array.from({ length: steps }, (_, i) => `<i class="${i <= quizStep ? "on" : ""}"></i>`).join("")}</div>`;
    let body = "", canNext = true, nextLabel = "Next";
    if (quizStep === 0) {
      body = `<div style="font-size:64px">🗽</div><h1>Your NYC weekend, without the 40 open tabs.</h1>
        <p class="lead">Answer a few quick questions, then swipe. Planz pulls from listings like Time Out, venue calendars and ticket sites, and ranks it all to your taste.</p>`;
      nextLabel = "Let's go";
    } else if (quizStep === 1) {
      const boroTabs = Object.keys(HOODS).map((b) => `<button class="chip ${d.homeBoro === b ? "on" : ""}" data-q-boro="${b}">${b}</button>`).join("");
      const hoods = HOODS[d.homeBoro].map((h) => `<button class="chip ${d.home === h ? "on" : ""}" data-q-hood="${esc(h)}">${esc(h)}</button>`).join("");
      body = `<h1>Where's home base?</h1><p class="lead">We'll keep things within your commute. You can change this anytime.</p>
        <div class="field"><div class="row-chips">${boroTabs}</div></div>
        <div class="field"><div class="row-chips">${hoods}</div></div>
        <div class="field"><label for="qCommute">Willing to travel: <span id="qCommuteVal">${d.maxCommute} min</span></label>
        <input type="range" id="qCommute" min="15" max="60" step="5" value="${d.maxCommute}"></div>`;
    } else if (quizStep === 2) {
      body = `<h1>What are you into?</h1><p class="lead">Pick as many as you like. You'll still see other stuff now and then.</p>
        <div class="grid2">${CATS.map((c) => `<button class="opt ${d.cats.includes(c.id) ? "on" : ""}" data-q-cat="${c.id}"><span class="e">${c.icon}</span>${c.name}</button>`).join("")}</div>`;
      canNext = d.cats.length > 0;
    } else if (quizStep === 3) {
      const groups = d.cats.map((id) => `<div class="subgroup"><h3>${CAT[id].icon} ${CAT[id].name}${id === "music" ? " — so we show bands you'd actually see" : ""}</h3>
        <div class="row-chips">${CAT[id].subs.map((s) => `<button class="chip ${d.subs.includes(s) ? "on" : ""}" data-q-sub="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`).join("");
      body = `<h1>Get specific</h1><p class="lead">Optional, but it makes the picks a lot better.</p>${groups}
        ${d.cats.includes("music") ? `<div class="field"><label for="qArtists">Artists you love <small class="meta dim">(comma separated)</small></label><input type="text" id="qArtists" value="${esc(d.artists)}" placeholder="e.g. Rosa Vance, Glass Harbor"></div>` : ""}`;
    } else if (quizStep === 4) {
      body = `<h1>Who are you usually going with?</h1><p class="lead">Pick all that apply — you can switch per weekend.</p>
        <div class="grid2">${WHO.map((w) => `<button class="opt ${d.who.includes(w.id) ? "on" : ""}" data-q-who="${w.id}"><span class="e">${w.icon}</span>${w.name}</button>`).join("")}</div>`;
    } else if (quizStep === 5) {
      body = `<h1>Budget & vibe</h1><p class="lead">Like a price filter on a delivery app — we'll rank around it.</p>
        <div class="field"><label>Usually spend up to</label><div class="row-chips">${PRICE.map((p, i) => `<button class="chip ${d.maxPrice === i ? "on" : ""}" data-q-price="${i}">${p}${["", " <$20", " <$50", " <$120", " any"][i] ? `<small>${["", " <$20", " <$50", " <$120", " any"][i]}</small>` : ""}</button>`).join("")}</div></div>
        <div class="field"><button class="opt ${d.loveFree ? "on" : ""}" data-q-free style="width:100%"><span class="e">🆓</span><span>Bump free stuff to the top<small>Free museum nights, park events, open mics</small></span></button></div>
        <div class="field"><label>Usual energy</label><div class="grid2" style="grid-template-columns:1fr 1fr 1fr">
          ${[["🛋️", "Chill", 1], ["🥂", "Social", 2], ["🪩", "Big night", 3]].map(([e, n, v]) => `<button class="opt ${d.energy === v ? "on" : ""}" data-q-energy="${v}" style="flex-direction:column;text-align:center"><span class="e">${e}</span>${n}</button>`).join("")}
        </div></div>`;
      nextLabel = "See my plans";
    }
    $("#quiz").innerHTML = `${prog}<div class="quiz-body">${body}</div>
      <div class="quiz-foot">
        ${quizStep > 0 ? `<button class="btn ghost" data-q-back>Back</button>` : ""}
        <button class="btn" data-q-next ${canNext ? "" : "disabled"}>${nextLabel}</button>
      </div>`;
    const qc = $("#qCommute");
    if (qc) qc.addEventListener("input", (ev) => { d.maxCommute = Number(ev.target.value); $("#qCommuteVal").textContent = ev.target.value + " min"; });
    const qa = $("#qArtists");
    if (qa) qa.addEventListener("input", (ev) => { d.artists = ev.target.value; });
  }
  function quizClick(t) {
    const d = quizDraft;
    const tog = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
    if (t.dataset.qBoro) { d.homeBoro = t.dataset.qBoro; d.home = HOODS[d.homeBoro][0]; }
    else if (t.dataset.qHood) d.home = t.dataset.qHood;
    else if (t.dataset.qCat) {
      tog(d.cats, t.dataset.qCat);
      d.subs = d.subs.filter((s) => d.cats.some((c) => CAT[c].subs.includes(s)));
    }
    else if (t.dataset.qSub) tog(d.subs, t.dataset.qSub);
    else if (t.dataset.qWho) tog(d.who, t.dataset.qWho);
    else if (t.dataset.qPrice) d.maxPrice = Number(t.dataset.qPrice);
    else if ("qFree" in t.dataset) d.loveFree = !d.loveFree;
    else if (t.dataset.qEnergy) d.energy = Number(t.dataset.qEnergy);
    else if ("qBack" in t.dataset) quizStep = Math.max(0, quizStep - 1);
    else if ("qNext" in t.dataset) {
      if (quizStep === 5) {
        S.prefs = d; S.onboarded = true; save();
        $("#quiz").classList.add("hidden");
        $("#main").classList.remove("hidden");
        tab = "discover"; rerender(); window.scrollTo(0, 0);
        return;
      }
      quizStep++;
    } else return;
    renderQuiz();
  }

  // ---------- Toast ----------
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  // ---------- Main render ----------
  function render() {
    const v = $("#view");
    v.innerHTML = tab === "discover" ? renderDiscover() : tab === "swipe" ? renderSwipe() : tab === "saved" ? renderSaved() : renderProfile();
    if (tab === "swipe") bindDeck();
    document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const p = S.prefs;
    $("#locBtn").textContent = `📍 ${p.home} · ≤${p.maxCommute} min`;
    updateBadge();
  }
  function rerender() { renderFilters(); render(); }
  function setTab(t) {
    if (tab === "swipe" && t !== "swipe" && sprint) { stopSprint(); sprint = null; }
    tab = t; rerender(); window.scrollTo(0, 0);
  }

  // ---------- Events ----------
  document.addEventListener("click", (ev) => {
    const t = ev.target.closest("button, a, [data-open]");
    if (!t) return;
    if (t.closest("#quiz")) { quizClick(t); return; }

    const d = t.dataset;
    if (d.tab) return setTab(d.tab);
    if (d.go) return setTab(d.go);
    if (d.date) { F.date = d.date; return rerender(); }
    if (d.tod) { F.tod = F.tod === d.tod ? null : d.tod; return rerender(); }
    if (d.who) { F.who = F.who === d.who ? null : d.who; return rerender(); }
    if (d.price) { const i = Number(d.price); F.prices = F.prices.includes(i) ? F.prices.filter((x) => x !== i) : [...F.prices, i]; return rerender(); }
    if (d.cat) { F.cat = F.cat === d.cat ? null : d.cat; F.sub = null; return rerender(); }
    if (d.sub) { F.sub = F.sub === d.sub ? null : d.sub; return rerender(); }
    if (d.savedMode) { savedMode = d.savedMode; return render(); }
    if (d.swipe) return onSwipe(d.swipe);
    if (d.save) {
      ev.stopPropagation();
      const on = !isSaved(d.save);
      setSaved(d.save, on);
      if (on) learn(BY_ID[d.save], 0.5);
      save();
      toast(on ? "❤️ Saved to your plans" : "Removed from your plans");
      if (!$("#sheet").classList.contains("hidden") && $("#sheet").querySelector(".kv")) openEvent(d.save);
      return render();
    }
    if (d.fav) {
      ev.stopPropagation();
      toggleFav(d.fav);
      if (!$("#sheet").classList.contains("hidden") && $("#sheet").querySelector(".kv")) openEvent(d.fav);
      return render();
    }
    if (d.open && t.tagName !== "A") return openEvent(d.open);
    switch (d.action) {
      case "start": return startSprint();
      case "finish": ev.preventDefault(); return finishSprint();
      case "again": sprint = null; return rerender();
      case "close": return closeSheet();
      case "loc": return openLocation();
      case "retake": return startQuiz();
      case "share-one": return shareIds([d.id], "Want to go?");
      case "share-saved": return shareIds(Object.keys(S.saved), "My plans");
      case "share-top": return shareIds([...sprint.stars, ...sprint.likes].map((e) => e.id), "My top picks");
      case "save-all":
        d.ids.split(",").forEach((id) => setSaved(id, true));
        closeSheet(); history.replaceState(null, "", location.pathname); toast("Saved to your plans"); return render();
      case "save-loc": {
        const [b, h] = $("#homeSel").value.split("|");
        S.prefs.homeBoro = b; S.prefs.home = h; S.prefs.maxCommute = Number($("#commute").value);
        save(); closeSheet(); return rerender();
      }
      case "reset":
        if (confirm("Clear your saved plans, favorites and taste profile?")) { S = defaults(); save(); startQuiz(); }
        return;
    }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") return closeSheet();
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".row[data-open]")) { ev.preventDefault(); openEvent(ev.target.dataset.open); }
    if (tab === "swipe" && sprint && !sprint.done && $("#sheet").classList.contains("hidden")) {
      if (ev.key === "ArrowRight") onSwipe("right");
      else if (ev.key === "ArrowLeft") onSwipe("left");
      else if (ev.key === "ArrowUp") { ev.preventDefault(); onSwipe("up"); }
    }
  });
  $("#sheetBackdrop").addEventListener("click", closeSheet);
  $("#locBtn").addEventListener("click", openLocation);

  // ---------- Boot ----------
  if (!S.onboarded) startQuiz();
  else { $("#main").classList.remove("hidden"); rerender(); }
  const m = location.hash.match(/^#plan=([\w,]+)/);
  if (m) {
    if (!S.onboarded) { S.onboarded = true; save(); $("#quiz").classList.add("hidden"); $("#main").classList.remove("hidden"); rerender(); }
    openShared(m[1].split(","));
  }
})();
