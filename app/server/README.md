# Site Khata — the online ledger

One Cloudflare Worker and one D1 database. Your father's phone never signs in
to anything: the APK carries a device token that can append to his household
and read it back, and nothing else. Reading across households, publishing the
nightly brief and exporting are behind an admin token that is never inside the
app.

The phone is still the store of record. This is the copy that survives the
phone, and the thing you can open from Delhi.

## Deploy (about ten minutes, once)

```bash
cd server
npx wrangler login                         # your account; he never sees this

npx wrangler d1 create site-khata          # copy the database_id it prints
#   → paste it into wrangler.jsonc, replacing PUT-YOUR-DATABASE-ID-HERE

npx wrangler d1 execute site-khata --remote --file schema.sql

# the admin token — generate something long and keep it in your password manager
npx wrangler secret put ADMIN_TOKEN

npx wrangler deploy                        # prints https://site-khata.<you>.workers.dev
```

Then create his household and get the device token:

```bash
curl -s -X POST https://site-khata.<you>.workers.dev/admin/households \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Baba"}'
# → { "household": { "id": "h_…" }, "device_token": "…" }
```

Build the APK with the address baked in. The device token is **not** built in:
the APK is public, so the token is pasted once on his phone at setup (first
screen, or সেটিংস → অনলাইন খাতা), and it survives every update:

```bash
cd ..
VITE_SYNC_ENDPOINT=https://site-khata.<you>.workers.dev npm run release -- "…" "…"
```

Open `https://site-khata.<you>.workers.dev/` in your own browser, paste the
admin token once, and you are looking at his ledger.

## What it costs

Nothing, at this size. The Workers free plan allows 100,000 requests a day and
D1 allows 5 million row reads, 100,000 row writes and 5 GB. A busy day for this
app is around fifty writes. Unlike some free tiers it does not pause when idle.

## Routes

| Route | Who | What |
|---|---|---|
| `POST /rows` | device | Append rows, or `{"ping":true}` to check the settings |
| `GET /pull` | device | The whole household, for restoring a replacement phone |
| `GET /summary` | device or admin | The computed totals — what the nightly run reads |
| `GET /brief.json` | device or admin | The nightly file |
| `PUT /brief?household=` | admin | Publish tonight's brief |
| `GET /export.csv?household=` | admin | Every tab, as one CSV |
| `POST /admin/households` | admin | Create a household, get its device token |
| `POST /wipe` | device + reset code | Erase the household's rows (`dry: true` only checks the code) |
| `GET /` | — | The dashboard; the token is typed into the page |
| `GET /public/inventory` | site | What the shop has, as names and in stock / out — no quantities, prices or ids |
| `POST /enquiries` | site | A question or call-back request from the website |
| `GET /enquiries` | device or admin | What the website sent, newest first, for the phone |

## Linking the website

The website has its **own** token (`SITE_TOKEN`). It is neither the device token
nor the admin token: it can read the public stock list and post an enquiry, and
nothing else. With no `SITE_TOKEN` set those routes are off.

Order matters, because the app and the database must agree on a new column
before the phone starts sending it:

```bash
cd server

# 1. the database first — one new column on items, and the enquiries table
npx wrangler d1 execute site-khata --remote --file migrations/2026-10-site-link.sql

# 2. the website's token, then the Worker
npx wrangler secret put SITE_TOKEN          # long and random; the site gets the same value
npx wrangler secret put SITE_HOUSEHOLD      # his household id (h_…, the one in nightly.json). Works without it while
                                            # there is exactly one household, but set it anyway: the day a second is
                                            # created, the Worker will not guess and the website's stock page goes dark
npx wrangler deploy

# 3. only then release the APK that has the "show on the website" switch
```

Then, in Vercel → the website project → Environment Variables:
`SITE_KHATA_URL` (this Worker's address) and `SITE_KHATA_SITE_TOKEN` (the same
value as `SITE_TOKEN`).

What it will and will not do: the website updates about a minute after the
phone next syncs (it re-reads the list that often), and shows when the phone
last told the server anything. An enquiry reaches the app when the app is open
— there is no push. The website also emails the same enquiry, so a missed one
is never the only copy.

Locally, put `SITE_TOKEN=…` (and `SITE_HOUSEHOLD=…` if the local database has
more than one household) in `.dev.vars`.

## Where the arithmetic lives

`src/summary.js` (and `src/stock.js` for the shelf, which has to be worked out
in JavaScript — see its header). `npm run audit` holds it to the same answers
as the phone's `calc.ts` on one ledger, with hand-worked expected figures. Every
date is a Kolkata date whatever zone the Worker runs in. The money totals are SQL sums over the stored rows;
correction rows carry negative amounts, so they net out without special
handling. Only the stage percentage is computed in JavaScript, because a
reversed progress row has to be *cancelled* rather than added — and that is
clearer in ten lines of JS than in a self-joined query.

The schema is generated from the app's own column definition by
`npm run schema`, so the phone and the database cannot drift apart.

## Three things worth knowing

- **A retried write cannot duplicate a day.** Every row carries its own id and
  the primary key is `(household_id, id)`, so the database itself drops the
  second copy. There is no bookkeeping to get wrong.
- **The APK is public and carries no device key.** Each phone has its key pasted
  at setup. Whoever holds a key can read that one household and append to it,
  nothing more: not another household, not the brief, not history. If a key
  leaks, give the household a new one in D1; the old one stops working.
- **Nothing is deleted by ordinary use.** Corrections arrive as mirrored rows.
  The only route that deletes is `/wipe`, and it needs the `RESET_CODE` secret.

## Testing

`./test.sh` runs thirty-six checks against a local D1 — auth, household
isolation, the retry that must not duplicate, reversals netting to zero, and
every total the dashboard shows. Start `npm run server:dev` first.
