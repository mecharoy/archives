/* What is on the shop's shelves.

   One definition, used by the brief's "stock in the shop" card and by whatever
   else needs to know whether a thing is in stock. It is the same rule as
   calc.ts `shopStock` on the phone, and scripts/audit-check.mjs holds the two
   to the same answer on the same ledger.

   The rule: a physical count replaces whatever the book said up to that day.
   After it, goods bought into the shop (not for a site) add, and sales and
   sendings to a site subtract; goods that came back off a site are a sending
   with the sign flipped, so they add back. A purchase made directly for a site
   never touches the shop. A cancelled row and the row that cancelled it are
   both left out. */

const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Oldest first; two rows on one day in the order they were written. Row order
    out of a database is not time order, so anything that means "the latest"
    sorts instead of trusting it. */
const inOrder = (a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1
    : (a.created_at || '') < (b.created_at || '') ? -1 : (a.created_at || '') > (b.created_at || '') ? 1
      : String(a.id) < String(b.id) ? -1 : 1

/**
 * The shelf: how many of each item the shop holds, and which items the shop has
 * ever handled. Quantities can be zero or negative (more went out than was ever
 * entered as coming in); `handled` says which of those zeros are "sold out"
 * rather than "never stocked".
 * @param rows  stock rows: { id, item_id, project_id, dir, qty, rate, date, created_at, reverses }
 * @returns {{ map: Map<string, {qty: number, rate: number}>, handled: Set<string> }}
 */
export function shopShelf(rows) {
  const reversed = new Set(rows.filter((r) => r.reverses).map((r) => r.reverses))
  const live = rows.filter((r) => !r.reverses && !reversed.has(r.id)).sort(inOrder)

  const map = new Map()
  const anchors = new Map()
  const handled = new Set()
  // Counts in order, so of two counts on one day the later-written stands.
  for (const s of live) {
    if (s.dir === 'count' && !s.project_id) {
      anchors.set(s.item_id, s.date)
      map.set(s.item_id, { qty: n(s.qty), rate: n(s.rate) })
      handled.add(s.item_id)
    }
  }
  for (const s of live) {
    // Goods bought straight for a site never touch the shop.
    if (s.project_id && s.dir !== 'transfer') continue
    const anchor = anchors.get(s.item_id)
    if (anchor && s.date <= anchor) continue
    const cur = map.get(s.item_id) || { qty: 0, rate: 0 }
    if (s.dir === 'in' && !s.project_id) { cur.qty += n(s.qty); cur.rate = n(s.rate) || cur.rate; handled.add(s.item_id) }
    else if (s.dir === 'sale') { cur.qty -= n(s.qty); handled.add(s.item_id) }
    else if (s.dir === 'transfer') { cur.qty -= n(s.qty); handled.add(s.item_id) }
    map.set(s.item_id, cur)
  }
  return { map, handled }
}

/**
 * @param rows   stock rows (see shopShelf)
 * @param items  item rows: { id, last_rate }
 * @returns {{ item_id: string, qty: number, rate: number, value: number }[]}
 *          one per item that has anything on the shelf (or owed off it)
 */
export function shopStockLevels(rows, items) {
  const { map } = shopShelf(rows)
  return items
    .map((it) => {
      const c = map.get(it.id)
      const rate = (c && c.rate) || n(it.last_rate)
      const qty = c ? c.qty : 0
      return { item_id: it.id, qty, rate, value: qty * rate }
    })
    .filter((l) => Math.abs(l.qty) > 1e-9)
}

/** The shelf, in rupees at the last rate paid. Negative means goods left the
    shop that were never entered as bought. */
export function shopStockValue(rows, items) {
  return shopStockLevels(rows, items).reduce((a, l) => a + l.value, 0)
}
