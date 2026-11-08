// עדכון אוטומטי יומי של לשונית "מוסדות_אתר".
// פותח דפדפן Chrome אמיתי (Puppeteer) ברקע, טוען את "הכל אודות מוסד" כמו משתמש רגיל,
// מריץ בתוך הדף את אותה שליפה של כפתור הסימנייה, ושולח לגיליון עם המפתח מ-Config.gs.
// אין כאן התחזות או עקיפה: אם האתר יחסום את הדפדפן — הסקריפט ייכשל וירשום זאת ביומן.
//
// הרצה ידנית: node auto_pull.mjs   (מופעל יומית ע"י Task Scheduler דרך C:\Users\yochi\maklot-auto\run.mjs)
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://infocenter.education.gov.il/all/extensions/Odot_M/Odot_M.html';
const WEBAPP = 'https://script.google.com/macros/s/AKfycbwWhfOyGFvlxcvWJsReJIzlJ9AIye4VLx3ghVCprqO6maw2UKDmuneEJe29Om3AzJEqvQ/exec';
const logDir = join(here, 'data');
mkdirSync(logDir, { recursive: true });
const log = msg => {
  const line = `${new Date().toLocaleString('he-IL')}  ${msg}`;
  console.log(line);
  appendFileSync(join(logDir, 'auto_pull.log'), line + '\n');
};

// Puppeteer מותקן גלובלית
const globalRoot = execSync('npm root -g').toString().trim();
const puppeteer = createRequire(join(globalRoot, 'noop.js'))('puppeteer');

const token = (readFileSync(join(here, 'apps-script', 'Config.gs'), 'utf8').match(/PUSH_TOKEN\s*=\s*"([^"]+)"/) || [])[1];
if (!token) { log('✗ לא נמצא PUSH_TOKEN ב-Config.gs'); process.exit(1); }

// הקוד שרץ בתוך הדף — זהה לכפתור הסימנייה, בלי חלון ההעלאה
async function extractInPage() {
  const APP = '27c01333-1643-41d7-a487-7970ff7a7f22';
  const T = 'M_Nohehit_Meafyeney_Mosad';
  const app = require('qlik').openApp(APP, { host: location.hostname, prefix: '/all/', port: location.port, isSecure: true });
  if (app.model.waitForOpen) await app.model.waitForOpen.promise;
  const em = app.model.enigmaModel;
  const tk = await em.getTablesAndKeys({ qcx: 1000, qcy: 1000 }, { qcx: 0, qcy: 0 }, 30, true, false);
  const fields = tk.qtr.find(t => t.qName === T).qFields.map(f => f.qName).filter(n => !n.startsWith('$'));
  const obj = await em.createSessionObject({
    qInfo: { qType: 'maklot-export' },
    qHyperCubeDef: {
      qDimensions: fields.map(n => ({ qDef: { qFieldDefs: [n] }, qNullSuppression: false })),
      qMeasures: [{ qDef: { qDef: `Count({<[${T}.MACHOZ_CHINUCH_TEUR]={'חיפה'}>} 1)` } }],
      qSuppressZero: true, qSuppressMissing: false,
    },
  });
  const lay = await obj.getLayout();
  const N = lay.qHyperCube.qSize.qcy, W = fields.length + 1, H = Math.floor(10000 / W);
  const rows = [];
  for (let top = 0; top < N; top += H) {
    const p = await obj.getHyperCubeData('/qHyperCubeDef', [{ qTop: top, qLeft: 0, qWidth: W, qHeight: Math.min(H, N - top) }]);
    for (const r of p[0].qMatrix) rows.push(r.slice(0, fields.length).map(c => c.qText == null ? '' : c.qText));
  }
  await em.destroySessionObject(obj.id);
  const si = fields.indexOf(T + '.SEMEL_MOSAD');
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r[si])) groups.set(r[si], []); groups.get(r[si]).push(r); }
  const records = [...groups.values()].map(rs => fields.map((_, i) =>
    [...new Set(rs.map(r => r[i]).filter(v => v !== '' && v !== '-'))].join('/')));
  return { fields, records, rawRows: rows.length };
}

async function pullOnce() {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(SITE, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(() => typeof window.require === 'function' && !!window.require.defined
      && window.require.defined('qlik'), { timeout: 90000 });
    return await page.evaluate(extractInPage);
  } finally {
    await browser.close();
  }
}

/* ── פיקוד העורף: מדיניות התגוננות לכל ישוב של מוסדות המחוז ── */
const OREF_PAGE = 'https://www.oref.org.il/heb/restriction-policy/' + encodeURIComponent('חיפה | אזור המפרץ');

// ישובים שהשם שלהם במשרד החינוך שונה מהשם בפיקוד העורף. approx = קירוב (אין ישוב באותו שם)
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

// רץ בתוך דף פיקוד העורף (אותו מקור, בלי CORS)
async function orefInPage(yishuvim, aliases) {
  const norm = s => String(s).replace(/\(.*?\)/g, '').replace(/קריית/g, 'קרית').replace(/["'״׳`]/g, '').replace(/[-–־]/g, ' ').replace(/\s+/g, ' ').trim();
  const cities = await fetch('/districts/cities_heb.json').then(r => r.json());
  const idx = {};
  cities.forEach(c => { const k = norm(c.label.split(' | ')[0]); (idx[k] = idx[k] || []).push(c.label); });
  const policy = await fetch('/api/v1/restrictionsPolicy/heb').then(r => r.json());
  const out = [], cache = {};
  for (const y of yishuvim) {
    const al = aliases[y];
    const key = al ? al.key : (idx[norm(y)] || [])[0];
    if (!key) { out.push({ yishuv: y, key: '', error: 'לא נמצא ישוב תואם בפיקוד העורף' }); continue; }
    if (!cache[key]) {
      const r = await fetch('/api/v1/restrictionsPolicy/data/heb/' + encodeURIComponent(key));
      cache[key] = r.ok ? await r.json() : { error: 'HTTP ' + r.status };
      await new Promise(res => setTimeout(res, 150)); // קצב מתון
    }
    const j = cache[key];
    if (j.error) { out.push({ yishuv: y, key, error: j.error }); continue; }
    const times = (j.areas || []).map(a => Number(a.migunTime)).filter(n => isFinite(n));
    const lit = [...new Set((j.areas || []).map(a => a.literalMigunTime).filter(Boolean))];
    out.push({
      yishuv: y, key, approx: al && al.approx ? al.approx : '',
      area: j.areaHeader || key, color: j.color || '',
      edu: (j.notes || [])[0] || '', gather: (j.notes || [])[1] || '', work: (j.notes || [])[2] || '',
      tMin: times.length ? Math.min(...times) : '', tMax: times.length ? Math.max(...times) : '', tText: lit.join(' / '),
      zones: (j.areas || []).map(a => a.displayName + ' (' + (a.literalMigunTime || a.migunTime + ' שנ׳') + ')').join(' ; '),
      alerts24: j.lastDayAlertCount ?? '', updates24: j.lastDayUpdateCount ?? '',
    });
  }
  const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return { rows: out, meta: { level: (policy.guidelinesContainer || {}).title || '', since: strip(policy.dateRangeText) } };
}

async function pullOref(yishuvim) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(OREF_PAGE, { waitUntil: 'networkidle2', timeout: 120000 });
    return await page.evaluate(orefInPage, yishuvim, OREF_ALIASES);
  } finally {
    await browser.close();
  }
}

async function post(body) {
  const res = await fetch(WEBAPP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({ token }, body)) });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` }; }
}

async function main() {
  const t0 = Date.now();
  const onlyOref = process.argv.includes('--oref');
  let data, lastErr, failed = false;
  if (!onlyOref) {
    for (let attempt = 1; attempt <= 3 && !data; attempt++) {
      try { data = await pullOnce(); }
      catch (e) { lastErr = e; log(`ניסיון ${attempt} נכשל: ${e.message}`); }
    }
    if (!data) { log(`✗ השליפה נכשלה אחרי 3 ניסיונות: ${lastErr && lastErr.message}`); failed = true; }
    else {
      log(`נשלפו ${data.records.length} מוסדות (${data.rawRows} שורות, ${data.fields.length} שדות) תוך ${((Date.now() - t0) / 1000).toFixed(0)} שנ'`);
      const r = await post({ type: 'odot', fields: data.fields, records: data.records, pulledAt: new Date().toISOString(), note: 'עדכון אוטומטי יומי' });
      if (!r.ok) { log(`✗ הכתיבה לגיליון נכשלה: ${r.error}`); failed = true; }
      else log(`✓ הגיליון עודכן: ${r.rows} מוסדות — סה"כ ${((Date.now() - t0) / 1000).toFixed(0)} שנ'`);
    }
  }

  // פיקוד העורף חוסם דפדפן רקע (CloudFront 403, נבדק 8/11/2026). לא עוקפים — העדכון שלו בכפתור הסימנייה
  // (bookmarklet_oref.src.js). הקוד נשאר להרצה ידנית בלבד עם --oref, למקרה שהחסימה תוסר.
  if (onlyOref) try {
    const t1 = Date.now();
    let yishuvim;
    if (data) {
      const yi = data.fields.indexOf('שם ישוב שנה נוכחית');
      yishuvim = [...new Set(data.records.map(r => String(r[yi] || '').split('/')[0].trim()).filter(Boolean))];
    } else {
      const r = await post({ type: 'yishuvim' });
      yishuvim = r.ok ? r.yishuvim : [];
    }
    if (!yishuvim.length) throw new Error('אין רשימת ישובים');
    const oref = await pullOref(yishuvim);
    const bad = oref.rows.filter(x => x.error);
    const r = await post({ type: 'oref', rows: oref.rows, meta: oref.meta, pulledAt: new Date().toISOString() });
    if (!r.ok) throw new Error(r.error);
    log(`✓ פיקוד העורף: ${oref.rows.length - bad.length}/${oref.rows.length} ישובים${bad.length ? ' (ללא התאמה: ' + bad.map(x => x.yishuv).join(', ') + ')' : ''} — ${((Date.now() - t1) / 1000).toFixed(0)} שנ'`);
  } catch (e) {
    log('✗ פיקוד העורף: ' + e.message); failed = true;
  }
  if (failed) process.exit(1);
}

main().catch(e => { log('✗ ' + e.message); process.exit(1); });
