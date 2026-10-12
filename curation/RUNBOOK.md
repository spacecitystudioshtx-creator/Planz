# Curation run: instructions for the scheduled Claude task

You are Planz's editor. Each run you produce `data/events.json`: **at most 50 discrete, genuinely cool things to do in NYC over the next 14 days**, ranked, each with a specific "why go" line. Quality beats quantity. Shipping 25 great events is better than 50 with filler.

Read these first: `curation/rubric.md` (how to judge), `curation/sources.md` (where to look), `curation/examples.md` (taste), and any new files in `curation/feedback/`.

## Step 1: Process the friend inbox
For each file in `curation/inbox/` other than `TEMPLATE.md` and `processed/`:
1. For every item on the friend's list, search the web to find **where it was announced or listed**: a newsletter (The Skint, Nonsense NYC…), a listings site (Time Out…), a venue's own calendar, a promoter's or organizer's Instagram account, Resident Advisor, Dice, etc. Record the 1–3 most likely places, with the URL that shows it.
2. Update `curation/sources.md`:
   - If the source exists, add +1 to its Vouches count, append the item to Evidence (`"<item>" via <friend>`), and promote its tier per the rules at the top of the file.
   - If it's new, add it with Tier B (or Tier A if it's a broad curator, like a newsletter or listings site), Vouches: 1, and the evidence.
3. Add each item to `curation/examples.md` under **Loved**, and anything the friend said they'd never go to under **Skipped**.
4. Move the file to `curation/inbox/processed/`.

## Step 2: Process editor feedback
For each file in `curation/feedback/` not yet marked `processed: true` at the top:
- 👍 items go to Loved in `examples.md`, and 👎 items go to Skipped, with the note if one was given.
- If a source produced 3+ 👎 in one batch, note it in that source's Notes field and consider dropping it a tier.
- Add `processed: true` as the first line of the file.

## Step 3: Gather candidates (aim for 100–200)
Window: today through today + 13 days. Go through the sources in tier order: **A, then B, then C, with C only for the gaps the rubric names.**
- Use WebFetch on source pages where it works. Where a host is blocked, use WebSearch with the source's name plus the dates, and work from the search results (`allowed_domains` helps).
- For every candidate record: title, date(s), start time, venue, neighborhood, borough, price, the official URL (venue or ticketing page), and **every source that mentioned it** (for the mentions score).
- Big trips: also look for train-ride-away events (Hudson Valley, Long Island, Jersey Shore, Philadelphia) in the next 14 days, plus 1–3 big "save the date" events coming up in the next 6 months (use `planAhead`).

## Step 4: Clean, score, write
1. Merge duplicates (same event across sources) and combine their mentions.
2. Apply the **hard cuts** from the rubric.
3. Score each remaining event 0–100 using the rubric. Write the `why` line. If you can't write a specific one, cut the event.
4. Keep score ≥ 55, then apply the balance and cap rules. Mark the top 10 `pick: true`.
5. **Check before shipping:** every event's date came from a source you saw this run, and its `url` is a real page you found. Never invent or guess.

## Step 5: Write `data/events.json`
Format (see `data/events.json` for a live example):

```json
{
  "generated": "2026-10-12T14:00:00Z",
  "window": { "start": "2026-10-12", "end": "2026-10-25" },
  "events": [
    {
      "id": "slug-of-title-and-date",
      "title": "Open House New York Weekend",
      "tagline": "Tours inside 200+ normally-closed buildings",
      "why": "The one weekend a year you can walk into these buildings, free.",
      "pick": true,
      "score": 88,
      "cat": "arts", "sub": "Talks",
      "venue": "Citywide", "hood": "Citywide", "boro": "Manhattan",
      "price": 0, "priceText": "Free (some need reservations)",
      "time": "10:00",
      "dates": ["2026-10-16", "2026-10-17", "2026-10-18"],
      "energy": 1, "who": ["solo", "date", "crew"],
      "url": "https://ohny.org",
      "source": "Open House New York",
      "mentions": ["Time Out", "Gothamist"]
    }
  ]
}
```

Field rules:
- `cat` is one of `music comedy arts food night outdoors sports social shopping trips`.
- `sub` must be one of that category's subs in `events.js` (`PLANZ_CATEGORIES`).
- Use `dates` (ISO days), **or** `weekly` (0 = Sun … 6 = Sat) for a standing weekly institution, **or** `planAhead` ("Early June · save the date") for far-out big trips.
- `price` uses this scale: 0 free, 1 under $20, 2 under $50, 3 under $120, 4 above that.
- `energy` uses this scale: 1 chill, 2 social, 3 high energy.
- `who` lists any of `solo date crew singles`.
- Big trips: `cat: "trips"`, `boro: "Trip"`, and also set `travel` (minutes) and `transit` ("Metro-North from Grand Central").

Run `node curation/validate.js`. It must print `OK`. Fix any errors it reports before committing.

## Step 6: Log and ship
1. Update each source's `Last run:` line in `sources.md` (candidates found / made the cut).
2. Append to `curation/log.md`: date, number of candidates → number shipped, top 3 picks, sources added or promoted or demoted, and any blocked hosts.
3. Commit with the message `Curation run YYYY-MM-DD: N events` and push to the branch the app deploys from (the repo's default branch). Replit redeploys from that branch.
