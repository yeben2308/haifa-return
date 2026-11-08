/**
 * דשבורד המיגון: הנתונים מהלשונית המאוחדת, מסוננים בשרת לפי ההיקף של המשתמש המחובר.
 * הדפדפן לעולם לא מקבל שורות מחוץ להיקף — הסינון לא נעשה בלקוח.
 */

// סדר השדות שנשלח לדפדפן (מערך לכל מוסד, כדי לחסוך בגודל)
var DASH_FIELDS = ['sym', 'name', 'reshut', 'yishuv', 'migzar', 'pikuach', 'misgeret', 'sug', 'shlav',
  'menahel', 'mafkach', 'phone', 'address', 'students', 'staff', 'req', 'exist', 'gap', 'pctMigun',
  'capacity', 'pctHachala', 'gan', 'eff', 'notes', 'source', 'updBy', 'updAt'];

var DASH_URL = 'https://script.google.com/a/macros/edu-haifa.org.il/s/AKfycbwWhfOyGFvlxcvWJsReJIzlJ9AIye4VLx3ghVCprqO6maw2UKDmuneEJe29Om3AzJEqvQ/exec';

/** תפריט "מיגון" בגיליון: קישור לדשבורד */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('מיגון')
    .addItem('פתיחת הדשבורד', 'openDashboardLink')
    .addToUi();
}
function openDashboardLink() {
  var html = HtmlService.createHtmlOutput(
    '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;padding:6px">' +
    '<p>הדשבורד נפתח בלשונית חדשה. אם לא נפתח:</p>' +
    '<p><a href="' + DASH_URL + '" target="_blank" style="font-weight:700;color:#8f3d00">לחצו כאן לפתיחת הדשבורד</a></p>' +
    '<script>window.open("' + DASH_URL + '","_blank");</script></div>').setWidth(380).setHeight(130);
  SpreadsheetApp.getUi().showModalDialog(html, 'דשבורד המיגון');
}

function include_(name) {
  return HtmlService.createTemplateFromFile(name).getRawContent();
}

function dashPage_(e) {
  var t = HtmlService.createTemplateFromFile('Dashboard');
  // כניסה מפורטל המחוז (?pt=): אסימון כניסה רגיל של הדשבורד, או מחרוזת ריקה. '<' מוחלף כדי שלא יסגור את תג ה-script
  var pt = e && e.parameter && e.parameter.pt;
  t.sso = JSON.stringify((pt && portalLogin_(pt)) || '').replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('מיגון מוסדות חינוך — מחוז חיפה')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // מוטמע בדף הנחיתה migun-haifa.netlify.app
}

/** האם השורה בתוך ההיקף של המשתמש */
function inScope_(p, r) {
  if (p.role === 'מנהל' || p.role === 'מחוז') return true;
  if (p.role === 'רשות') return p.scope.indexOf(String(r[2]).trim()) >= 0;
  if (p.role === 'מפקח') {
    var a = String(r[10]).trim(), b = String(r[11]).trim();
    return p.scope.indexOf(a) >= 0 || p.scope.indexOf(b) >= 0;
  }
  return false;
}

function num_(v) { return typeof v === 'number' && isFinite(v) ? v : ''; }

/** מי רשאי לעדכן נתוני מיגון: מנהל — הכל; קב"ט רשות — רק מוסדות ברשות שלו. מחוז ומפקח — צפייה בלבד */
function canEdit_(p) { return p.role === 'מנהל' || p.role === 'רשות'; }

// לשונית המקלוט: A מפקח | B רשות | C סמל | D שם | E עו"ה | F תלמידים | G כיתות | H מ"ר קיים |
// I דיווח מנהל — ניתן להכיל | J הערות | K סוג מוסד | L שלבים | M עודכן ע"י | N תאריך עדכון
var MK_COL = { exist: 8, capacity: 9, notes: 10, by: 13, at: 14 };
var SHEET_CHANGES = 'יומן שינויים';

/** סמל → {row, by, at} בלשונית המקלוט */
function maklotIndex_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_MAKLOT);
  var n = sh.getLastRow() - 1, out = {};
  if (n < 1) return out;
  var cols = Math.max(sh.getLastColumn(), MK_COL.at);
  var v = sh.getRange(2, 1, n, cols).getValues();
  v.forEach(function (r, i) {
    var s = String(r[2]).trim();
    if (s) out[s] = { row: i + 2, by: String(r[MK_COL.by - 1] || ''), at: r[MK_COL.at - 1] instanceof Date ? r[MK_COL.at - 1] : null };
  });
  return out;
}

function fmtDate_(d) { return d ? Utilities.formatDate(d, 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm') : ''; }

/** שורה מהלשונית המאוחדת → מערך לדפדפן, בסדר DASH_FIELDS */
function rowToClient_(r, mk) {
  var studSite = num_(r[14]), studMk = num_(r[15]);
  var info = mk && mk[String(r[0])];
  return [
    String(r[0]), r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8],
    r[9], r[10] || r[11], r[12], r[13],
    studMk !== '' ? studMk : studSite, num_(r[16]),
    num_(r[17]), num_(r[18]), num_(r[19]), num_(r[20]),
    num_(r[21]), num_(r[22]), r[23] === 'כן' ? 1 : 0, num_(r[24]),
    /^\s*לא דווח\s*$/.test(String(r[25] || '')) ? '' : String(r[25] || ''), r[26],
    info ? info.by : '', info ? fmtDate_(info.at) : ''
  ];
}

/** נקרא מהדפדפן אחרי כניסה */
function getDashboard(tok) {
  // מחרוזת JSON ולא אובייקט: google.script.run מחזיר לפעמים null על אובייקט גדול ומקונן, בלי שגיאה
  return JSON.stringify(dashFor_(authRequire_(tok)));
}

function dashFor_(p) {
  var ss = SpreadsheetApp.getActive();
  var m = ss.getSheetByName(SHEET_MERGED);
  var vals = m.getRange(2, 1, Math.max(1, m.getLastRow() - 1), 27).getValues();
  var mk = maklotIndex_();
  var rows = [];
  vals.forEach(function (r) {
    if (r[0] === '' || !inScope_(p, r)) return;
    rows.push(rowToClient_(r, mk));
  });
  var lg = ss.getSheetByName(SHEET_LOG);
  var last = lg.getRange(2, 1, Math.max(1, lg.getLastRow() - 1), 2).getValues().filter(function (x) { return x[1] === 'אתר'; }).pop();
  return {
    ok: true,
    user: { email: p.email, name: p.name, role: p.role, scope: p.scope, canEdit: canEdit_(p) },
    fields: DASH_FIELDS,
    rows: rows,
    updated: last ? Utilities.formatDate(last[0], 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm') : '',
    oref: orefScoped_(rows)
  };
}

/** בדיקה קלה לדשבורד: מתי עודכנו לאחרונה הנחיות פיקוד העורף (כדי להודיע על סיום עדכון) */
function getOrefStatus(tok) {
  authRequire_(tok);
  var m = {};
  try { m = JSON.parse(PropertiesService.getScriptProperties().getProperty('OREF_META') || '{}'); } catch (e) {}
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_OREF);
  return JSON.stringify({ pulledAt: m.pulledAt || '', n: sh ? Math.max(0, sh.getLastRow() - 1) : 0 });
}

/** מדיניות פיקוד העורף רק לישובים שבהיקף המשתמש */
function orefScoped_(rows) {
  var o = orefForDash_(), want = {}, by = {};
  rows.forEach(function (r) { if (r[3]) want[String(r[3]).trim()] = 1; });
  Object.keys(want).forEach(function (y) { if (o.byYishuv[y]) by[y] = o.byYishuv[y]; });
  var at = o.meta.pulledAt ? new Date(o.meta.pulledAt) : null;
  return { byYishuv: by, level: o.meta.level || '', since: o.meta.since || '', pulledAt: at ? fmtDate_(at) : '' };
}

/** ערך מספרי מהטופס: ריק = לא ידוע; אחרת מספר שלם/עשרוני בטווח */
function parseNum_(v, label, max) {
  var s = String(v == null ? '' : v).trim().replace(/,/g, '');
  if (s === '') return '';
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(label + ': יש להזין מספר (או להשאיר ריק)');
  var n = Number(s);
  if (n > max) throw new Error(label + ': הערך ' + n + ' נראה גבוה מדי');
  return n;
}

/**
 * עדכון נתוני מיגון של מוסד אחד. בודק הרשאה והיקף בשרת, כותב ללשונית המקלוט,
 * רושם מי ומתי, ומתעד כל שינוי ב"יומן שינויים". מחזיר את השורה המחושבת מחדש.
 */
function saveShelter(tok, sym, input) {
  return saveCore_(authRequire_(tok), sym, input, false);
}

/** dry=true: כל הבדיקות והחישוב, בלי כתיבה (לבדיקה מהשרת) */
function saveCore_(p, sym, input, dry) {
  if (!canEdit_(p)) throw new Error('אין לך הרשאת עדכון. העדכון זמין לקב"ט הרשות ולמנהלי המערכת.');
  sym = String(sym || '').trim();
  var exist = parseNum_(input.exist, 'מ"ר קיים', 20000);
  var capacity = parseNum_(input.capacity, 'מספר שניתן להכיל', 10000);
  var notes = String(input.notes == null ? '' : input.notes).trim().slice(0, 500);

  var ss = SpreadsheetApp.getActive();
  var m = ss.getSheetByName(SHEET_MERGED);
  var mv = m.getRange(2, 1, Math.max(1, m.getLastRow() - 1), 27).getValues();
  var mi = -1;
  for (var i = 0; i < mv.length; i++) { if (String(mv[i][0]) === sym) { mi = i; break; } }
  if (mi < 0) throw new Error('המוסד ' + sym + ' לא נמצא');
  if (!inScope_(p, mv[mi])) throw new Error('המוסד אינו בהיקף ההרשאה שלך');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('עדכון אחר רץ כרגע. נסו שוב בעוד רגע.');
  try {
    var sh = ss.getSheetByName(SHEET_MAKLOT);
    if (sh.getMaxColumns() < MK_COL.at) sh.insertColumnsAfter(sh.getMaxColumns(), MK_COL.at - sh.getMaxColumns());
    if (!sh.getRange(1, MK_COL.by).getValue()) sh.getRange(1, MK_COL.by, 1, 2).setValues([['עודכן ע"י', 'תאריך עדכון']]).setFontWeight('bold');
    var idx = maklotIndex_()[sym];
    if (dry) return { ok: true, dry: true, sym: sym, name: mv[mi][1], maklotRow: idx ? idx.row : 'שורה חדשה', old: idx ? sh.getRange(idx.row, MK_COL.exist, 1, 3).getValues()[0] : null, would: [exist, capacity, notes] };
    var row;
    if (idx) {
      row = idx.row;
    } else {
      // מוסד שאין לו עדיין שורה במקלוט (למשל גן חדש): נוצרת שורה עם פרטי הזיהוי מהאתר
      var r = mv[mi];
      sh.appendRow([r[10] || r[11] || '', r[2] || '', sym, r[1] || '', '', num_(r[14]), '', '', '', '', r[7] || '', r[8] || '', '', '']);
      row = sh.getLastRow();
      sh.getRange(row, 3).setNumberFormat('@').setValue(sym);
    }
    var old = sh.getRange(row, MK_COL.exist, 1, 3).getValues()[0];
    var now = new Date();
    sh.getRange(row, MK_COL.exist, 1, 3).setValues([[exist, capacity, notes]]);
    sh.getRange(row, MK_COL.by, 1, 2).setValues([[p.email, now]]);

    var ch = ss.getSheetByName(SHEET_CHANGES);
    if (!ch) {
      ch = ss.insertSheet(SHEET_CHANGES);
      ch.appendRow(['זמן', 'מייל', 'סמל מוסד', 'שם מוסד', 'שדה', 'ערך קודם', 'ערך חדש']);
      ch.setFrozenRows(1); ch.setRightToLeft(true); ch.getRange(1, 1, 1, 7).setFontWeight('bold');
    }
    var names = ['מ"ר קיים', 'דיווח מנהל — ניתן להכיל', 'הערות'], nv = [exist, capacity, notes];
    var changed = 0;
    for (var k = 0; k < 3; k++) {
      var a = old[k] === null ? '' : old[k], b = nv[k];
      if (String(a) !== String(b)) { ch.appendRow([now, p.email, sym, mv[mi][1], names[k], a, b]); changed++; }
    }
    SpreadsheetApp.flush();
    var fresh = m.getRange(mi + 2, 1, 1, 27).getValues()[0];
    var mk = {}; mk[sym] = { by: p.email, at: now };
    return { ok: true, changed: changed, row: rowToClient_(fresh, mk) };
  } finally {
    lock.releaseLock();
  }
}
