// Validates data/events.json against the format the app expects.
// Usage: node curation/validate.js [path]   -> prints OK or a list of problems.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const file = process.argv[2] || path.join(root, "data", "events.json");

// Pull category definitions from events.js so there's one source of truth.
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "events.js"), "utf8"), sandbox);
const CATS = Object.fromEntries(sandbox.window.PLANZ_CATEGORIES.map((c) => [c.id, c.subs]));
const WHO = ["solo", "date", "crew", "singles"];
const BOROS = ["Manhattan", "Brooklyn", "Queens", "Trip"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const errs = [];
let data;
try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { console.error("Cannot read JSON: " + e.message); process.exit(1); }
if (!Array.isArray(data.events)) errs.push("top-level `events` array missing");
const events = data.events || [];
if (events.length > 50) errs.push(`too many events: ${events.length} (max 50)`);

const ids = new Set();
events.forEach((e, i) => {
  const at = `#${i} ${e.id || e.title || "?"}`;
  const need = ["id", "title", "tagline", "why", "cat", "sub", "venue", "hood", "boro", "price", "priceText", "time", "energy", "who", "url", "source"];
  for (const k of need) if (e[k] === undefined || e[k] === "") errs.push(`${at}: missing ${k}`);
  if (ids.has(e.id)) errs.push(`${at}: duplicate id`);
  ids.add(e.id);
  if (!CATS[e.cat]) errs.push(`${at}: unknown cat "${e.cat}"`);
  else if (!CATS[e.cat].includes(e.sub)) errs.push(`${at}: sub "${e.sub}" not in ${e.cat} (${CATS[e.cat].join(", ")})`);
  if (!BOROS.includes(e.boro)) errs.push(`${at}: boro must be one of ${BOROS.join("/")}`);
  if (![0, 1, 2, 3, 4].includes(e.price)) errs.push(`${at}: price must be 0-4`);
  if (![1, 2, 3].includes(e.energy)) errs.push(`${at}: energy must be 1-3`);
  if (!/^\d{2}:\d{2}$/.test(e.time || "")) errs.push(`${at}: time must be HH:MM`);
  if (!Array.isArray(e.who) || !e.who.length || e.who.some((w) => !WHO.includes(w))) errs.push(`${at}: who must list ${WHO.join("/")}`);
  if (!/^https:\/\//.test(e.url || "")) errs.push(`${at}: url must be https`);
  if (e.why && e.why.length > 110) errs.push(`${at}: why line too long (${e.why.length})`);
  const when = [e.dates, e.weekly, e.planAhead].filter((x) => x !== undefined).length;
  if (when !== 1) errs.push(`${at}: needs exactly one of dates / weekly / planAhead`);
  if (e.dates && (!Array.isArray(e.dates) || !e.dates.length || e.dates.some((d) => !ISO.test(d)))) errs.push(`${at}: dates must be YYYY-MM-DD strings`);
  if (e.weekly && (!Array.isArray(e.weekly) || e.weekly.some((d) => d < 0 || d > 6))) errs.push(`${at}: weekly must be 0-6`);
  if (e.boro === "Trip" && (!e.travel || !e.transit)) errs.push(`${at}: big trips need travel + transit`);
});
const picks = events.filter((e) => e.pick).length;
if (picks > 10) errs.push(`too many picks: ${picks} (max 10)`);

if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
console.log(`OK — ${events.length} events, ${picks} picks`);
