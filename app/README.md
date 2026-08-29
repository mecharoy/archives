# Site Khata

A Bengali site-and-shop ledger for one contractor's phone, with an English
switch for anyone else who picks it up. It asks one question per screen, gets
shorter the more he uses it, keeps working with no signal, and never shows a
number it invented.

The build plan this implements is in the artifact; what follows is what was
actually built, how to set it up, and what it does not do.

It records to a Cloudflare Worker with a D1 database behind it — no Google
account, no spreadsheet, and nothing for your father to register for.

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

    phone app  ──appends rows──▶  Worker + D1  ◀── you, in a browser
        ▲                        (totals are SQL)          │
        └──── fetches brief.json ──────┘   publishes tonight's brief

The app collects, suggests and displays. It never calculates anything it
sends. Totals are computed once on the server from the stored rows; judgement
comes from the nightly brief. A bug in the app can lose an entry; it cannot
produce a wrong number.

Your father signs in to nothing. The APK carries a device token baked in at
build time that can append to his household and read it back — and that is all
it can do. Publishing the brief, exporting, and reading across households need
an admin token that is never inside the app.

**It works with none of that connected.** With no endpoint configured it is a
complete offline ledger — the dashboard falls back to the phone's own sums,
labelled `ফোনের নিজের হিসাব` so nobody mistakes them for the server's.

## Setting up the server (about ten minutes, once)

Full walkthrough in [`server/README.md`](server/README.md). In short:

```bash
cd server
npx wrangler login
npx wrangler d1 create site-khata      # paste the id into wrangler.jsonc
npx wrangler d1 execute site-khata --remote --file schema.sql
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

Create his household, then build his APK with the values baked in so he types
nothing at all:

```bash
VITE_SYNC_ENDPOINT=https://site-khata.<you>.workers.dev \
VITE_SYNC_TOKEN=<device token> \
npm run apk
```

Free tier covers this many times over: 100k Worker requests/day and 5M D1 row
reads, 100k writes, 5 GB. A busy day here is about fifty writes.

## Your dashboard

Open the Worker's root URL, paste the admin token once, and it stays signed
in. **The period is a week** — the last seven days, with the seven before them
alongside for comparison. A month was too long to act on: by the time a
monthly figure looks wrong, three weeks of it are already spent.

Four panels answer "where did the week go":

| Panel | What it answers |
|---|---|
| **By head** | What site money went on — cart hire, machine hire, tea, repairs |
| **By shop** | Which supplier the material came from, and what is still unpaid to them |
| **By man** | Who worked, how many days, what he was paid and what he took as an advance |
| **By material** | What was bought, in his own units, and whether the rate he paid moved |

Each row carries its four-week figure underneath, so "high" and "higher than
usual" are visibly different questions. The bars are sized against the biggest
row in the panel — the eye finds the problem before it reads a number.

**His own book** gets its own two panels: household spending by head, with
money taken out of the business reported separately (a transfer, never a
household expense — counting it as one would double it), and the dates he has
written down for himself.

**Job by job** gives each live site its own card: what it cost this week,
wages against material, man-days, what came in, which stage the men are on,
cost per square foot, and how much it has earned that he has not been paid
for. Under that, where that job's money went and what was bought for it —
because "spending is ahead of the work" is only useful with "on what".

The header line says how many days are recorded and how many rows they rest
on. A confident reading off nine rows is worse than no reading, and that line
is how you know which one you are looking at.

## The nightly brief

It runs itself. A scheduled task on the Windows machine wakes at 22:30, reads
his figures off the Worker, works out every number, asks Claude for the
sentences that go around them, checks the answer, and publishes. The brief is
on his phone before he wakes.

It signs in with the Claude Code subscription already on that machine —
`claude -p` is the same login as the terminal — so there is no API key
anywhere in this repository and nothing to top up. The cost of a night is
whatever the subscription already covers.

### Setting it up

One config file, deliberately outside this repository because the repository
is public:

    %USERPROFILE%\.site-khata\nightly.json

    {
      "endpoint": "https://site-khata.<you>.workers.dev",
      "admin_token": "<the admin token>"
    }

`household` and `model` are optional — the household is discovered when the
server has exactly one, and the model defaults to `opus`. Then, once:

    cd app\nightly
    .\install.ps1                 # 22:30 nightly; -At 21:00 for another hour

The task runs as you, needs no administrator rights, and wakes the machine if
it is asleep. A night the machine is fully off is simply skipped — the phone
then falls back to its own arithmetic and says on screen that it is doing so.

    node nightly/run.mjs --dry    # print tonight's brief, publish nothing
    node nightly/run.mjs          # run it now, for real
    .\install.ps1 -Remove         # take it off the schedule

Every run appends a line to `%USERPROFILE%\.site-khata\nightly.log`, and the
brief that was actually sent is kept at `last-brief.json` beside it. When
something looks wrong on his phone in the morning, those two files say what
happened.

### Why it is accurate

The model is never asked to do arithmetic. **Every number in the brief is
computed in `nightly/compute.mjs`** from the summary the server built out of
his own rows — the cards, the percentages, the status colours, the material
burn, and both lines of the S-curve. The model is handed those finished
numbers and asked for one thing: the sentences.

That leaves exactly one way a wrong figure could reach his phone — the model
quoting a number inside a sentence. So `nightly/check.mjs` refuses any prose
containing a figure of a thousand or more that does not appear in the summary,
in Bengali digits or ASCII. Counts and percentages pass; invented rupees do
not. The prompt itself tells the model not to put money in sentences at all:
the amounts are already on the cards directly above the text.

The checker also drops any line written in one language but not the other, any
note attached to a job that does not exist, and to-do lists whose two
languages have drifted out of step. A dropped piece is logged by name and the
rest is published — a brief missing one alert is still a true brief. If the
model is unreachable or its whole answer fails, the run publishes the computed
half under a plain headline chosen by rule. A silent brief is better than a
confident wrong one.

A note from the model may sharpen a job's status but never soften it. The
arithmetic decides whether a job is in trouble.

`npm run nightly:check` exercises all of this against a fabricated ledger, with
no network and no model — including the invented-figure case. It is part of
`npm test`.

### Doing it by hand

The dashboard still has the manual path, unchanged, for a night the machine
was off: open it, press **Copy summary for the model**, paste the lot into
Claude, paste the `brief.json` back, and press **Publish to his phone**.

The app renders exactly these keys and ignores everything else, so adding a
field never breaks it:

```json
{
  "generated_at": "2026-08-28T23:40:00+05:30",
  "headline_bn": "…", "headline_en": "…",
  "cards":    [{ "label_bn": "…", "label_en": "…", "value": "₹48,200", "sub_bn": "…", "sub_en": "…", "status": "ok" }],
  "projects": [{ "name_bn": "…", "name_en": "…", "pct_done": 58, "pct_spent": 71, "status": "warn", "note_bn": "…", "note_en": "…" }],
  "alerts":   [{ "severity": "crit", "text_bn": "…", "text_en": "…" }],
  "series": {
    "scurve": { "days": [0,15,30], "plan": [0,1.7,4.5], "actual": [0,2.1,5.4], "unit": "lakh" },
    "burn":   [{ "item_bn": "রড", "item_en": "Steel", "pct": 92, "status": "crit" }]
  },
  "todo_bn": ["…"], "todo_en": ["…"]
}
```

Only `ok`, `warn`, `crit`, `info` are valid statuses, and the app maps each to
a colour **and** a word. Every field is length-clamped and type-checked on
arrival; a malformed one is dropped, not rendered. Over 36 hours old and the
dashboard says `পুরোনো হিসাব` and falls back to its own arithmetic.

The brief is served from the same origin as the rows, behind the same token,
with `X-Robots-Tag: noindex`. There is no public path holding his cash
position, and no CORS to fight.

---

## What is in the app

**The home screen** is three books on one shelf — **কাজ** (the sites), **মজুত**
(the shop) and **হিসাব** (the money) — with today's entry sitting above all
three, because that is the one thing he does every evening and it must never be
behind a tab. Tonight's headline and the alerts sit above the tabs too;
everything inside a tab is his own arithmetic, so a night without a brief costs
him nothing.

**First run** opens by saying what the app is for and what it will never do,
then asks his name, which language he wants, and whether he runs sites, a shop,
or both — that last answer decides which book he lands in. Only then does it
ask for anything to fill in, and every one of those is skippable. A man with no
contract this month still finishes setup; an invented job name would quietly
poison every per-job total afterwards.

**ভাষা / Language** — সেটিংস → ভাষা flips every word on every screen, and the
numerals with it (১,২৫০ becomes 1,250). The ledger does not move: expense
heads, units and item names are written to disk in Bengali whichever language
the phone is in, and are turned into English only on their way to the screen.
Switch to English, enter a week, switch back, and the rows are identical byte
for byte — there is a test that asserts exactly that. A string with no English
of its own falls back to Bengali rather than to a blank, so adding a screen can
never break the English build. English lives in one file, `src/lib/en.ts`.

**দিতে হবে** — the dates he sets for himself, inside his own book behind the
passcode. Rent on the 5th, a school fee, the electricity bill, money promised
to a person: a name, a who, an amount, a date, and whether it comes round
every month. It shows what is overdue and what is coming, the phone speaks up
on the morning it matters, and pressing **দিয়ে দিয়েছি** writes the expense
into his book for him — so a reminder is never a sticky note that leaves the
month's spending wrong. A monthly one closes and reappears on the same day
next month, pulled back when that month is short. Paid ones are kept, not
deleted; they are his own history.

A bill is a master, not a ledger row, which is the whole reason this works: a
reminder has a life — move the date, correct the amount, mark it paid — and
ledger rows are append-only by design. The money only ever becomes a fact at
the moment he says he paid it.

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

Adding an item also offers **size and type chips** — inches, millimetres,
grades — that land in the name itself, because a shop does not stock "pipe", it
stocks half-inch pipe and one-inch pipe with different rates and different
piles in the corner. Keeping the size in the name is what lets a count of ১"
pipe never be silently mixed with ২".

Suppliers and customers can be pulled **from the phone book** rather than
typed, one person at a time; the parties list has a search box and a
supplier/customer filter once it grows past a screenful.

Adding an item offers a **common goods list** (`src/lib/catalog.ts`) — pipes,
fittings, valves and taps, bathroom, electrical, building material, hardware,
paint, about 170 rows with sizes in inches — searchable in either language and
grouped by category, with his own name and unit always winning if he types one.
It is a lookup, never a suggestion: nothing in it exists in his ledger until he
taps it, and the evening's chips still come only from what he has actually
bought.

**টাকা দেওয়া-নেওয়া** — what he owes and what he is owed, and the screen that
settles both. A due is never edited shut: the unpaid purchase stays exactly as
it was written and a payment is its own row against the same party, oldest bill
first, so the ledger stays append-only and can still answer "what do I owe
Sharma Traders today". A settlement carries its own head and is skipped by
every cost total — the cement was counted the day it arrived, and counting it
again when the bill is paid would double the job's cost. Sales can now be made
on credit the same way, so the money side has two directions rather than one.

The three standing numbers — **হাতে · পাবেন · দেবেন** — sit fixed along the
bottom of the home screen wherever he is. The second and third are buttons.

**টাকার তাগাদা** — the phone says a due out loud on the morning it matters, at
nine, one day before by default. The queue is rebuilt from the ledger on every
change and cancelled wholesale first, so a bill paid tonight cannot nag
tomorrow. Nothing leaves the phone to make that happen.

**নিজের খরচ** — its own four-digit passcode. Money taken from the business
enters as a drawing, so household spending never lands in a project's cost.

**নতুন কাজের হিসাব** — a step-by-step estimate, one question a screen: the area
of a single floor and how many floors (built-up is the product, not a guess);
the kind of foundation, whose separate cost he types because no app can know
what piling costs on his soil; the material, quantity by his own thumb rules
and rate by what he himself last paid, with every rate open to correction on
the spot; then labour, counted either **by the day** — trades, how many men,
how many days, how much a day, which is how he actually pays — or by the square
foot from what his own finished jobs came to. Then the other costs he adds
himself, a contingency, overhead and margin, and a quotation he can send on
WhatsApp. No model anywhere near it. Items he has never bought are named and
excluded rather than guessed at.

**পুরোনো হিসাব** — every day, and corrections. Nothing is ever edited or
deleted: a correction writes the mirror-image row, so the ledger stays
append-only and the history of what he believed at the time survives. The
Worker has no delete route at all.

**Cash** is rebuilt from the last physical count, never from an opening balance
typed once in March, so a bad count fixes itself the next time he counts.

---

## Erasing everything

সেটিংস → **সব মুছে নতুন করে শুরু** wipes the phone and, if asked, the household
on the server with it. It is the only operation in the app that destroys rather
than appends, so it is the only one behind a code. The code is nowhere in the
bundle — the app carries its SHA-256 hash and the Worker holds its own copy as
the `RESET_CODE` secret, so wiping the server needs the code even from a phone
whose token has been pulled out of the APK. The server goes first: if it
refuses, the phone keeps its rows rather than leaving him with nothing
anywhere. The household and its device token survive a wipe, so the phone in
his hand keeps working and simply starts again from empty.

## The failure modes this guards against

| Risk | What stops it |
|---|---|
| A wage typed into Money is counted twice | Wages can only be built by `buildEntries`; the expense head list is fixed and contains nothing that could mean wages |
| A retry after a timeout duplicates a day | Every row carries its own id; the endpoint refuses an id it has seen |
| Entry lost when signal drops | Rows are written to IndexedDB first and to an outbox; the queue drains with exponential backoff when signal returns |
| Half-finished entry lost | The draft is persisted on every keystroke and resumed whatever date it carries |
| Stale brief passed off as today's | 36-hour staleness check, an explicit badge, and a local fallback |
| A malformed nightly file breaks the screen | Whitelisted, clamped and type-checked before anything renders |
| Someone extracts the device token from the APK | It reads and appends to one household only — it cannot publish a brief, export, reach another household, or delete anything |
| Phone lost | Everything already sent is on the server: install the APK on the new phone and tap **অনলাইন থেকে ফিরিয়ে আনুন**. Plus সেটিংস → ব্যাকআপ writes the whole ledger to Documents as CSV or JSON, and `GET /export.csv` does the same from your side |
| Bengali vs ASCII digits | Amounts use a custom keypad, and every text field accepts either |
| A paid-off bill keeps showing as owed | Payments net against the oldest due for that party, and reminders are rebuilt from scratch on every change |
| Paying a bill counted as a second expense | A settlement carries its own head, which every cost total skips while the cash still moves |
| The reset code extracted from the APK | Only its hash ships; the server keeps its own copy and refuses a wipe without it |
| IST date rolling over wrongly | Local `YYYY-MM-DD` everywhere, never `toISOString()` |

---

## What it does not do

- **No dictation.** As the plan says, that puts the whole burden on the
  suggestion engine. Watch how long a routine day takes in week four; over
  ninety seconds means the ranking needs work, not more features.
- **No PDF.** The estimator produces a formatted quotation you can share or
  copy into WhatsApp. Android's WebView has no print pipeline worth shipping,
  and a bad PDF is worse than a good message.
- **The nightly run needs one machine awake.** It is on a scheduled task now,
  signing in with the Claude Code subscription rather than an API key, so a
  night costs nothing extra — but a night that machine is off is a night with
  no brief. Four in a row and he stops opening the app.
- **Photos stay on the phone.** They are captured, shrunk to ~1400px JPEG and
  stored locally against the row. Pushing them to Drive is the obvious next
  step and the row already carries the `photo_id` for it.

---

## Layout

    src/lib/       bn (numerals, money, dates) · i18n + en (the English words)
                   catalog (common goods, sizes) · contacts · remind · reset
                   db · model · calc · suggest · draft · sync · brief
                   restore · backup · photo · pin · seed · store
    src/screens/   Home · DayWizard · Shop · Payments · Personal · Estimator
                   History · Settings · Onboarding
    src/ui/        kit (icons, keypad, sheets) · charts
    server/        the Worker: routes, summary SQL, dashboard, schema, test.sh
    src/lib/       … bills (dates he sets for himself)
    nightly/       run · compute (every number) · check (the guard) · prompt
    scripts/       make-icons · gen-schema · smoke · smoke-sync
                   check-dashboard · nightly-check · server-check

`npm test` drives a real browser through onboarding, a full day's entry,
same-as-yesterday, the shop, a credit sale and its settlement, the estimator
end to end, a correction, the personal book, the English switch, a refused
factory reset and a backup — 35 flows, checking the arithmetic on the way
through (four men for thirty days at ₹600 must come to ₹72,000), asserting that
no English word ever reaches a stored row, and that a refused reset deletes
nothing.

`npm run server:check` is the same idea without jq or bash, so it runs on
Windows: it makes its own household, writes a bill and a part-payment against
it, and asserts the server nets them the way the phone does — the netting rule
lives in two places, `src/lib/calc.ts` and `server/src/summary.js`, and this is
the test that notices when they drift. Start `npm run server:dev` first.

`npm run server:test` runs 36 checks against a local D1: auth, household
isolation, the retry that must not duplicate a day, reversals netting to zero,
and every total the dashboard shows.

`npm run test:sync` is the one that matters most — it runs the real app against
the real Worker, confirms the server computed the same day the phone did, then
wipes the phone and restores it from the server the way a replacement handset
would. Start `npm run server:dev` first for both of those.

---

## Three things still needed from you

1. What he builds most often. The Stages and Coefficients tabs are seeded with
   an ordinary small RCC house — eight stages weighted to 100, and thumb rules
   for cement, steel, brick, sand and chips. These are placeholders until he
   has a contract; his real ones replace them in `src/lib/seed.ts`.
2. Roughly how many distinct items the shop carries. Under about fifty, the
   stock flows can get simpler than they are.
3. Whether one machine being awake at 22:30 is dependable enough. If a week of
   missed nights ever piles up, the same job moves to a Worker cron calling
   the API — a different bill, but nothing to keep switched on.
