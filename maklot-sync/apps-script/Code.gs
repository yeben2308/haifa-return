/**
 * מקלוט מוסדות חינוך — מחוז חיפה
 * "תיבת דואר" של הגיליון: מקבלת נתונים ב-POST וכותבת ללשוניות.
 *
 * בעלות על לשוניות (אף כותב לא נוגע בלשונית של אחר):
 *   מוסדות_אתר  ← רק המשיכה מ"הכל אודות מוסד" (נדרסת במלואה בכל עדכון)
 *   מקלוט       ← רק קב"טי הרשויות. הטעינה הראשונית מהקובץ נעשית פעם אחת בלבד
 *   יומן        ← שורה לכל עדכון שהתקבל
 */

const SHEET_ODOT = 'מוסדות_אתר';
const SHEET_MAKLOT = 'מקלוט';
const SHEET_LOG = 'יומן';
const ODOT_PREFIX = 'M_Nohehit_Meafyeney_Mosad.';

/** להרצה ידנית פעם אחת מהעורך — מאשר הרשאות ויוצר את הלשוניות. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  [SHEET_ODOT, SHEET_MAKLOT, SHEET_LOG].forEach(n => ss.getSheetByName(n) || ss.insertSheet(n));
  const log = ss.getSheetByName(SHEET_LOG);
  if (log.getLastRow() === 0) {
    log.appendRow(['זמן קבלה', 'סוג', 'זמן משיכה במקור', 'מוסדות', 'שדות', 'הערה']);
    log.setFrozenRows(1);
  }
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('גיליון1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  return 'ok';
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'גוף הבקשה אינו JSON' });
  }
  if (body.token !== PUSH_TOKEN) return json_({ ok: false, error: 'מפתח שגוי' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return json_({ ok: false, error: 'עדכון אחר רץ כרגע' });
  try {
    setup();
    if (body.type === 'odot') return json_(writeOdot_(body));
    if (body.type === 'maklot') return json_(writeMaklot_(body));
    if (body.type === 'rebuild') return json_(buildMerged_());
    if (body.type === 'stats') return json_(mergedStats_());
    if (body.type === 'oref') return json_(writeOref_(body));
    if (body.type === 'dashdump') return json_(dashFor_({ email: '~debug', name: 'debug', role: 'מנהל', scope: [] }));
    if (body.type === 'dashdebug') {
      const t0 = Date.now();
      const d = dashFor_({ email: '~debug', name: 'debug', role: 'מנהל', scope: [] });
      const bad = [];
      const walk = (v, path) => { if (v instanceof Date) bad.push(path); else if (v && typeof v === 'object') Object.keys(v).forEach(k => { if (bad.length < 20) walk(v[k], path + '.' + k); }); };
      walk(d, 'd');
      return json_({ ok: true, ms: Date.now() - t0, rows: d.rows.length, bytes: JSON.stringify(d).length, dates: bad, orefKeys: Object.keys(d.oref.byYishuv).length, user: d.user });
    }
    if (body.type === 'yishuvim') {
      const s = SpreadsheetApp.getActive().getSheetByName(SHEET_SLIM);
      const v = s.getRange(2, 4, Math.max(1, s.getLastRow() - 1), 1).getValues().map(r => String(r[0]).trim()).filter(String);
      return json_({ ok: true, yishuvim: [...new Set(v)] });
    }
    if (body.type === 'savetest') return json_(saveCore_({ email: '~test', role: 'מנהל', scope: [] }, body.sym, body.input || {}, true));
    if (body.type === 'export') {
      SpreadsheetApp.flush();
      const ss = SpreadsheetApp.getActive();
      const m = ss.getSheetByName(SHEET_MERGED);
      const vals = m.getRange(1, 1, m.getLastRow(), 27).getValues();
      const lg = ss.getSheetByName(SHEET_LOG);
      const lastOdot = lg.getRange(2, 1, Math.max(1, lg.getLastRow() - 1), 2).getValues()
        .filter(r => r[1] === 'אתר').pop();
      return json_({ ok: true, header: vals[0], rows: vals.slice(1).filter(r => r[0] !== ''),
                     odotUpdated: lastOdot ? lastOdot[0] : null, exportedAt: new Date() });
    }
    if (body.type === 'log') {
      const lg = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
      const n = Math.min(8, lg.getLastRow() - 1);
      return json_({ ok: true, last: n > 0 ? lg.getRange(lg.getLastRow() - n + 1, 1, n, 6).getDisplayValues() : [] });
    }
    return json_({ ok: false, error: 'סוג לא מוכר: ' + body.type });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/** ברירת מחדל → הדשבורד (עם מסך כניסה); ?page=upload → דף ההעלאה; ?page=health → בדיקת חיים. */
function doGet(e) {
  const page = e && e.parameter && e.parameter.page;
  if (page === 'upload') {
    return HtmlService.createHtmlOutputFromFile('Upload')
      .setTitle('עדכון נתוני מוסדות — מקלוט חיפה')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (page === 'health') {
    const s = SpreadsheetApp.getActive().getSheetByName(SHEET_ODOT);
    return json_({ ok: true, odotRows: s ? Math.max(0, s.getLastRow() - 1) : 0 });
  }
  return dashPage_(e);
}

/**
 * נקרא מדף ההעלאה (google.script.run). המפתח מגיע מהדפדפן של המשתמש, שהקליד אותו פעם אחת.
 * בדיקת שפיות: עדכון שמביא פחות ממחצית המוסדות הקיימים נדחה, כדי ששליפה חלקית לא תמחק נתונים.
 */
function saveOdotFromClient(payload, token) {
  if (token !== PUSH_TOKEN) return { ok: false, error: 'מפתח שגוי', badToken: true };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'עדכון אחר רץ כרגע' };
  try {
    setup();
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ODOT);
    const prev = Math.max(0, sh.getLastRow() - 1);
    const n = (payload.records || []).length;
    if (prev > 0 && n < prev * 0.5 && !payload.force) {
      return { ok: false, error: `התקבלו ${n} מוסדות לעומת ${prev} בגיליון — נראה כמו שליפה חלקית, העדכון נדחה` };
    }
    return writeOdot_(payload);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

// ── נתוני האתר: דריסה מלאה ──
function writeOdot_(body) {
  const fields = body.fields;
  const records = body.records; // מערך של מערכים, באותו סדר כמו fields
  if (!Array.isArray(fields) || !Array.isArray(records) || !records.length) {
    throw new Error('חסרים fields או records');
  }
  const header = fields.map(f => f.startsWith(ODOT_PREFIX) ? f.slice(ODOT_PREFIX.length) : f);
  const symIdx = header.indexOf('SEMEL_MOSAD');
  if (symIdx < 0) throw new Error('אין עמודת SEMEL_MOSAD בנתונים');

  // סמל המוסד ראשון, כדי שיהיה נוח לחפש ולחבר
  const order = [symIdx].concat(header.map((_, i) => i).filter(i => i !== symIdx));
  const values = [order.map(i => header[i])].concat(
    records.map(r => order.map(i => cell_(r[i], i === symIdx)))
  );

  const t0 = Date.now();
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ODOT);
  const oldRows = sh.getLastRow(), oldCols = sh.getLastColumn();
  // שליפה חלקית (פחות ממחצית המוסדות הקיימים) לא דורסת את הגיליון
  if (oldRows > 1 && records.length < (oldRows - 1) * 0.5 && !body.force) {
    throw new Error(`התקבלו ${records.length} מוסדות לעומת ${oldRows - 1} בגיליון — נראה כמו שליפה חלקית, העדכון נדחה`);
  }
  const oldHeader = oldCols ? sh.getRange(1, 1, 1, oldCols).getValues()[0].map(String).join('\u0001') : '';
  if (sh.getMaxColumns() < values[0].length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), values[0].length - sh.getMaxColumns());
  }
  if (sh.getMaxRows() < values.length) {
    sh.insertRowsAfter(sh.getMaxRows(), values.length - sh.getMaxRows());
  }
  // כותבים מעל הקיים ומנקים רק את העודף — בלי ריקון מלא שגורם לחישוב מחדש כפול בלשונית המאוחדת
  sh.getRange(1, 1, values.length, 1).setNumberFormat('@'); // סמל כטקסט
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  if (oldRows > values.length) sh.getRange(values.length + 1, 1, oldRows - values.length, Math.max(oldCols, 1)).clearContent();
  if (oldCols > values[0].length) sh.getRange(1, values[0].length + 1, Math.max(oldRows, values.length), oldCols - values[0].length).clearContent();
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  const tWrite = Date.now() - t0;

  writeSlim_(values);
  log_('אתר', body.pulledAt, records.length, fields.length, body.note || '');
  if (!SpreadsheetApp.getActive().getSheetByName(SHEET_MERGED)) buildMerged_();
  return { ok: true, sheet: SHEET_ODOT, rows: records.length, cols: fields.length,
           ms: { write: tWrite, total: Date.now() - t0 } };
}

// ── נתוני המקלוט: טעינה ראשונית בלבד ──
function writeMaklot_(body) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_MAKLOT);
  if (sh.getLastRow() > 1 && !body.force) {
    throw new Error('בלשונית המקלוט כבר יש נתונים — הטעינה הראשונית לא תדרוס עדכוני קב"טים');
  }
  const values = [body.header].concat(body.rows.map(r => r.map((v, i) => cell_(v, i === body.symbolIndex))));
  sh.clearContents();
  if (sh.getMaxColumns() < values[0].length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), values[0].length - sh.getMaxColumns());
  }
  if (sh.getMaxRows() < values.length) {
    sh.insertRowsAfter(sh.getMaxRows(), values.length - sh.getMaxRows());
  }
  sh.getRange(1, body.symbolIndex + 1, values.length, 1).setNumberFormat('@');
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  sh.setFrozenRows(1);
  log_('מקלוט (טעינה ראשונית)', body.pulledAt, body.rows.length, body.header.length, body.note || '');
  return { ok: true, sheet: SHEET_MAKLOT, rows: body.rows.length };
}

// ── לשונית חיבור קטנה: רק השדות שהלשונית המאוחדת צריכה, בסדר קבוע ──
// הנוסחאות המאוחדות מפנות אליה ולא לטבלת 151 השדות — כך כתיבת הטבלה המלאה
// לא מפעילה חישוב מחדש של כל הנוסחאות (זה מה שהאט כתיבה מדקה לחמש דקות).
const SHEET_MERGED = 'מאוחד';
const SHEET_SLIM = 'אתר_לחיבור';
const SLIM_FIELDS = [
  'SEMEL_MOSAD', 'שם מוסד שנה נוכחית', 'רשות חינוך שנה נוכחית', 'שם ישוב שנה נוכחית',
  'מגזר שנה נוכחית', 'סוג פיקוח שנה נוכחית', 'סוג מסגרת שנה נוכחית', 'סוג מוסד שנה נוכחית',
  'שלב חינוך שנה נוכחית', 'שם מנהל שנה נוכחית', 'שם מפקח שנה נוכחית', 'טלפון שנה נוכחית',
  'כתובת שנה נוכחית', 'מספר תלמידים שנה נוכחית',
];

function writeSlim_(values) {
  const header = values[0].map(String);
  const idx = SLIM_FIELDS.map(n => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error('שדה חסר בנתוני האתר: ' + n);
    return i;
  });
  const slim = values.map(r => idx.map(i => r[i]));
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_SLIM) || ss.insertSheet(SHEET_SLIM);
  const oldRows = sh.getLastRow();
  if (sh.getMaxRows() < slim.length) sh.insertRowsAfter(sh.getMaxRows(), slim.length - sh.getMaxRows());
  sh.getRange(1, 1, slim.length, 1).setNumberFormat('@');
  sh.getRange(1, 1, slim.length, slim[0].length).setValues(slim);
  if (oldRows > slim.length) sh.getRange(slim.length + 1, 1, oldRows - slim.length, slim[0].length).clearContent();
  sh.setFrozenRows(1);
}

function buildMerged_() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName(SHEET_SLIM)) {
    const odot = ss.getSheetByName(SHEET_ODOT);
    writeSlim_(odot.getDataRange().getValues());
  }
  const col = n => SLIM_FIELDS.indexOf(n) + 1;
  const OD = `'${SHEET_SLIM}'`;
  const MK = `'${SHEET_MAKLOT}'`;
  const lastOdot = String.fromCharCode(64 + SLIM_FIELDS.length);
  const keys = 'A2:A';
  const wrap = expr => `=ARRAYFORMULA(IF(${keys}="",,${expr}))`;
  // ערך מהאתר לפי שם שדה (מלשונית החיבור)
  const O = name => `IFERROR(VLOOKUP(${keys},${OD}!$A$2:$${lastOdot},${col(name)},FALSE),"")`;
  // ערך מהמקלוט: מערך {סמל כטקסט, A..L} → עמודה A היא אינדקס 2
  const MKCOLS = { 'מפקח': 1, 'רשות': 2, 'שם': 4, 'עוה': 5, 'תלמידים': 6, 'קיים': 8, 'מנהל': 9, 'הערות': 10, 'סוג': 11, 'שלבים': 12 };
  const M = key => `IFERROR(VLOOKUP(${keys},{TO_TEXT(${MK}!$C$2:$C),${MK}!$A$2:$L},${MKCOLS[key] + 1},FALSE),"")`;
  const either = (a, b) => `IF(${a}<>"",${a},${b})`;

  const cols = [
    ['סמל מוסד', `=SORT(UNIQUE(FILTER({${OD}!A2:A;TO_TEXT(${MK}!C2:C)},{${OD}!A2:A;TO_TEXT(${MK}!C2:C)}<>"")))`],
    ['שם מוסד', wrap(either(O('שם מוסד שנה נוכחית'), M('שם')))],
    ['רשות', wrap(either(O('רשות חינוך שנה נוכחית'), M('רשות')))],
    ['ישוב', wrap(O('שם ישוב שנה נוכחית'))],
    ['מגזר', wrap(O('מגזר שנה נוכחית'))],
    ['פיקוח', wrap(O('סוג פיקוח שנה נוכחית'))],
    ['סוג מסגרת', wrap(O('סוג מסגרת שנה נוכחית'))],
    ['סוג מוסד', wrap(either(O('סוג מוסד שנה נוכחית'), M('סוג')))],
    ['שלב חינוך', wrap(either(O('שלב חינוך שנה נוכחית'), M('שלבים')))],
    ['שם מנהל', wrap(O('שם מנהל שנה נוכחית'))],
    ['שם מפקח (אתר)', wrap(O('שם מפקח שנה נוכחית'))],
    ['שם מפקח (מקלוט)', wrap(M('מפקח'))],
    ['טלפון', wrap(O('טלפון שנה נוכחית'))],
    ['כתובת', wrap(O('כתובת שנה נוכחית'))],
    ['תלמידים (אתר)', wrap(O('מספר תלמידים שנה נוכחית'))],               // O
    ['תלמידים (מקלוט)', wrap(M('תלמידים'))],                              // P
    ['עו"ה', wrap(M('עוה'))],                                              // Q
    ['מרחב מוגן נדרש (מ"ר)', wrap('IF(ISNUMBER(P2:P),(P2:P+IF(ISNUMBER(Q2:Q),Q2:Q,0))*0.5,"")')], // R
    ['מרחב מוגן קיים (מ"ר)', wrap(M('קיים'))],                            // S
    ['פער מיגון (מ"ר)', wrap('IF(ISNUMBER(S2:S)*ISNUMBER(R2:R),S2:S-R2:R,"")')],               // T
    ['אחוז מיגון', wrap('IF(ISNUMBER(S2:S)*ISNUMBER(R2:R),IF(R2:R>0,S2:S/R2:R,""),"")')],      // U
    ['דווח מנהל - ניתן להכיל', wrap(M('מנהל'))],                          // V
    ['אחוז הכלה', wrap('IF(ISNUMBER(V2:V)*ISNUMBER(P2:P),IF(P2:P+IF(ISNUMBER(Q2:Q),Q2:Q,0)>0,V2:V/(P2:P+IF(ISNUMBER(Q2:Q),Q2:Q,0)),""),"")')], // W
    ['גן ילדים', wrap('IF((G2:G="גן ילדים")+(H2:H="גן ילדים"),"כן","")')], // X
    // כלל העבודה (CLAUDE.md): גן → אחוז מיגון; אחרת הכלה אם דווחה (>0), ואם לא — אחוז מיגון
    ['כיסוי אפקטיבי', wrap('IF(X2:X="כן",U2:U,IF(ISNUMBER(W2:W),IF(W2:W>0,W2:W,U2:U),U2:U))')], // Y
    ['הערות קב"ט', wrap(M('הערות'))],                                     // Z
    ['מקור', wrap(`IF(ISNUMBER(MATCH(${keys},${OD}!A2:A,0))*ISNUMBER(MATCH(${keys},TO_TEXT(${MK}!C2:C),0)),"אתר + מקלוט",IF(ISNUMBER(MATCH(${keys},${OD}!A2:A,0)),"אתר בלבד","מקלוט בלבד"))`)],
  ];

  const sh = ss.getSheetByName(SHEET_MERGED) || ss.insertSheet(SHEET_MERGED);
  sh.clear();
  if (sh.getMaxColumns() < cols.length) sh.insertColumnsAfter(sh.getMaxColumns(), cols.length - sh.getMaxColumns());
  const need = Math.max(ss.getSheetByName(SHEET_SLIM).getLastRow(), ss.getSheetByName(SHEET_MAKLOT).getLastRow()) * 2 + 10;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(1, 1, 1, cols.length).setValues([cols.map(c => c[0])])
    .setFontWeight('bold').setBackground('#1f4e79').setFontColor('#ffffff').setWrap(true);
  sh.getRange(2, 1, 1, cols.length).setFormulas([cols.map(c => c[1])]);
  ['U', 'W', 'Y'].forEach(c => sh.getRange(`${c}2:${c}`).setNumberFormat('0%'));
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.setRightToLeft(true);
  return { ok: true, sheet: SHEET_MERGED, cols: cols.length };
}

/** סטטיסטיקה לאימות החיבור (נקרא ב-doPost type=stats). */
function mergedStats_() {
  SpreadsheetApp.flush();
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_MERGED);
  const n = sh.getLastRow() - 1;
  const v = sh.getRange(2, 1, n, 27).getValues();
  const count = (f) => v.filter(f).length;
  const src = {};
  v.forEach(r => { src[r[26]] = (src[r[26]] || 0) + 1; });
  return {
    ok: true, rows: n, source: src,
    withShelterData: count(r => r[20] !== ''),
    withCapacity: count(r => r[22] !== ''),
    gan: count(r => r[23] === 'כן'),
    errors: count(r => r.some(c => typeof c === 'string' && /^#/.test(c))),
    sample: v.slice(0, 3),
  };
}

// ── פיקוד העורף: מדיניות התגוננות לכל ישוב (נדרסת בכל עדכון) ──
const SHEET_OREF = 'פיקוד_העורף';
const OREF_COLS = [['yishuv', 'ישוב'], ['key', 'מפתח פיקוד העורף'], ['approx', 'הערת התאמה'], ['area', 'אזור'], ['color', 'צבע'],
  ['edu', 'פעילות חינוכית'], ['gather', 'התקהלות ושירותים'], ['work', 'מקומות עבודה'], ['tMin', 'זמן התגוננות מינ׳ (שנ׳)'],
  ['tMax', 'זמן התגוננות מקס׳ (שנ׳)'], ['tText', 'זמן התגוננות'], ['zones', 'אזורי התרעה'], ['alerts24', 'התרעות ביממה'],
  ['updates24', 'עדכונים ביממה'], ['error', 'שגיאה']];

function writeOref_(body) {
  const rows = body.rows || [];
  if (rows.length < 10) throw new Error('התקבלו רק ' + rows.length + ' ישובים — העדכון נדחה');
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_OREF) || ss.insertSheet(SHEET_OREF);
  const values = [OREF_COLS.map(c => c[1])].concat(rows.map(r => OREF_COLS.map(c => r[c[0]] == null ? '' : r[c[0]])));
  sh.clearContents();
  if (sh.getMaxColumns() < values[0].length) sh.insertColumnsAfter(sh.getMaxColumns(), values[0].length - sh.getMaxColumns());
  sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  sh.setFrozenRows(1); sh.setRightToLeft(true); sh.getRange(1, 1, 1, values[0].length).setFontWeight('bold');
  PropertiesService.getScriptProperties().setProperty('OREF_META', JSON.stringify(Object.assign({}, body.meta || {}, { pulledAt: body.pulledAt || new Date().toISOString() })));
  log_('פיקוד העורף', body.pulledAt, rows.length, OREF_COLS.length, (body.meta && body.meta.level) || '');
  return { ok: true, sheet: SHEET_OREF, rows: rows.length };
}

// ישובים שהשם שלהם במשרד החינוך שונה מפיקוד העורף. approx = קירוב (אין ישוב באותו שם)
const OREF_ALIASES = {
  'באקה אל-גרביה': { key: 'באקה אל גרבייה | אזור ואדי ערה' },
  'דאלית אל-כרמל': { key: 'דלית אל כרמל | אזור הכרמל' },
  'קרית טבעון': { key: 'קריית טבעון - בית זייד | אזור העמקים' },
  'בנימינה-גבעת עדה': { key: 'בנימינה | אזור מנשה' },
  'אבטין': { key: 'איבטין | אזור המפרץ' },
  'מעין צבי': { key: 'מעיין צבי | אזור מנשה' },
  "ח'ואלד": { key: "כפר ח'וואלד | אזור העמקים" },
  "ח'ואלד (שבט)": { key: "כפר ח'וואלד | אזור העמקים" },
  "ג'ת": { key: "ג'ת | אזור ואדי ערה" },
  'בסמ"ה': { key: 'ברטעה | אזור ואדי ערה', approx: 'מועצה אזורית בסמ"ה — לפי ברטעה' },
  'כפר הנוער הדתי': { key: "כפר חסידים א' | אזור המפרץ", approx: 'לפי כפר חסידים א׳' },
};

/** לכפתור פיקוד העורף (דרך דף ההעלאה): רשימת הישובים העדכנית + טבלת השמות החלופיים */
function getOrefTargets(token) {
  if (token !== PUSH_TOKEN) return { ok: false, error: 'מפתח שגוי', badToken: true };
  const s = SpreadsheetApp.getActive().getSheetByName(SHEET_SLIM);
  const v = s.getRange(2, 4, Math.max(1, s.getLastRow() - 1), 1).getValues().map(r => String(r[0]).split('/')[0].trim()).filter(String);
  return { ok: true, yishuvim: [...new Set(v)], aliases: OREF_ALIASES };
}

function saveOrefFromClient(payload, token) {
  if (token !== PUSH_TOKEN) return { ok: false, error: 'מפתח שגוי', badToken: true };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'עדכון אחר רץ כרגע' };
  try { return writeOref_(payload); }
  catch (err) { return { ok: false, error: String(err && err.message || err) }; }
  finally { lock.releaseLock(); }
}

/** לדשבורד: ישוב → מדיניות */
function orefForDash_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_OREF);
  const out = { byYishuv: {}, meta: {} };
  try { out.meta = JSON.parse(PropertiesService.getScriptProperties().getProperty('OREF_META') || '{}'); } catch (e) {}
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, OREF_COLS.length).getValues().forEach(r => {
    const o = {}; OREF_COLS.forEach((c, i) => o[c[0]] = r[i]);
    if (o.yishuv) out.byYishuv[String(o.yishuv).trim()] = o;
  });
  return out;
}

// מספר "נקי" נשמר כמספר; סמלים, ערכים עם אפס מוביל וטקסט נשארים טקסט; "-" = ריק
function cell_(v, forceText) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (s === '-' || s === '') return '';
  if (forceText) return s;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) && s.length < 15) return Number(s);
  return s;
}

function log_(type, pulledAt, n, nf, note) {
  SpreadsheetApp.getActive().getSheetByName(SHEET_LOG)
    .appendRow([new Date(), type, pulledAt || '', n, nf, note]);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
