/* What the public website may know about the shop.

   Which goods the shop has, and whether each is in stock or not — and nothing
   else. Not how many (a competitor reading the page would learn his stock and
   his turnover), not what they cost him, not what they sell for, not who
   supplies them, and not any id that means something inside the ledger. The
   function builds the answer from the shelf (stock.js, the same rule as the
   phone's count) and returns only those fields, so nothing extra can leak by
   being added to a row later: a field is public only if it is named here.

   A good is listed when the shop has handled it (bought it in, sold it, sent it
   to a site, or counted it), it is still an active item, and he has not hidden
   it from the website. Zero or less on the shelf is "out of stock". */

import { shopShelf } from './stock.js'
import { CATS, CAT_EN, ITEM_EN } from './catalog-en.js'

const OTHER_BN = 'অন্যান্য'
const OTHER_EN = 'Other'

/**
 * @param stockRows  stock rows (see stock.js shopShelf)
 * @param itemRows   item rows: { id, name_bn, active, web_hidden }
 * @returns {{ name_bn: string, name_en: string, category_bn: string, category_en: string, available: boolean }[]}
 */
export function publicInventory(stockRows, itemRows) {
  const { map, handled } = shopShelf(stockRows)
  const rank = new Map(CATS.map((c, i) => [c, i]))

  const out = []
  for (const it of itemRows) {
    if (!handled.has(it.id)) continue                 // never in the shop
    if (it.active === 0 || it.active === false) continue
    if (it.web_hidden === 1 || it.web_hidden === true) continue
    const name = String(it.name_bn || '').trim()
    if (!name) continue

    const known = ITEM_EN[name]
    const cat = known ? known.cat : OTHER_BN
    const qty = (map.get(it.id) || { qty: 0 }).qty
    out.push({
      name_bn: name,
      name_en: known ? known.en : name,
      category_bn: cat,
      category_en: known ? CAT_EN[cat] || cat : OTHER_EN,
      available: qty > 1e-9,
    })
  }

  // The catalogue's own section order, "other" last, then by name.
  out.sort((a, b) =>
    (rank.has(a.category_bn) ? rank.get(a.category_bn) : 99) - (rank.has(b.category_bn) ? rank.get(b.category_bn) : 99)
    || a.name_bn.localeCompare(b.name_bn, 'bn'))
  return out
}
