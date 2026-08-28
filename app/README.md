# Site Khata

A Bengali site-and-shop ledger for one contractor's phone. It asks one question
per screen, gets shorter the more he uses it, keeps working with no signal, and
never shows a number it invented.

The build plan this implements is in the artifact; what follows is what was
actually built, how to set it up, and what it does not do.

---

## The APK

    dist-apk/SiteKhata-1.0.apk

Signed, `minSdk 24` (Android 7 and up), 7 MB. Copy it to the phone and open it;
Android will ask once about installing from an unknown source. It needs no
account, no login, and no internet to run.

To rebuild:

    npm install
    npm run apk        # web build → cap sync → gradle assembleRelease

The signing keystore is committed at `android/keystore/sitekhata.jks`
(password `sitekhata`). That is deliberate: the app is sideloaded inside one
family, and losing the key would mean no update could ever install over the
copy already on his phone. It guards the upgrade path, not the data. If this
ever goes to Play, generate a fresh key and keep it out of git.

---

## How it hangs together

    phone app  ──appends rows──▶  Google Sheet  ──reads ~40 cells──▶  nightly run
        ▲                          (formulas do                          │
        └──── fetches brief.json ◀── every total)  ◀── you post the file ─┘

The app collects, suggests and displays. It never calculates anything it
sends. Totals are Sheet formulas; judgement comes from the nightly file. A bug
in the app can lose an entry; it cannot produce a wrong number.

**It works with none of that connected.** With no endpoint and no brief URL it
is a complete offline ledger — the dashboard falls back to the phone's own
sums, labelled `ফোনের নিজের হিসাব` so nobody mistakes them for the Sheet's.

---

## Setting up the Sheet (15 minutes, once)

1. Make a new Google Sheet. **Extensions → Apps Script**, delete the stub, and
   paste all of `sheet/Code.gs`.
2. Run `setUp()`. Accept the permission prompt. It builds all fourteen tabs,
   writes the formulas, and logs a token — copy it.
3. **Deploy → New deployment → Web app**, *Execute as: me*, *Who has access:
   Anyone*. Copy the `/exec` URL.
4. In the app: **সেটিংস → Google Sheet ও রাতের হিসাব**. Paste the URL and the
   token, tap **পরীক্ষা করুন**, save.
5. Optional: run `installNightlyTrigger()` for the nightly CSV backup into
   Drive.
6. Share the Sheet with him **as a viewer**, not an editor. The README tab says
   `শুধু দেখার জন্য` in the first row for the same reason.

"Anyone" on the deployment means anyone with the URL can *reach* the script;
the token is what actually authorises a write, and the URL itself is
unguessable. Google credentials never touch the phone — the app only knows
your script's address.

---

## The nightly brief

Read only `Totals` and `Brief_Input`. Both are already computed and tiny.

```
Read the tabs "Totals" and "Brief_Input" from the Site Khata sheet.
Use those numbers exactly as given. Do not add, average or re-derive
anything — if a figure is not in those two tabs, leave it out.

Write brief.json in the schema below. Bengali for anything my father
reads; keep it short, plain, and specific. No greetings, no summary
sentence at the end. Lead with whatever needs attention today.

Flag, in this order of priority:
  - entries_last_3_days is 0        -> he has stopped entering; say so first
  - cash_variance beyond +/- 2000   -> entries are being missed
  - any project with cpi below 1    -> losing on the work done so far
  - dues_overdue above 0            -> already past a supplier's date
  - a burn item ahead of pct_done   -> waste, theft, or a wrong estimate
Say which of those three you think the material gap is, and why.

Then post the file to https://[his-site]/[private-path]/brief.json
```

The app renders exactly these keys and ignores everything else, so adding a
field never breaks it:

```json
{
  "generated_at": "2026-08-28T23:40:00+05:30",
  "headline_bn": "…",
  "cards":    [{ "label_bn": "…", "value": "₹48,200", "sub_bn": "…", "status": "ok" }],
  "projects": [{ "name_bn": "…", "pct_done": 58, "pct_spent": 71, "status": "warn", "note_bn": "…" }],
  "alerts":   [{ "severity": "crit", "text_bn": "…" }],
  "series": {
    "scurve": { "days": [0,15,30], "plan": [0,1.7,4.5], "actual": [0,2.1,5.4], "unit": "lakh" },
    "burn":   [{ "item_bn": "রড", "pct": 92, "status": "crit" }]
  },
  "todo_bn": ["…"]
}
```

Only `ok`, `warn`, `crit`, `info` are valid statuses, and the app maps each to
a colour **and** a word. Every field is length-clamped and type-checked on
arrival; a malformed one is dropped, not rendered. Over 36 hours old and the
dashboard says `পুরোনো হিসাব` and falls back to its own arithmetic.

**Two things about the URL.** It is his cash position, his dues and his
margins, so: a long unguessable path at minimum, `X-Robots-Tag: noindex`, and
a bearer token (the app sends `Authorization: Bearer …` if you set one under
সেটিংস). And serve it from the same origin as anything else you host, or you
lose an evening to CORS.

---

## What is in the app

**আজকের হিসাব** — the eight-screen wizard. Big type, one decision a screen, a
`৩ / ৭` counter so he can see the end, a back arrow that never loses what he
typed, and a draft in IndexedDB from the first tap — a phone call halfway
through costs nothing, even if he finishes it the next morning.

**কালকের মতোই** — on the home screen when the previous day exists: fills the
men and their wages from the last entry on that site and drops him straight to
review. Two taps. It deliberately does *not* copy materials or one-off
expenses; repeating a purchase he did not make is the one wrong guess that
would cost him money.

**The suggestion engine** (`src/lib/suggest.ts`) is the whole user experience.
Everything is ranked by frequency × recency with a 21-day half-life, so a thing
bought twice last week outranks one bought forty times last year. Three chips
then আরও. Wages, rates and closing cash arrive pre-filled. Screens that have
been answered "nothing" for seven straight days demote themselves behind one
`আরও কিছু আছে?` button at the end. Nothing is ever suggested that he has not
himself entered — the only exception is the first row of chips before he has
any history at all, which falls back to his own master list rather than
showing a lone "আরও…".

Settings shows the measurement the plan asks for: how often he takes a chip
versus opening the full list. Over a third and the ranking is wrong.

**দোকানের মজুত** — goods in (with due date from the supplier's terms), sale,
transfer to a site at cost, and a physical count that becomes the new anchor.
Items are shared with the sites, so a fitting has one identity whether it is
sold over the counter or carried to a job.

**নিজের খরচ** — its own four-digit passcode. Money taken from the business
enters as a drawing, so household spending never lands in a project's cost.

**নতুন কাজের হিসাব** — a plain calculator. Coefficients × area for quantities,
his own last purchase price for rates, his own finished jobs for labour per
square foot, then overhead and margin. No model anywhere near it. Items he has
never bought are named and excluded rather than guessed at.

**পুরোনো হিসাব** — every day, and corrections. Nothing is ever edited or
deleted: a correction writes the mirror-image row, so the Sheet stays
append-only and the history of what he believed at the time survives.

**Cash** is rebuilt from the last physical count, never from an opening balance
typed once in March, so a bad count fixes itself the next time he counts.

---

## The failure modes this guards against

| Risk | What stops it |
|---|---|
| A wage typed into Money is counted twice | Wages can only be built by `buildEntries`; the expense head list is fixed and contains nothing that could mean wages |
| A retry after a timeout duplicates a day | Every row carries its own id; the endpoint refuses an id it has seen |
| Entry lost when signal drops | Rows are written to IndexedDB first and to an outbox; the queue drains with exponential backoff when signal returns |
| Half-finished entry lost | The draft is persisted on every keystroke and resumed whatever date it carries |
| Stale brief passed off as today's | 36-hour staleness check, an explicit badge, and a local fallback |
| A malformed nightly file breaks the screen | Whitelisted, clamped and type-checked before anything renders |
| He edits the Sheet | Share view-only; the README tab's first row says so; every correction goes through the app |
| Phone lost | সেটিংস → ব্যাকআপ writes the whole ledger to Documents as CSV or JSON; `nightlyBackup()` mirrors every tab into Drive |
| Bengali vs ASCII digits | Amounts use a custom keypad, and every text field accepts either |
| IST date rolling over wrongly | Local `YYYY-MM-DD` everywhere, never `toISOString()` |

---

## What it does not do

- **No dictation.** As the plan says, that puts the whole burden on the
  suggestion engine. Watch how long a routine day takes in week four; over
  ninety seconds means the ranking needs work, not more features.
- **No PDF.** The estimator produces a formatted quotation you can share or
  copy into WhatsApp. Android's WebView has no print pipeline worth shipping,
  and a bad PDF is worse than a good message.
- **The nightly run is still a person.** Until it is on a schedule, a missed
  night is a real defect — four in a row and he stops opening the app.
- **Photos stay on the phone.** They are captured, shrunk to ~1400px JPEG and
  stored locally against the row. Pushing them to Drive is the obvious next
  step and the row already carries the `photo_id` for it.

---

## Layout

    src/lib/       bn (numerals, money, dates) · db · model · calc · suggest
                   draft · sync · brief · backup · photo · pin · seed · store
    src/screens/   Home · DayWizard · Shop · Personal · Estimator · History
                   Settings · Onboarding
    src/ui/        kit (icons, keypad, sheets) · charts
    sheet/Code.gs  workbook builder, write endpoint, nightly Drive backup
    scripts/       make-icons · smoke (23-step end-to-end run in Chromium)

`node scripts/smoke.mjs` drives a real browser through onboarding, a full day's
entry, same-as-yesterday, the shop, the estimator, a correction, the personal
book and a backup, and checks the arithmetic on the way through.

---

## Three things still needed from you

1. What he builds most often. The Stages and Coefficients tabs are seeded with
   an ordinary small RCC house — eight stages weighted to 100, and thumb rules
   for cement, steel, brick, sand and chips. Give me his real ones and they go
   in properly.
2. Roughly how many distinct items the shop carries. Under about fifty, the
   stock flows can get simpler than they are.
3. The domain, and whether the brief can be served from a path on it.
