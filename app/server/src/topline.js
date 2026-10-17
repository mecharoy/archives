/* The dashboard's top line — how long since Baba wrote, and since his phone last sent anything.

   It is the first thing the son reads, from far away: two quiet days must be impossible to miss. The
   function is also written into the dashboard page as text (dashboard.js inserts topLine.toString()),
   so it stays plain: no imports, no regular expressions, no apostrophes.

   `today` is Kolkata's date (YYYY-MM-DD). `last_received_at` is a UTC instant; it is read on Kolkata's
   calendar, so a send at 11 at night is that day's, not the next. */
export function topLine(b, today) {
  var DAY = 86400000
  var kolkataDay = function (iso) { return new Date(Date.parse(iso) + 19800000).toISOString().slice(0, 10) }
  var since = function (day) { return day ? Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / DAY) : null }
  var ago = function (n) { return n === null ? 'nothing yet' : n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago' }
  var wroteDays = since(b.last_entry_date || null)
  var sentDays = since(b.last_received_at ? kolkataDay(b.last_received_at) : null)
  var quiet = (wroteDays !== null && wroteDays >= 2) || (sentDays !== null && sentDays >= 2)
  return {
    wrote: 'Baba last wrote: ' + ago(wroteDays) + (b.last_entry_date ? ' (' + b.last_entry_date + ')' : ''),
    sent: 'His phone last sent: ' + ago(sentDays),
    status: quiet ? 'crit' : wroteDays === null && sentDays === null ? 'info' : 'ok',
  }
}
