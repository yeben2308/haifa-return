// כפתור סימנייה: עדכון "מוסדות_אתר" בגיליון המקלוט מתוך דף "הכל אודות מוסד".
// נבנה ל-bookmarklet.txt ע"י build_bookmarklet.mjs. רץ בדפדפן של המשתמש, בסשן הרגיל שלו באתר.
(async () => {
  const UP = 'https://script.google.com/a/macros/edu-haifa.org.il/s/AKfycbwWhfOyGFvlxcvWJsReJIzlJ9AIye4VLx3ghVCprqO6maw2UKDmuneEJe29Om3AzJEqvQ/exec?page=upload';
  const APP = '27c01333-1643-41d7-a487-7970ff7a7f22';
  const T = 'M_Nohehit_Meafyeney_Mosad';
  const MACHOZ = 'חיפה';

  const toast = (t, color) => {
    let el = document.getElementById('maklotToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'maklotToast';
      el.style.cssText = 'position:fixed;top:14px;left:14px;z-index:999999;padding:12px 16px;border-radius:8px;font:bold 15px Arial;color:#fff;max-width:420px;direction:rtl;box-shadow:0 2px 8px rgba(0,0,0,.25)';
      document.body.appendChild(el);
    }
    el.style.background = color || '#1d4ed8';
    el.textContent = t;
  };

  if (location.hostname !== 'infocenter.education.gov.il' || typeof require !== 'function') {
    toast('יש להפעיל את הכפתור מתוך דף "הכל אודות מוסד"', '#b91c1c');
    return;
  }

  // פותחים את דף ההעלאה מיד, בתוך הלחיצה — אחרת חוסם החלונות הקופצים יעצור אותו
  window.open(UP, 'maklotUpload');
  let target = null, payload = null, sent = false;
  const send = () => {
    if (sent || !target || !payload) return;
    sent = true; // שולחים פעם אחת בלבד, גם אם דף ההעלאה הודיע "מוכן" יותר מפעם אחת
    target.src.postMessage({ type: 'odot-data', payload }, target.origin);
  };
  window.addEventListener('message', e => {
    let h = ''; try { h = new URL(e.origin).hostname; } catch (_) {}
    if (!h.endsWith('.googleusercontent.com') || !e.data) return;
    if (e.data.type === 'maklot-ready') { target = { src: e.source, origin: e.origin }; send(); }
    if (e.data.type === 'maklot-done') {
      const r = e.data.result || {};
      toast(r.ok ? `✓ הגיליון עודכן: ${r.rows} מוסדות` : `✗ ${r.error || 'שגיאה'}`, r.ok ? '#15803d' : '#b91c1c');
    }
  });

  try {
    toast('שולף את מוסדות מחוז ' + MACHOZ + '…');
    const app = require('qlik').openApp(APP, { host: location.hostname, prefix: '/all/', port: location.port, isSecure: true });
    if (app.model.waitForOpen) await app.model.waitForOpen.promise; // מחכה שהאפליקציה תיפתח
    const em = app.model.enigmaModel;
    const tk = await em.getTablesAndKeys({ qcx: 1000, qcy: 1000 }, { qcx: 0, qcy: 0 }, 30, true, false);
    const table = tk.qtr.find(t => t.qName === T);
    const fields = table.qFields.map(f => f.qName).filter(n => !n.startsWith('$'));

    // סינון לפי מחוז בביטוי סינון (set analysis) ולא בבחירה — לא משנה את מה שמוצג למשתמש באתר
    const filter = `Count({<[${T}.MACHOZ_CHINUCH_TEUR]={'${MACHOZ}'}>} 1)`;
    const obj = await em.createSessionObject({
      qInfo: { qType: 'maklot-export' },
      qHyperCubeDef: {
        qDimensions: fields.map(n => ({ qDef: { qFieldDefs: [n] }, qNullSuppression: false })),
        qMeasures: [{ qDef: { qDef: filter } }],
        qSuppressZero: true, qSuppressMissing: false,
      },
    });
    const lay = await obj.getLayout();
    const N = lay.qHyperCube.qSize.qcy, W = fields.length + 1, H = Math.floor(10000 / W);
    const rows = [];
    for (let top = 0; top < N; top += H) {
      const p = await obj.getHyperCubeData('/qHyperCubeDef', [{ qTop: top, qLeft: 0, qWidth: W, qHeight: Math.min(H, N - top) }]);
      for (const r of p[0].qMatrix) rows.push(r.slice(0, fields.length).map(c => c.qText == null ? '' : c.qText));
      toast(`שולף… ${rows.length.toLocaleString('he-IL')} / ${N.toLocaleString('he-IL')}`);
    }
    await em.destroySessionObject(obj.id);

    // שורה אחת לכל סמל; ערכים שונים באותו שדה נשמרים מופרדים ב-"/"
    const si = fields.indexOf(T + '.SEMEL_MOSAD');
    const groups = new Map();
    for (const r of rows) { if (!groups.has(r[si])) groups.set(r[si], []); groups.get(r[si]).push(r); }
    const records = [...groups.values()].map(rs => fields.map((_, i) =>
      [...new Set(rs.map(r => r[i]).filter(v => v !== '' && v !== '-'))].join('/')));

    payload = { fields, records, pulledAt: new Date().toISOString(), note: 'עדכון מכפתור הסימנייה' };
    toast(`נשלפו ${records.length.toLocaleString('he-IL')} מוסדות — שולח לגיליון…`);
    send();
  } catch (err) {
    const msg = String(err && err.message || err);
    toast(/not connected|closed|socket/i.test(msg)
      ? '✗ החיבור לאתר פג — רעננו את הדף (F5), חכו לטעינה ולחצו שוב'
      : '✗ השליפה נכשלה: ' + msg, '#b91c1c');
  }
})();
