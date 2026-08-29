/* The page you open from Delhi.
 *
 * Served from the same origin as the data, so there is no CORS story and no
 * second thing to host. The admin token is typed once and kept in this
 * browser's local storage — it is never in a URL, never in a cookie, and
 * never inside the APK. */

export function dashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Site Khata — ledger</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap">
<style>
  :root {
    --bg:#F4F2ED; --surface:#fff; --sunk:#EAE7E0; --ink:#14181B; --ink-2:#414B51;
    --muted:#79838A; --line:#DFDBD2; --accent:#0E5E4E; --accent-bg:#E4EFEA;
    --ok:#1E7A50; --warn:#96600A; --warn-bg:#FAF0DC; --crit:#A32233; --crit-bg:#FBE9EA;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#0E1214; --surface:#161B1E; --sunk:#1D2427; --ink:#E8EDEE; --ink-2:#B7C1C5;
      --muted:#859299; --line:#262E32; --accent:#57BFA0; --accent-bg:#12302A;
      --ok:#57BFA0; --warn:#DCA854; --warn-bg:#2C2413; --crit:#E8788A; --crit-bg:#331A1E;
      color-scheme: dark;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin:0; background:var(--bg); color:var(--ink);
    font-family:Inter,-apple-system,system-ui,sans-serif; font-size:15px; line-height:1.55;
    -webkit-font-smoothing:antialiased;
  }
  .bn { font-family:'Noto Sans Bengali',Inter,sans-serif; }
  .wrap { max-width:60rem; margin:0 auto; padding:2.5rem 1.25rem 5rem; }
  header { display:flex; align-items:baseline; gap:1rem; flex-wrap:wrap;
           border-bottom:2px solid var(--ink); padding-bottom:1rem; margin-bottom:2rem; }
  h1 { font-size:1.5rem; font-weight:700; letter-spacing:-.02em; margin:0; }
  h2 { font-size:.72rem; font-weight:600; letter-spacing:.1em; text-transform:uppercase;
       color:var(--muted); margin:2.25rem 0 .75rem; }
  .sub { color:var(--muted); font-size:.85rem; }
  .num { font-variant-numeric:tabular-nums; }

  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(11rem,1fr)); gap:.7rem; }
  .stat { background:var(--surface); border:1px solid var(--line); border-radius:6px;
          padding:.85rem .95rem; border-top:3px solid var(--line); }
  .stat.ok{border-top-color:var(--ok)} .stat.warn{border-top-color:var(--warn)}
  .stat.crit{border-top-color:var(--crit)} .stat.info{border-top-color:var(--accent)}
  .stat .k { font-size:.75rem; color:var(--muted); }
  .stat .v { font-size:1.35rem; font-weight:600; letter-spacing:-.02em; }
  .stat .s { font-size:.72rem; color:var(--muted); }

  .card { background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:1rem 1.1rem; }
  .tablewrap { overflow-x:auto; border:1px solid var(--line); border-radius:6px; background:var(--surface); }
  table { border-collapse:collapse; width:100%; min-width:44rem; font-size:.88rem; }
  th { text-align:left; font-size:.68rem; letter-spacing:.08em; text-transform:uppercase; font-weight:600;
       color:var(--muted); padding:.6rem .8rem; background:var(--sunk); border-bottom:1px solid var(--line); white-space:nowrap; }
  td { padding:.6rem .8rem; border-bottom:1px solid var(--line); color:var(--ink-2); vertical-align:middle; }
  tr:last-child td { border-bottom:0; }
  td.r, th.r { text-align:right; font-variant-numeric:tabular-nums; }
  td.name { color:var(--ink); font-weight:600; }

  .pill { display:inline-block; font-size:.7rem; font-weight:600; padding:.15rem .5rem; border-radius:999px;
          background:var(--sunk); color:var(--ink-2); white-space:nowrap; }
  .pill.ok{background:var(--accent-bg);color:var(--accent)}
  .pill.warn{background:var(--warn-bg);color:var(--warn)}
  .pill.crit{background:var(--crit-bg);color:var(--crit)}

  .bar { height:.55rem; background:var(--sunk); border-radius:3px; overflow:hidden; min-width:5rem; position:relative; }
  .bar i { display:block; height:100%; background:var(--accent); }
  .bar i.warn{background:var(--warn)} .bar i.crit{background:var(--crit)}
  .bar u { position:absolute; top:-2px; bottom:-2px; width:2px; background:var(--ink); opacity:.5; }

  /* Two-up on a laptop, one-up on a narrow window. The breakdowns are meant
     to be read side by side — "the week cost this much" next to "and it went
     here" is the whole point of the page. */
  .cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(20rem,1fr)); gap:.7rem; align-items:start; }
  .cols2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(15rem,1fr)); gap:1.1rem; margin-top:.4rem; }
  h3 { font-size:.9rem; font-weight:600; margin:0 0 .6rem; }

  /* One line of a breakdown: name, bar, figure, and a quiet second line under
     it. The bar is sized against the biggest row, so the eye finds the
     problem before it reads a single number. */
  .bdrow { display:grid; grid-template-columns:minmax(6rem,1fr) minmax(3rem,7rem) auto;
           gap:.5rem .7rem; align-items:center; padding:.32rem 0; font-size:.85rem; }
  .bdrow .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bdrow .amt { text-align:right; font-weight:600; }
  .bdrow .sx { grid-column:1 / -1; font-size:.72rem; margin-top:-.25rem; }
  .bdrow + .bdrow { border-top:1px solid var(--line); }
  .lbl { display:block; margin-bottom:.3rem; }

  input, textarea, button { font:inherit; color:inherit; }
  input, textarea {
    background:var(--surface); border:1px solid var(--line); border-radius:6px;
    padding:.6rem .75rem; width:100%; color:var(--ink);
  }
  textarea { min-height:9rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.8rem; resize:vertical; }
  button {
    background:var(--accent); color:var(--bg); border:0; border-radius:6px;
    padding:.6rem 1.1rem; font-weight:600; cursor:pointer;
  }
  button.ghost { background:var(--surface); color:var(--ink); border:1px solid var(--line); }
  button:disabled { opacity:.5; cursor:default; }
  .row { display:flex; gap:.6rem; align-items:center; flex-wrap:wrap; }
  a { color:var(--accent); }
  .msg { font-size:.85rem; color:var(--muted); min-height:1.2em; }
  .msg.bad { color:var(--crit); }
  .gate { max-width:26rem; margin:5rem auto; display:flex; flex-direction:column; gap:.8rem; }
  .hide { display:none; }
  code { font-family:ui-monospace,Menlo,monospace; font-size:.85em; background:var(--sunk); padding:.1em .35em; border-radius:3px; }
</style>
</head>
<body>
<div class="wrap">

  <div id="gate" class="gate">
    <h1>Site Khata</h1>
    <p class="sub">Paste the admin token. It stays in this browser and is never sent anywhere except this server.</p>
    <input id="tok" type="password" placeholder="admin token" autocomplete="off" spellcheck="false">
    <button id="enter">Open the ledger</button>
    <p id="gatemsg" class="msg"></p>
  </div>

  <div id="app" class="hide">
    <header>
      <h1>Site Khata</h1>
      <span class="sub" id="who"></span>
      <span style="flex:1"></span>
      <div class="row">
        <select id="hh" style="padding:.5rem .6rem;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink)"></select>
        <button class="ghost" id="refresh">Refresh</button>
        <button class="ghost" id="signout">Forget token</button>
      </div>
    </header>

    <p class="msg" id="msg"></p>

    <h2>The business <span class="sub" id="period"></span></h2>
    <div class="grid" id="stats"></div>

    <h2>Where the week went</h2>
    <div class="cols">
      <div class="card"><h3>By head</h3><div id="bd-heads"></div></div>
      <div class="card"><h3>By shop</h3><div id="bd-suppliers"></div></div>
      <div class="card"><h3>By man</h3><div id="bd-workers"></div></div>
      <div class="card"><h3>By material</h3><div id="bd-items"></div></div>
    </div>

    <h2>His own book</h2>
    <div class="cols">
      <div class="card"><h3>Household spending</h3><div id="pers"></div></div>
      <div class="card"><h3>Dates he has set</h3><div id="bills"></div></div>
    </div>

    <h2>Projects</h2>
    <div class="tablewrap"><table id="projects">
      <thead><tr>
        <th>Job</th><th class="r">Budget</th><th class="r">Spent</th><th>Progress</th>
        <th class="r">Done</th><th class="r">Spent %</th><th class="r">CPI</th><th class="r">At finish</th><th>Reading</th>
      </tr></thead>
      <tbody></tbody>
    </table></div>

    <h2>Job by job</h2>
    <div id="jobs"></div>

    <h2>Material against estimate</h2>
    <div class="card" id="burn"></div>

    <h2>Tonight's brief</h2>
    <div class="card">
      <p class="sub" id="briefstate">—</p>
      <p class="sub" style="margin-top:.6rem">
        The button copies the summary <em>and</em> the instructions together — paste that into the model, paste its
        <code>brief.json</code> back here, and publish. Each line comes back in both Bengali and English, so his phone
        reads the same brief in whichever language it is set to. The app fetches it from this same server, so there is
        nothing else to host.
      </p>
      <div class="row" style="margin:.8rem 0">
        <button class="ghost" id="copysum">Copy summary for the model</button>
        <a id="csv" class="pill" href="#">Download everything as CSV</a>
      </div>
      <textarea id="briefbox" placeholder='{ "generated_at": "...", "headline_bn": "...", "headline_en": "...", "cards": [] }'></textarea>
      <div class="row" style="margin-top:.7rem">
        <button id="publish">Publish to his phone</button>
        <span class="msg" id="pubmsg"></span>
      </div>
    </div>
  </div>
</div>

<script>
(function () {
  var KEY = 'sitekhata.admin';
  var token = '';
  var households = [];
  var current = '';
  var summary = null;

  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return '\\u20B9' + Math.round(n).toLocaleString('en-IN');
  };
  var pctText = function (n) { return (n === null || n === undefined) ? '—' : Math.round(n) + '%'; };

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = JSON.parse(t); } catch (e) { d = null; }
        if (!r.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
        return d;
      });
    });
  }

  function start(t) {
    token = t;
    return api('/admin/households').then(function (d) {
      households = d.households || [];
      if (!households.length) throw new Error('No household yet — create one first (see the README).');
      localStorage.setItem(KEY, token);
      $('hh').innerHTML = households.map(function (h) {
        return '<option value="' + h.id + '">' + esc(h.name) + '</option>';
      }).join('');
      current = households[0].id;
      $('gate').classList.add('hide');
      $('app').classList.remove('hide');
      return load();
    });
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function load() {
    $('msg').textContent = 'Loading…';
    $('csv').href = '/export.csv?household=' + encodeURIComponent(current);
    return api('/summary?household=' + encodeURIComponent(current)).then(function (d) {
      summary = d;
      render(d);
      $('msg').textContent = 'Read at ' + new Date().toLocaleTimeString();
      return briefState();
    }).catch(function (e) {
      $('msg').textContent = e.message;
      $('msg').className = 'msg bad';
    });
  }

  function briefState() {
    return fetch('/brief.json?household=' + encodeURIComponent(current), {
      headers: { Authorization: 'Bearer ' + token }
    }).then(function (r) {
      if (!r.ok) { $('briefstate').textContent = 'No brief published yet — his app is showing its own arithmetic.'; return; }
      return r.json().then(function (b) {
        var age = (Date.now() - Date.parse(b.generated_at)) / 3600000;
        var when = age < 1 ? 'less than an hour ago' : Math.round(age) + ' h ago';
        $('briefstate').innerHTML = 'Last published ' + when +
          (age > 36 ? ' — <span class="pill crit">his app is calling it stale</span>'
                    : ' — <span class="pill ok">fresh</span>');
      });
    }).catch(function () { $('briefstate').textContent = '—'; });
  }

  function render(d) {
    var b = d.business || {};
    var variance = b.cash_variance;
    var cards = [
      ['Cash in hand', money(b.cash_counted), b.cash_counted_on ? 'counted ' + b.cash_counted_on : 'never counted',
        b.cash_counted === null ? 'info' : 'ok'],
      ['Cash variance', variance === null ? '—' : money(variance), 'counted less book',
        variance === null ? 'info' : Math.abs(variance) > 2000 ? 'crit' : 'ok'],
      ['Owed to suppliers', money(b.dues_total), b.dues_overdue > 0 ? money(b.dues_overdue) + ' overdue' : 'none overdue',
        b.dues_overdue > 0 ? 'crit' : b.dues_this_week > 0 ? 'warn' : 'ok'],
      ['Due this week', money(b.dues_this_week), 'next seven days', b.dues_this_week > 0 ? 'warn' : 'ok'],
      ['Spent this week', money(b.spend_this_week), changeText(b.spend_change_pct, b.spend_prev_week),
        b.spend_change_pct !== null && b.spend_change_pct > 40 ? 'warn' : 'info'],
      ['Wages this week', money(b.wages_this_week), 'material ' + money(b.material_this_week), 'info'],
      ['Received this week', money(b.received_this_week), 'drawings ' + money(b.drawings_this_week), 'info'],
      ['Days entered', String(b.days_entered_this_week) + ' of 7',
        'week before: ' + String(b.days_entered_prev_week) + ' of 7',
        b.days_entered_this_week < 3 ? 'crit' : b.days_entered_this_week < 6 ? 'warn' : 'ok'],
      ['Shop stock', money(b.shop_stock_value), 'at cost', 'info'],
      ['Entries, last 3 days', String(b.entries_last_3_days), b.last_entry_date ? 'last ' + b.last_entry_date : 'nothing yet',
        b.entries_last_3_days === 0 ? 'crit' : 'ok']
    ];
    $('stats').innerHTML = cards.map(function (c) {
      return '<div class="stat ' + c[3] + '"><div class="k">' + c[0] + '</div>' +
             '<div class="v num">' + esc(c[1]) + '</div><div class="s">' + esc(c[2]) + '</div></div>';
    }).join('');

    var rows = (d.projects || []).map(function (p) {
      var cls = p.pct_spent > p.pct_done + 15 ? 'crit' : p.pct_spent > p.pct_done + 6 ? 'warn' : '';
      return '<tr>' +
        '<td class="name bn">' + esc(p.name_bn) + '</td>' +
        '<td class="r">' + money(p.budget) + '</td>' +
        '<td class="r">' + money(p.cost) + '</td>' +
        '<td><div class="bar"><i class="' + cls + '" style="width:' + Math.min(100, p.pct_spent) + '%"></i>' +
          '<u style="left:' + Math.min(100, p.pct_done) + '%"></u></div></td>' +
        '<td class="r">' + pctText(p.pct_done) + '</td>' +
        '<td class="r">' + pctText(p.pct_spent) + '</td>' +
        '<td class="r">' + (p.cpi === null ? '—' : p.cpi.toFixed(2)) + '</td>' +
        '<td class="r">' + money(p.at_finish) + '</td>' +
        '<td><span class="pill ' + (cls || 'ok') + ' bn">' + esc(p.flag_bn) + '</span></td>' +
        '</tr>';
    });
    $('projects').querySelector('tbody').innerHTML = rows.join('') ||
      '<tr><td colspan="9" style="color:var(--muted)">Nothing entered yet.</td></tr>';

    var burns = [];
    (d.projects || []).forEach(function (p) {
      (p.burn || []).forEach(function (x) {
        burns.push('<div class="row" style="margin:.35rem 0">' +
          '<span class="bn" style="min-width:7rem">' + esc(x.item_bn) + '</span>' +
          '<span class="bar" style="flex:1"><i class="' + (x.status === 'ok' ? '' : x.status) +
            '" style="width:' + Math.min(100, x.pct) + '%"></i>' +
            '<u style="left:' + Math.min(100, p.pct_done) + '%"></u></span>' +
          '<span class="num" style="min-width:3.5rem;text-align:right">' + pctText(x.pct) + '</span></div>');
      });
    });
    $('burn').innerHTML = burns.join('') ||
      '<span class="sub">No coefficients set, or no material booked against a job yet.</span>';

    if (d.period) {
      $('period').textContent = d.period.from + ' to ' + d.period.to +
        '  ·  compared with ' + d.period.prev_from + ' to ' + d.period.prev_to;
    }
    renderBreakdowns(d.breakdown || {});
    renderPersonal(d.personal || {}, d.bills || {});
    renderJobs(d.projects || []);
    renderCoverage(d.coverage);
  }

  /* A row of a breakdown: a name, a bar as long as its share of the biggest,
     and the figure. The bar is the point — a table of twelve numbers hides
     which one is the problem, and the eye finds a long bar instantly. */
  function bars(rows, name, value, sub, empty) {
    if (!rows.length) return '<span class="sub">' + empty + '</span>';
    var top = 0;
    rows.forEach(function (r) { if (value(r) > top) top = value(r); });
    if (top <= 0) return '<span class="sub">' + empty + '</span>';
    return rows.filter(function (r) { return value(r) > 0; }).map(function (r) {
      return '<div class="bdrow">' +
        '<span class="bn nm">' + esc(name(r)) + '</span>' +
        '<span class="bar"><i style="width:' + Math.max(2, (value(r) / top) * 100) + '%"></i></span>' +
        '<span class="num amt">' + money(value(r)) + '</span>' +
        '<span class="sub sx">' + esc(sub(r)) + '</span>' +
        '</div>';
    }).join('');
  }

  function renderBreakdowns(bd) {
    $('bd-heads').innerHTML = bars(bd.heads || [],
      function (r) { return r.head_bn; },
      function (r) { return r.week; },
      function (r) { return money(r.last_28_days) + ' in 4 wk'; },
      'No site expenses booked this week.');

    $('bd-suppliers').innerHTML = bars(bd.suppliers || [],
      function (r) { return r.name_bn; },
      function (r) { return r.week; },
      function (r) { return r.unpaid > 0 ? money(r.unpaid) + ' still unpaid' : 'settled'; },
      'No material bought this week.');

    $('bd-workers').innerHTML = bars(bd.workers || [],
      function (r) { return r.name_bn; },
      function (r) { return r.paid_week; },
      function (r) { return r.days_week + ' d' + (r.advance_week > 0 ? '  ·  ' + money(r.advance_week) + ' advance' : ''); },
      'Nobody was marked present this week.');

    $('bd-items').innerHTML = bars(bd.items || [],
      function (r) { return r.name_bn; },
      function (r) { return r.week; },
      function (r) {
        var q = r.qty_week + (r.unit_bn ? ' ' + r.unit_bn : '');
        var moved = r.rate_high > r.rate_low ? '  ·  rate ' + money(r.rate_low) + '-' + money(r.rate_high) : '';
        return q + moved;
      },
      'No material bought this week.');
  }

  function renderPersonal(p, bills) {
    var head =
      '<div class="row" style="gap:1.4rem;margin-bottom:.7rem">' +
        '<span><span class="sub">this week</span><br><b class="num">' + money(p.spent_this_week) + '</b></span>' +
        '<span><span class="sub">week before</span><br><b class="num">' + money(p.spent_prev_week) + '</b></span>' +
        '<span><span class="sub">last 4 weeks</span><br><b class="num">' + money(p.spent_last_28_days) + '</b></span>' +
        '<span><span class="sub">taken from the business, 4 wk</span><br><b class="num">' + money(p.drawn_last_28_days) + '</b></span>' +
      '</div>';
    $('pers').innerHTML = head + bars(p.heads || [],
      function (r) { return r.head_bn; },
      function (r) { return r.last_28_days; },
      function (r) { return money(r.week) + ' this week  ·  ' + r.times + 'x'; },
      'Nothing entered in his own book yet.');

    var list = (bills.list || []);
    if (!list.length) {
      $('bills').innerHTML = '<span class="sub">No dates set. He can add rent, fees or a promise to a person in the app, under his own book.</span>';
      return;
    }
    var pt = bills.personal || {}, bt = bills.business || {};
    $('bills').innerHTML =
      '<div class="row" style="gap:1.4rem;margin-bottom:.7rem">' +
        '<span><span class="sub">his own, overdue</span><br><b class="num">' + money(pt.overdue) + '</b></span>' +
        '<span><span class="sub">his own, next 7 days</span><br><b class="num">' + money(pt.this_week) + '</b></span>' +
        '<span><span class="sub">business</span><br><b class="num">' + money(bt.total) + '</b></span>' +
      '</div>' +
      list.map(function (r) {
        var when = r.overdue ? Math.abs(r.days_away) + ' d late'
          : r.days_away === 0 ? 'today' : 'in ' + r.days_away + ' d';
        return '<div class="bdrow">' +
          '<span class="bn nm">' + esc(r.name_bn) + (r.to_bn ? ' <span class="sub">to ' + esc(r.to_bn) + '</span>' : '') + '</span>' +
          '<span class="sx"><span class="pill ' + (r.overdue ? 'crit' : r.days_away <= 7 ? 'warn' : 'ok') + '">' + when + '</span></span>' +
          '<span class="num amt">' + money(r.amount) + '</span>' +
          '<span class="sub sx">' + r.due_date + (r.repeat === 'monthly' ? '  ·  every month' : '') +
            (r.personal ? '' : '  ·  business') + '</span>' +
          '</div>';
      }).join('');
  }

  /* One card per live job: what it cost this week, what the money went on,
     and what was bought. "Spending is ahead" is only useful with "on what". */
  function renderJobs(list) {
    var live = list.filter(function (p) { return p.status === 'active'; });
    if (!live.length) { $('jobs').innerHTML = '<div class="card"><span class="sub">No job is running.</span></div>'; return; }
    $('jobs').innerHTML = live.map(function (p) {
      return '<div class="card" style="margin-bottom:.8rem">' +
        '<h3 class="bn">' + esc(p.name_bn) + (p.client_bn ? ' <span class="sub">for ' + esc(p.client_bn) + '</span>' : '') + '</h3>' +
        '<div class="row" style="gap:1.4rem;margin:.5rem 0 .8rem;flex-wrap:wrap">' +
          '<span><span class="sub">this week</span><br><b class="num">' + money(p.week.spend) + '</b></span>' +
          '<span><span class="sub">wages / material</span><br><b class="num">' + money(p.week.labour) + ' / ' + money(p.week.material) + '</b></span>' +
          '<span><span class="sub">man-days</span><br><b class="num">' + p.week.mandays + '</b></span>' +
          '<span><span class="sub">received</span><br><b class="num">' + money(p.week.received) + '</b></span>' +
          '<span><span class="sub">stage now</span><br><b class="bn">' + esc(p.stage_now_bn || 'not set') + '</b></span>' +
          '<span><span class="sub">per sq ft</span><br><b class="num">' + (p.cost_per_sqft === null ? '—' : money(p.cost_per_sqft)) + '</b></span>' +
          '<span><span class="sub">earned but not received</span><br><b class="num">' + money(p.unbilled) + '</b></span>' +
        '</div>' +
        '<div class="cols2">' +
          '<div><div class="sub lbl">money went on</div>' + bars(p.heads || [],
            function (r) { return r.head_bn; }, function (r) { return r.amount; },
            function (r) { return r.times + 'x'; }, 'Only wages and material so far.') + '</div>' +
          '<div><div class="sub lbl">material bought</div>' + bars(p.items || [],
            function (r) { return r.name_bn; }, function (r) { return r.amount; },
            function (r) { return r.qty + (r.unit_bn ? ' ' + r.unit_bn : ''); }, 'Nothing booked yet.') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* How much ledger there is. A confident reading off nine rows is worse
     than no reading, and this is where that shows. */
  function renderCoverage(c) {
    if (!c) return;
    var r = c.rows || {};
    $('who').textContent = (summary.household || '') +
      '  ·  ' + c.days_recorded + ' days recorded' +
      (c.first_entry_date ? ' since ' + c.first_entry_date : '') +
      '  ·  ' + (r.attendance + r.stock + r.money + r.progress) + ' rows';
  }

  function changeText(pct, prev) {
    if (pct === null || pct === undefined) return 'nothing to compare with';
    var dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'level with';
    return dir + ' ' + Math.abs(Math.round(pct)) + '% on ' + money(prev);
  }

  $('enter').onclick = function () {
    var t = $('tok').value.trim();
    if (!t) return;
    $('gatemsg').textContent = 'Checking…';
    $('gatemsg').className = 'msg';
    start(t).catch(function (e) {
      $('gatemsg').textContent = e.message;
      $('gatemsg').className = 'msg bad';
    });
  };
  $('tok').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('enter').click(); });
  $('refresh').onclick = load;
  $('hh').onchange = function () { current = this.value; load(); };
  $('signout').onclick = function () { localStorage.removeItem(KEY); location.reload(); };


  /* The whole nightly instruction travels with the summary, so the routine is
     one copy, one paste, one paste back — and so the both-languages rule can
     never be forgotten on a tired evening. */
  var PROMPT = [
    'Here is the Site Khata summary. Use these numbers exactly as given.',
    'Do not add, average or re-derive anything — if a figure is not in the',
    'summary, leave it out.',
    '',
    'Write brief.json in the schema below. Every line of text goes in TWICE:',
    '  *_bn  Bengali, for his phone — short, plain, specific',
    '  *_en  the same sentence in plain English, for the English screen',
    'Never write one without the other. No greetings, no closing summary.',
    'Lead with whatever needs attention today.',
    '',
    'Flag, in this order of priority:',
    '  - entries_last_3_days is 0        -> he has stopped entering; say so first',
    '  - cash_variance beyond +/- 2000   -> entries are being missed',
    '  - any project with cpi below 1    -> losing on the work done so far',
    '  - dues_overdue above 0            -> already past the date a supplier gave',
    '  - receivable_overdue above 0      -> a customer is late paying him',
    '  - a burn item ahead of pct_done   -> waste, theft, or a wrong estimate',
    '',
    'Schema (statuses are only ok, warn, crit, info):',
    '{',
    '  "generated_at": "ISO timestamp with +05:30",',
    '  "headline_bn": "…", "headline_en": "…",',
    '  "cards":    [{ "label_bn": "…", "label_en": "…", "value": "₹48,200", "sub_bn": "…", "sub_en": "…", "status": "ok" }],',
    '  "projects": [{ "name_bn": "…", "name_en": "…", "pct_done": 58, "pct_spent": 71, "status": "warn", "note_bn": "…", "note_en": "…" }],',
    '  "alerts":   [{ "severity": "crit", "text_bn": "…", "text_en": "…" }],',
    '  "series": {',
    '    "scurve": { "days": [0,15,30], "plan": [0,1.7,4.5], "actual": [0,2.1,5.4], "unit": "lakh" },',
    '    "burn":   [{ "item_bn": "রড", "item_en": "Steel", "pct": 92, "status": "crit" }]',
    '  },',
    '  "todo_bn": ["…"], "todo_en": ["…"]',
    '}',
    '',
    'SUMMARY:',
  ].join('\\n');

  $('copysum').onclick = function () {
    if (!summary) return;
    navigator.clipboard.writeText(PROMPT + '\\n' + JSON.stringify(summary, null, 2)).then(function () {
      $('copysum').textContent = 'Copied';
      setTimeout(function () { $('copysum').textContent = 'Copy summary for the model'; }, 1800);
    });
  };

  $('publish').onclick = function () {
    var raw = $('briefbox').value.trim();
    if (!raw) return;
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { $('pubmsg').textContent = 'That is not valid JSON.'; $('pubmsg').className = 'msg bad'; return; }
    if (!parsed.generated_at) parsed.generated_at = new Date().toISOString();
    $('pubmsg').textContent = 'Publishing…';
    $('pubmsg').className = 'msg';
    api('/brief?household=' + encodeURIComponent(current), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    }).then(function () {
      $('pubmsg').textContent = 'Published. It will be on his phone at the next refresh.';
      $('briefbox').value = '';
      briefState();
    }).catch(function (e) {
      $('pubmsg').textContent = e.message;
      $('pubmsg').className = 'msg bad';
    });
  };

  var saved = localStorage.getItem(KEY);
  if (saved) start(saved).catch(function () { localStorage.removeItem(KEY); });
})();
</script>
</body>
</html>`
}
