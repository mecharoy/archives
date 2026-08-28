/**
 * Site Khata — the Google Sheet side.
 *
 * Paste this whole file into Extensions → Apps Script on a new spreadsheet,
 * then run setUp() once. It builds the fourteen tabs, writes the formulas,
 * and prints the two things the phone app needs: the web app URL and a token.
 *
 * Three things this file is careful about, because each of them is a way the
 * workbook silently goes wrong:
 *
 *   1. The app sends values, never formulas. Formulas live only on Totals and
 *      Brief_Input, which no API write ever touches.
 *   2. Every row carries its own id and the endpoint refuses an id it has
 *      already seen, so a retry after a timeout cannot duplicate a day's wages.
 *   3. Wages are read only from Attendance and material only from Stock rows
 *      marked "in". A wage typed into Money would be counted twice, so the app
 *      never offers a free-text head that could mean wages — and neither
 *      should you.
 */

var TOKEN_KEY = 'SITE_KHATA_TOKEN';
var SEEN_KEY = 'SITE_KHATA_SEEN';

var COLUMNS = {
  Projects:     ['id','name_bn','client_bn','ptype','area_sqft','budget','start_date','plan_days','status','updated_at'],
  Workers:      ['id','name_bn','rate','phone','active','updated_at'],
  Items:        ['id','name_bn','unit_bn','last_rate','active','updated_at'],
  Parties:      ['id','name_bn','ptype','terms_days','phone','updated_at'],
  Stages:       ['id','project_type','seq','name_bn','weight','updated_at'],
  Coefficients: ['id','project_type','item_id','per_sqft','updated_at'],
  Day:          ['id','batch','date','project_id','cash_counted','cash_computed','note','reverses','created_at'],
  Attendance:   ['id','batch','date','project_id','worker_id','presence','days','rate','amount','advance','reverses','created_at'],
  Stock:        ['id','batch','date','project_id','item_id','dir','qty','rate','amount','party_id','due_date','paid','photo_id','reverses','created_at'],
  Money:        ['id','batch','date','project_id','head_bn','dir','amount','party_id','mode','note','personal','photo_id','reverses','created_at'],
  Progress:     ['id','batch','date','project_id','stage_seq','state','pct','reverses','created_at']
};

var APPEND_TABS = ['Day','Attendance','Stock','Money','Progress'];
var MASTER_TABS = ['Projects','Workers','Items','Parties','Stages','Coefficients'];

/* ------------------------------------------------------------------ setup */

function setUp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  MASTER_TABS.concat(APPEND_TABS).forEach(function (name) { ensureTab_(ss, name, COLUMNS[name]); });
  buildTotals_(ss);
  buildBriefInput_(ss);
  buildReadme_(ss);
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);

  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(TOKEN_KEY);
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8);
    props.setProperty(TOKEN_KEY, token);
  }
  Logger.log('Token for the app:  ' + token);
  Logger.log('Now: Deploy → New deployment → Web app → Execute as: me → Who has access: Anyone.');
  Logger.log('Paste that /exec URL and the token above into the app under সেটিংস → Google Sheet.');
  return token;
}

function ensureTab_(ss, name, cols) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = sh.getRange(1, 1, 1, cols.length);
  head.setValues([cols]).setFontWeight('bold').setBackground('#EAE7E0');
  sh.setFrozenRows(1);
  if (sh.getMaxColumns() > cols.length) sh.deleteColumns(cols.length + 1, sh.getMaxColumns() - cols.length);
  return sh;
}

function col_(tab, name) {
  var i = COLUMNS[tab].indexOf(name);
  if (i < 0) throw new Error('no column ' + name + ' on ' + tab);
  return String.fromCharCode(65 + i);
}

/* --------------------------------------------------------------- formulas */

/**
 * Totals: one row per project, every cell a formula. The app never writes
 * here, and never computes any of these numbers itself.
 */
function buildTotals_(ss) {
  var sh = ss.getSheetByName('Totals') || ss.insertSheet('Totals');
  sh.clear();
  var head = ['project_id','name_bn','budget','labour','material','other','cost','received',
              'pct_done','pct_spent','earned','cpi','at_finish','profit','flag_bn'];
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#EAE7E0');
  sh.setFrozenRows(1);

  var A = col_.bind(null);
  var f = [
    // project_id, name_bn, budget — pulled straight off Projects
    '=IFERROR(FILTER(Projects!' + A('Projects','id') + '2:' + A('Projects','id') + ', Projects!' + A('Projects','id') + '2:' + A('Projects','id') + '<>""),"")',
    '=IF($A2="","",IFERROR(VLOOKUP($A2,Projects!$A:$J,2,FALSE),""))',
    '=IF($A2="","",IFERROR(VLOOKUP($A2,Projects!$A:$J,6,FALSE),0))',
    // labour — Attendance only, never Money
    '=IF($A2="","",SUMIF(Attendance!' + A('Attendance','project_id') + ':' + A('Attendance','project_id') + ',$A2,Attendance!' + A('Attendance','amount') + ':' + A('Attendance','amount') + '))',
    // material — Stock rows that came in or were transferred in
    '=IF($A2="","",SUMIFS(Stock!' + A('Stock','amount') + ':' + A('Stock','amount') + ',Stock!' + A('Stock','project_id') + ':' + A('Stock','project_id') + ',$A2,Stock!' + A('Stock','dir') + ':' + A('Stock','dir') + ',"in")' +
      '+SUMIFS(Stock!' + A('Stock','amount') + ':' + A('Stock','amount') + ',Stock!' + A('Stock','project_id') + ':' + A('Stock','project_id') + ',$A2,Stock!' + A('Stock','dir') + ':' + A('Stock','dir') + ',"transfer"))',
    // other — Money paid out, business only
    '=IF($A2="","",SUMIFS(Money!' + A('Money','amount') + ':' + A('Money','amount') + ',Money!' + A('Money','project_id') + ':' + A('Money','project_id') + ',$A2,Money!' + A('Money','dir') + ':' + A('Money','dir') + ',"paid",Money!' + A('Money','personal') + ':' + A('Money','personal') + ',FALSE))',
    '=IF($A2="","",D2+E2+F2)',
    '=IF($A2="","",SUMIFS(Money!' + A('Money','amount') + ':' + A('Money','amount') + ',Money!' + A('Money','project_id') + ':' + A('Money','project_id') + ',$A2,Money!' + A('Money','dir') + ':' + A('Money','dir') + ',"received",Money!' + A('Money','personal') + ':' + A('Money','personal') + ',FALSE))',
    // pct_done — stage weights, half counting half
    '=IF($A2="","",IFERROR(SUMPRODUCT((COUNTIFS(Progress!' + A('Progress','project_id') + ':' + A('Progress','project_id') + ',$A2,Progress!' + A('Progress','stage_seq') + ':' + A('Progress','stage_seq') + ',Stages_seq_,Progress!' + A('Progress','state') + ':' + A('Progress','state') + ',"done")>0)*Stages_wt_)' +
      '+SUMPRODUCT((COUNTIFS(Progress!' + A('Progress','project_id') + ':' + A('Progress','project_id') + ',$A2,Progress!' + A('Progress','stage_seq') + ':' + A('Progress','stage_seq') + ',Stages_seq_,Progress!' + A('Progress','state') + ':' + A('Progress','state') + ',"done")=0)' +
      '*(COUNTIFS(Progress!' + A('Progress','project_id') + ':' + A('Progress','project_id') + ',$A2,Progress!' + A('Progress','stage_seq') + ':' + A('Progress','stage_seq') + ',Stages_seq_,Progress!' + A('Progress','state') + ':' + A('Progress','state') + ',"half")>0)*Stages_wt_/2),0))',
    '=IF($A2="","",IF($C2>0,$G2/$C2*100,0))',
    '=IF($A2="","",$C2*$I2/100)',
    '=IF($A2="","",IF($G2>0,$K2/$G2,""))',
    '=IF($A2="","",IF($I2>2,$G2/($I2/100),""))',
    '=IF($A2="","",IF($M2="","",$C2-$M2))',
    '=IF($A2="","",IF($C2=0,"বাজেট দেওয়া নেই",IF($J2-$I2>15,"খরচ কাজের অনেক আগে",IF($J2-$I2>6,"খরচ কাজের থেকে এগিয়ে","ঠিক আছে"))))'
  ];
  // A2 spills the project ids; every other column is filled row by row, because
  // ARRAYFORMULA over COUNTIFS logic is the kind of thing that quietly breaks
  // three months later. Forty rows is more projects than he will ever run.
  sh.getRange(2, 1).setFormula(f[0]);
  for (var r = 2; r <= 41; r++) {
    for (var k = 1; k < f.length; k++) {
      sh.getRange(r, k + 1).setFormula(f[k].replace(/\$?([A-O])2/g, function (m) {
        return m.replace('2', String(r));
      }).replace(/\$A2/g, '$A' + r));
    }
  }
  ss.setNamedRange('Stages_seq_', ss.getSheetByName('Stages').getRange('C2:C200'));
  ss.setNamedRange('Stages_wt_', ss.getSheetByName('Stages').getRange('E2:E200'));
  sh.getRange('C:H').setNumberFormat('#,##0');
  sh.getRange('I:J').setNumberFormat('0.0');
  sh.getRange('L:L').setNumberFormat('0.00');
  sh.getRange('M:N').setNumberFormat('#,##0');
}

/**
 * Brief_Input: the sixteen business-wide figures the nightly run reads.
 * Two columns, key and value, so the prompt can name them.
 */
function buildBriefInput_(ss) {
  var sh = ss.getSheetByName('Brief_Input') || ss.insertSheet('Brief_Input');
  sh.clear();
  sh.getRange(1, 1, 1, 3).setValues([['key', 'value', 'what it means']])
    .setFontWeight('bold').setBackground('#EAE7E0');
  sh.setFrozenRows(1);

  var S = function (t, c) { return t + '!' + col_(t, c) + ':' + col_(t, c); };
  var rows = [
    ['cash_counted', '=IFERROR(INDEX(SORT(FILTER({' + S('Day','cash_counted') + ',' + S('Day','date') + '},' + S('Day','cash_counted') + '<>""),2,FALSE),1,1),0)', 'last counted cash'],
    ['cash_counted_on', '=IFERROR(INDEX(SORT(FILTER({' + S('Day','date') + ',' + S('Day','date') + '},' + S('Day','cash_counted') + '<>""),2,FALSE),1,1),"")', 'the day he counted it'],
    ['cash_computed', '=IFERROR(INDEX(SORT(FILTER({' + S('Day','cash_computed') + ',' + S('Day','date') + '},' + S('Day','cash_computed') + '<>""),2,FALSE),1,1),0)', 'what the book said that day'],
    ['cash_variance', '=B2-B4', 'counted minus computed — beyond ±2000 means entries are being missed'],
    ['dues_total', '=SUMIFS(' + S('Stock','amount') + ',' + S('Stock','paid') + ',FALSE,' + S('Stock','dir') + ',"in")', 'everything owed to suppliers'],
    ['dues_overdue', '=SUMIFS(' + S('Stock','amount') + ',' + S('Stock','paid') + ',FALSE,' + S('Stock','dir') + ',"in",' + S('Stock','due_date') + ',"<"&TEXT(TODAY(),"yyyy-mm-dd"))', 'already past the date'],
    ['dues_this_week', '=SUMIFS(' + S('Stock','amount') + ',' + S('Stock','paid') + ',FALSE,' + S('Stock','dir') + ',"in",' + S('Stock','due_date') + ',">="&TEXT(TODAY(),"yyyy-mm-dd"),' + S('Stock','due_date') + ',"<="&TEXT(TODAY()+7,"yyyy-mm-dd"))', 'due in the next seven days'],
    ['shop_stock_value', '=SUMPRODUCT(IFERROR((' + S('Stock','project_id') + '="")*(' + S('Stock','dir') + '="in")*' + S('Stock','amount') + ',0))-SUMPRODUCT(IFERROR((' + S('Stock','dir') + '="sale")*' + S('Stock','amount') + ',0))', 'rough value of what is in the shop'],
    ['spend_this_month', '=SUMIFS(' + S('Attendance','amount') + ',' + S('Attendance','date') + ',">="&TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd"))+SUMIFS(' + S('Stock','amount') + ',' + S('Stock','date') + ',">="&TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd"),' + S('Stock','dir') + ',"in")+SUMIFS(' + S('Money','amount') + ',' + S('Money','date') + ',">="&TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd"),' + S('Money','dir') + ',"paid",' + S('Money','personal') + ',FALSE)', 'everything paid out this month'],
    ['received_this_month', '=SUMIFS(' + S('Money','amount') + ',' + S('Money','date') + ',">="&TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd"),' + S('Money','dir') + ',"received",' + S('Money','personal') + ',FALSE)', 'client money in this month'],
    ['wages_this_month', '=SUMIFS(' + S('Attendance','amount') + ',' + S('Attendance','date') + ',">="&TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd"))', 'labour this month'],
    ['drawings_this_month', '=SUMIFS(' + S('Money','amount') + ',' + S('Money','date') + ',">="&TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd"),' + S('Money','personal') + ',TRUE,' + S('Money','head_bn') + ',"ব্যবসা থেকে নেওয়া")', 'money taken out of the business'],
    ['entries_last_3_days', '=COUNTIFS(' + S('Day','date') + ',">="&TEXT(TODAY()-2,"yyyy-mm-dd"))', 'zero means he has stopped entering — say that first'],
    ['last_entry_date', '=IFERROR(TEXT(MAX(IFERROR(DATEVALUE(' + S('Day','date') + '),)),"yyyy-mm-dd"),"")', 'the last day he wrote anything'],
    ['active_projects', '=COUNTIF(' + S('Projects','status') + ',"active")', 'how many jobs are running'],
    ['workers_active', '=COUNTIF(' + S('Workers','active') + ',TRUE)', 'men on the books']
  ];
  for (var i = 0; i < rows.length; i++) {
    sh.getRange(i + 2, 1).setValue(rows[i][0]);
    sh.getRange(i + 2, 2).setFormula(rows[i][1]);
    sh.getRange(i + 2, 3).setValue(rows[i][2]);
  }
  sh.setColumnWidth(3, 380);
  sh.getRange('B2:B').setNumberFormat('#,##0');
}

function buildReadme_(ss) {
  var sh = ss.getSheetByName('README') || ss.insertSheet('README', 0);
  sh.clear();
  var lines = [
    ['শুধু দেখার জন্য — এখানে হাতে কিছু লিখবেন না।'],
    ['সব সংশোধন অ্যাপ থেকে করুন। অ্যাপে ভুল ঠিক করলে এখানে উল্টো লাইন যোগ হয়, পুরোনো লাইন মোছে না।'],
    [''],
    ['Three rules that keep the totals honest'],
    ['1. Wages come only from Attendance. Never type a wage into Money — it gets counted twice.'],
    ['2. Material cost comes only from Stock rows marked "in" (and "transfer" into a site).'],
    ['3. Everything else — transport, hire, subcontract — goes in Money.'],
    [''],
    ['Tabs the app writes to (append-only): Day, Attendance, Stock, Money, Progress.'],
    ['Tabs you may edit: Projects, Workers, Items, Parties, Stages, Coefficients.'],
    ['Tabs that are pure formula, never written by any API: Totals, Brief_Input.'],
    [''],
    ['Stage weights on the Stages tab must add up to 100 for each project type,'],
    ['because that is what turns "ছাদ ঢালাই শেষ" into a percentage.']
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(13);
  sh.getRange(4, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 720);
}

/* -------------------------------------------------------------- the endpoint */

function doPost(e) {
  var out = { ok: false, accepted: [], rejected: [], error: '' };
  try {
    var body = JSON.parse(e.postData.contents);
    var token = PropertiesService.getScriptProperties().getProperty(TOKEN_KEY);
    if (!token || body.token !== token) {
      out.error = 'token';
      return json_(out);
    }
    if (body.ping) {
      out.ok = true;
      out.sheet = SpreadsheetApp.getActiveSpreadsheet().getName();
      return json_(out);
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var seen = loadSeen_();
      var rows = body.rows || [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        try {
          writeRow_(ss, r, seen);
          out.accepted.push(r.id);
        } catch (err) {
          out.rejected.push({ id: r.id, error: String(err).slice(0, 120) });
        }
      }
      saveSeen_(seen);
    } finally {
      lock.releaseLock();
    }
    out.ok = true;
  } catch (err) {
    out.error = String(err).slice(0, 160);
  }
  return json_(out);
}

function doGet() {
  return json_({ ok: true, hint: 'Site Khata endpoint. The app posts here.' });
}

function writeRow_(ss, r, seen) {
  var cols = COLUMNS[r.tab];
  if (!cols) throw new Error('unknown tab');
  var sh = ss.getSheetByName(r.tab) || ensureTab_(ss, r.tab, cols);
  var values = (r.values || []).slice(0, cols.length);
  while (values.length < cols.length) values.push('');
  var entityId = String(values[0] || '');

  if (r.mode === 'upsert') {
    var ids = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === entityId) {
        sh.getRange(i + 2, 1, 1, cols.length).setValues([values]);
        return;
      }
    }
    sh.appendRow(values);
    return;
  }

  // append: an id already written is a retry of a request that did land
  var key = r.tab + ':' + entityId;
  if (seen[key]) return;
  sh.appendRow(values);
  seen[key] = 1;
}

/* The seen-set is kept small: only the last few thousand ids matter, because
   the app drops a row from its outbox the moment the endpoint accepts it. */
function loadSeen_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SEEN_KEY);
  try { return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}

function saveSeen_(seen) {
  var keys = Object.keys(seen);
  if (keys.length > 4000) {
    var trimmed = {};
    for (var i = keys.length - 2000; i < keys.length; i++) trimmed[keys[i]] = 1;
    seen = trimmed;
  }
  PropertiesService.getScriptProperties().setProperty(SEEN_KEY, JSON.stringify(seen));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------- the cold backup */

/**
 * Run nightlyBackup() on a time trigger. Every tab lands in a dated folder in
 * Drive as CSV, so the business survives the spreadsheet, the app, and you.
 */
function nightlyBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var root = folder_('Site Khata Backups');
  var day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var into = root.getFoldersByName(day).hasNext() ? root.getFoldersByName(day).next() : root.createFolder(day);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sh = sheets[i];
    var data = sh.getDataRange().getValues();
    var csv = data.map(function (row) {
      return row.map(function (c) {
        var s = c === null || c === undefined ? '' : String(c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');
    into.createFile(sh.getName() + '.csv', csv, MimeType.CSV);
  }
  // keep a month
  var old = root.getFolders();
  var cutoff = new Date(Date.now() - 31 * 86400000);
  while (old.hasNext()) {
    var f = old.next();
    if (f.getDateCreated() < cutoff) f.setTrashed(true);
  }
}

function folder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

/** Call once to put the backup on a schedule. */
function installNightlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nightlyBackup') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('nightlyBackup').timeBased().atHour(2).everyDays(1).create();
}
