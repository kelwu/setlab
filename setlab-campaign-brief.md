# SetLab — Product & Messaging Brief (for email campaigns)

> **Purpose:** Single source of truth for writing accurate SetLab email campaigns (Loops).
> Keep this current — update the "What's New" section whenever a feature ships.
> Last updated: 2026-09-09.

---

## 1. What SetLab is

**SetLab** (setlab.ai) is an AI co-pilot for DJs that connects the entire DJ workflow — **from building your library to walking into the booth ready to play.**

- **Tagline:** *From library to setlist.*
- **Status:** Public **beta**.
- **One-liner:** Upload your DJ library, and SetLab enriches it, plans your set for the exact gig, and exports it straight back to Serato or Rekordbox.

### The core principle (use this to frame everything)
SetLab is a **co-pilot, not an autopilot.** It does the grunt work — analyzing thousands of tracks, matching keys, pacing energy, flagging what you've already played — so the DJ keeps full creative control of the set. Never message SetLab as "AI replaces the DJ." Always "AI clears the busywork so you can focus on the mix."

---

## 2. Who it's for (ICP)

- Working/gigging DJs (clubs, weddings, corporate, lounge, festivals, open-format).
- Serato **and** Rekordbox users.
- DJs with large libraries who spend hours prepping crates and setlists by hand.
- Both established DJs (want speed) and newer DJs (want guidance on harmonic mixing, energy arcs, transitions).

---

## 3. Feature catalog (with benefit framing)

Lead with the **benefit**, support with the **feature**.

### Library
- **Import & instant search** — Upload a Serato DB or Rekordbox XML; the whole library becomes searchable in seconds.
- **AI enrichment** — Every track auto-tagged with BPM, key, energy score, and genre tags. No manual tagging.
- **Library gap analysis** — See where your collection is thin for the gigs you play.

### SetLab AI Set Builder (the flagship)
- **Build a set for the exact gig** — Set genre, crowd, energy arc, duration, and lineup slot; the AI architects a set from *your* library.
- **Multi-axis pool** *(new)* — Define the set by **genre, era, and/or artist** — or from a **Rekordbox playlist** — not just genre.
- **Opener / Headliner mode** — Tell it your slot; pacing and energy adapt to your spot on the lineup.
- **Harmonic (Camelot) mixing** — Builds harmonically adjacent chains so transitions actually blend.
- **Genre-specific transition rules** — Afrobeats→House follows different BPM rules than Hip-Hop→R&B. The AI knows.
- **Genre-aware pacing** *(new)* — Set length now paces by genre (~3 min/track for house, faster for open-format, longer for lounge) instead of a flat estimate, so track counts match how the genre is actually mixed.
- **Do-Not-Repeat logic** — Tracks used in recent sets are excluded so you don't replay yourself.
- **Seed tracks** — Name must-play tracks; they're guaranteed a spot in the set.
- **Gig Intel agent** — Give a venue name; the AI researches the room, resident DJs, and crowd to shape the set.
- **Wordplay (hip-hop)** — Sequences tracks so a chosen word/phrase bridges songs lyrically.
- **Taste loop** — After a gig, log what you actually swapped/skipped/added; SetLab learns your taste and re-ranks future sets.

### Crate Builder
- **Describe a crate in plain language** — "Friday peak 1am", "wedding cocktail hour", "Disco House warmup" → a curated crate from your library.
- **Precise filters** — Genre, BPM range, year range, exclude artists, clean-only.
- **Pick your size** *(new: fills to it)* — Choose a crate size and SetLab fills it; if exact-genre matches fall short it tops up from the wider genre family and tells you the exact-vs-filled split (no more silently short crates).
- **Genre column** *(new)* — See each track's genre at a glance in the crate list.

### Export & platforms
- **One-click export** — Serato `.crate`, Rekordbox XML, or M3U playlist.
- **Works with your tools** — Serato DJ Pro, Rekordbox (import + export); Beatport, Traxsource, BPM Supreme, DJcity (purchase bridge — tells you where to buy tracks you don't own yet).

### More
- **Track ID** — Identify tracks (from a clip/recording).
- **Explore** — Browse public/shared sets for inspiration.
- **Gigs & reflections** — Log gigs and feed the taste loop.
- **Dashboard** — Library stats and trending charts.
- **Wishlist** — Track tunes you want and where to buy them.
- **DJ invoicing** — Generate and send gig invoices.
- **Shareable set pages** — Public links to show off a set.

---

## 4. Pricing

| | **Free** | **Pro — $12/mo** |
|---|---|---|
| AI set & crate generation | Unlimited* | Unlimited |
| Exports (Serato / Rekordbox / M3U) | 3 / month | Unlimited |
| Track IDs | 10 / month | 500 / month |
| Library upload + BPM/key enrichment | ✓ | ✓ |

- No credit card required for Free. Cancel Pro anytime.
- \*Free generation is "unlimited for normal use" with a light daily anti-abuse cap.
- **The paywall is on exports, not generation** — the natural upgrade trigger is "I've built sets I love and want to load more than 3/month into my gear."

---

## 5. What's New (changelog — use for feature-announcement campaigns)

Most recent first. Convert these into "we just shipped…" emails.

- **Corporate-aware sets** — for corporate, wedding, radio, and lounge crowds the builder now steers clear of tracks whose *subject matter* isn't right for the room — not just the explicit versions, but the clean edits of songs that are still about the wrong things. It's a smart steer, not a guarantee, so the set comes with a reminder to give it a final read for your client.
- **3-hour sets** — the set length now goes up to 180 minutes, for the long corporate, wedding, and residency slots.
- **Clean-only sets** — one toggle keeps a set corporate-, wedding-, and radio-safe by leaving explicit versions out of the pool.
- **See why the AI picked every track** — tap "Why ▾" on any track in your set to read the AI's reasoning for including it and its planned transition note. The notes were always there; now they're one tap away on every device, including mobile.
- **Shared set links now show the full picture** — purchase links and AI review notes now appear on shared/public set pages, not just in your own view. Everyone you share with sees the same detail you do.
- **Step-by-step visual guides** — new help walkthroughs for importing your library, planning a set, and building a crate, at setlab.ai/help. The help chat links you straight to them.
- **Ask SetLab, in your language** — the in-app help chat now remembers the conversation (follow-ups like "show me" work) and answers in whatever language you write in.
- **Set vs Crate, made clear** — plan an *ordered set* for a specific gig, or build a *reusable crate* of tracks by vibe. The two now have distinct names, framing, and side-by-side entry points on your dashboard.
- **Genre column in the Crate Builder** — see each track's genre in the crate list.
- **Crates fill to your requested size** — ask for 25, get 25 (topped up from the wider genre family, with a transparent split), instead of a silently short crate.
- **Sharper genre matching** — sets and crates stay in-genre; off-genre tracks (a rock or country tune in a house set) no longer slip into the pool, and the library-readiness check reflects your true in-genre depth.
- **Genre-aware set pacing** — set length now reflects how each genre is actually mixed.
- **Multi-axis set pool** — build a set by genre, era, and/or artist, not just genre.
- **Build a set from a Rekordbox playlist** — point the builder at an existing playlist.
- **Thin artist sets auto-expand** — pick an artist and SetLab widens to similar artists to fill the set.

*(Internal note: several of these are quality/accuracy fixes as much as features — frame the DJ-facing benefit, not the bug.)*

---

## 6. Brand voice

- **DJ-native, confident, no fluff.** Short punchy lines. Talks like it's been in the booth.
- Signature phrases: *"Hit the decks." "Do not repeat." "Your library. Your set." "Your next set starts here."*
- Respect the craft — the DJ is the artist; SetLab is the crew that preps the gear.
- Visual identity: dark UI, **amber** accent (#F5A623), mono + display type. Keep email design clean, high-contrast, minimal.
- Avoid: hype-y "revolutionary AI" language, replacing-the-DJ framing, generic SaaS voice.

---

## 7. Campaign angles & segments (starting points)

**Angles**
- *"Stop prepping crates by hand."* — time saved on library/crate work.
- *"Built for the gig, not a generic playlist."* — crowd/slot/energy-aware sets.
- *"Never replay yourself."* — do-not-repeat + taste loop.
- *"Serato or Rekordbox — one click to the booth."* — export/interop.
- *"It learns your taste."* — reflections → better sets over time.

**Segments**
- **New signups (no library yet):** drive the first import → first set. Activation.
- **Imported but never generated:** nudge to build their first set for a real upcoming gig.
- **Free users near 3-export cap:** upgrade prompt (the natural Pro trigger).
- **Active builders:** feature-announcement drips (What's New section).
- **Lapsed:** "your library's still here — here's what's new since you left."

---

## 8. Loops data contract (for Claude cowork)

This is the exact schema the SetLab backend sends to Loops. Build segments and campaigns against **these** names — do **not** invent or rename properties; they already exist on the Loops contact.

**How to read this:** the backend keeps contacts current via two mechanisms. **Properties** describe *who the contact is* (for segmentation) and send nothing on their own. **Events** are *moments* you can trigger campaigns off. Everything is keyed by the contact's **email** (their SetLab account email). All calls are fire-and-forget, so treat them as best-effort signals, not guaranteed-exactly-once.

### Contact properties (segmentation)

| Property | Type | Values | Set when |
|---|---|---|---|
| `subscriptionTier` | string | `'free'` \| `'pro'` | Signup → `free`; Pro upgrade (Stripe) → `pro`; churn/downgrade → `free`. Always current in both directions. |
| `signedUpAt` | string | `YYYY-MM-DD` | Once, at signup. |
| `libraryImported` | boolean | `true` | After the DJ's first successful library import. (Absent/unset = never imported.) |
| `setlistsGenerated` | number | running **all-time** total | After every set generation. Note: all-time, **not** monthly. |

The contact itself is created at signup (`source: 'setlab-signup'`).

### Events (campaign triggers)

| Event | Data fields | Fires when |
|---|---|---|
| `signup` | — | A new user signs up (Google OAuth **or** email). |
| `first_setlist` | `setName` (string) | The user's all-time setlist count reaches **1** (their very first set). |
| `setlist_quota_warning` | `used` (number), `limit` (number, currently `3`) | A **free** user reaches **2 sets in a rolling 30-day window** — i.e. one before the monthly cap of 3. The "1 left, go unlimited" nudge. |

### Segment building blocks (combine the above)

- **Activation — imported but stalled:** `libraryImported = true` AND `setlistsGenerated = 0`.
- **Onboarding — signed up, never imported:** `libraryImported` unset (any tier).
- **Upgrade — engaged free power user:** `subscriptionTier = 'free'` AND `setlistsGenerated ≥ N`.
- **At-the-wall upgrade:** trigger off the `setlist_quota_warning` event (free tier only).
- **Win-back — churned Pro:** `subscriptionTier = 'free'` who previously had `'pro'` (churn now flips this back, so they re-enter free segments automatically).
- **Time-based:** `signedUpAt` for anniversary / age-of-account drips.

*(These are the raw materials; see §7 for the campaign angles to pair them with.)*

---

## 9. Accuracy guardrails (don't overclaim)

- SetLab is in **beta** — fine to say so; conveys "early, improving fast."
- Landing-page stats ("2,400+ tracks analyzed", "98% key accuracy", "<30s set generation") are **existing marketing figures** — reuse them, don't invent new metrics.
- It does **not** stream/host music or mix audio for you — it plans and exports; the DJ mixes.
- Purchase bridge **links to** stores (Beatport/Traxsource/BPM Supreme/DJcity); it doesn't buy tracks for you.
- Pricing is **$12/mo Pro**; Free is genuinely usable (unlimited generation, 3 exports/mo). Don't imply generation is paywalled.
- Always keep the **co-pilot, not autopilot** framing (§1).
