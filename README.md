# Planz

**Swipe through what's happening in NYC this weekend and get a ranked shortlist.**

The idea came from a friend in New York. When he has a free weekend he checks Time Out, Instagram and a pile of other sites, and ends up overwhelmed by how much there is. Planz pulls it all into one feed tuned to his taste. You tell it when you're free and swipe. It works like Tinder for picking plans, with the browsing and filters of DoorDash.

> **Status: clickable prototype.** It's a static web app with ~50 sample NYC events, so you can try the whole flow now. Real listings come next (see [Roadmap](#roadmap)).

---

## How it works

1. **Quick quiz (about 30 seconds).** Pick your home neighborhood, how far you'll travel (default 60 min), categories, sub-categories (including music genres and artists you love), who you go with (solo, date, friends, singles events), budget, and usual energy level.
2. **Discover, browsed like a delivery app.**
   - Pick a date: this weekend, a specific day, or any date from a calendar.
   - Pick a time of day: morning, afternoon, evening or late night.
   - Filter by who you're going with and by price: Free, $, $$, $$$, $$$$.
   - Tap a category bubble to narrow it, then a sub-category chip ("Concerts → Electronic").
   - Rows to browse: *Picked for you*, *Free stuff*, *Singles events*, *Every week* (recurring), *Worth the trip*, and *All plans*.
3. **30-second swipe.**
   - Swipe right for "going" (it's saved), left to skip, up to star it as a favorite.
   - Most cards match your taste. Every 4th card is a wildcard from outside it, so you still discover new things. Every 6th is a big-trip idea.
   - When the timer ends, Planz **guesses your mood** from your swipes (e.g. *"You're in a social, night-owl mood"*). It shows your **top picks ranked**, plus a few "you might also like" suggestions.
4. **Saved.** Your full saved list has four views: **Ranked**, **By date**, **⭐ Favorites**, and **↻ Weekly**. Weekly events are saved once and stay on your list with their next date.
5. **Go.** Every event links straight to the official source (venue, Time Out, Dice, Ticketmaster, Eventbrite). Planz never sells tickets itself.
6. **Share.** Share one event, your top picks, or your whole list as a link. Friends open it and can tap **Save all**.

Other details:
- **Taste learning.** Every swipe and save adjusts your ranking. It's stored on your device, with no login needed.
- **Big trips.** Train-ride-away ideas like Dia Beacon, apple picking, Storm King, Asbury Park and the Belmont Stakes. They skip your commute limit, because they're worth going farther for.
- **Area covered:** Manhattan, Brooklyn, Queens, plus big trips.
- **No restaurants.** Beli does that well, so Planz links to Beli for "dinner nearby?".
- Light and dark mode. On a phone you can use *Add to Home Screen* so it opens like an app.

## Run it

It's plain HTML, CSS and JS: no build step, no backend, no dependencies.

```bash
python3 -m http.server 3000
# open http://localhost:3000
```

## Ship it on Replit

1. On [replit.com](https://replit.com), go to **Create Repl → Import from GitHub** and pick this repo.
2. Hit **Run**. The included `.replit` serves the folder on port 3000, and the preview shows the app.
3. To get a public URL, click **Deploy → Static**. Public directory: `.` (already set in `.replit`).
4. Send your friend the `*.replit.app` link. On iPhone: Share → *Add to Home Screen*.

If Replit asks for a run command, use `python3 -m http.server 3000`.

## Files

| File | What it is |
| --- | --- |
| `index.html` | App shell |
| `styles.css` | All styling (light and dark) |
| `app.js` | Quiz, filters, ranking, swipe sprint, mood read, saved list, sharing |
| `events.js` | Categories and **sample** events. Swap this for real data later |
| `manifest.json`, `icon.svg` | Home-screen install |
| `.replit` | Replit run and static deploy config |

### Adding or editing events

Each event in `events.js` looks like this:

```js
{ id: "e1", title: "Glass Harbor", tagline: "...", cat: "music", sub: "Indie & Rock",
  venue: "Bowery Ballroom", hood: "Lower East Side", boro: "Manhattan",
  price: 2, priceText: "$32", time: "20:00",
  days: [4],          // one-off: days from today
  // weekly: [6, 0],  // recurring: 0 = Sun ... 6 = Sat
  // planAhead: "Early June · save the date",  // far-off big event
  energy: 2, who: ["solo", "date", "crew"],
  url: "https://...", source: "Dice" }
```

Dates are relative to today, so the demo never goes stale. Real data would use actual dates.

## Roadmap

**Next: real listings, still with no backend to manage**
- A scheduled job (Replit Scheduled Deployment or a GitHub Action) runs once a day. It fetches sources and writes a fresh `events.json`. The app reads that file instead of `events.js`.
- Sources, roughly from easiest to hardest:
  - Ticketmaster Discovery API and SeatGeek: concerts, sports, theater.
  - Eventbrite: singles events, workshops, tastings.
  - NYC Parks and NYC Open Data: free outdoor events.
  - Dice and Resident Advisor: electronic and indie shows.
  - Time Out NY pages: the editorial picks your friend already trusts.
- An AI model (Claude) turns messy event pages into clean listings, tags each with category, energy and who it suits, and removes duplicates across sources.

**After that**
- 🎧 Spotify connect, so concerts match bands you actually listen to.
- 📸 Instagram: pull in event posts from accounts you follow.
- 👯 Swipe together: a friend or date swipes the same deck, and you see your matches.
- 🔔 Alerts: "your favorite weekly thing is on this weekend", "a big trip just went on sale".
- 🍽️ Deeper Beli hand-off: send the event's neighborhood straight into Beli.
- 📱 App Store: wrap this same web app with Capacitor once people use it every week.

**Ways to make money (if it takes off):** sponsored "featured" cards (clearly labeled), affiliate or referral cuts on ticket links, and venue and promoter partnerships.

> On selling data: avoid it. It's legally risky (state privacy laws, App Store rules), and it would hurt trust for an app built on knowing your taste. Aggregate, anonymous insights for venues are the safer version.

## Name ideas

The working name is **Planz**. Other options:
- **Down**: "you down?"
- **Outlined**
- **Swipe Out**: a nod to Time Out, though it may be too close to their brand
- **Free Weekend**
- **Gotham Go**
- **Wknd**
