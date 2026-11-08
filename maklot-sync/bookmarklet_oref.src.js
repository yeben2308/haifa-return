// כפתור סימנייה: עדכון הנחיות פיקוד העורף בגיליון המקלוט, מתוך אתר פיקוד העורף (oref.org.il).
// האתר חוסם דפדפנים אוטומטיים, ולכן העדכון רץ בדפדפן הרגיל של המשתמש, בלחיצה.
// רשימת הישובים מגיעה מהגיליון דרך דף ההעלאה — כך היא תמיד עדכנית.
(async () => {
  const UP = 'https://script.google.com/a/macros/edu-haifa.org.il/s/AKfycbwWhfOyGFvlxcvWJsReJIzlJ9AIye4VLx3ghVCprqO6maw2UKDmuneEJe29Om3AzJEqvQ/exec?page=upload';
  const toast = (t, color) => {
    let el = document.getElementById('maklotToast');
    if (!el) {
      el = document.createElement('div'); el.id = 'maklotToast';
      el.style.cssText = 'position:fixed;top:14px;left:14px;z-index:2147483647;padding:12px 16px;border-radius:8px;font:bold 15px Arial;color:#fff;max-width:440px;direction:rtl;box-shadow:0 2px 8px rgba(0,0,0,.25)';
      document.body.appendChild(el);
    }
    el.style.background = color || '#1d4ed8'; el.textContent = t;
  };
  if (location.hostname !== 'www.oref.org.il') { toast('יש להפעיל את הכפתור מתוך אתר פיקוד העורף (oref.org.il)', '#b91c1c'); return; }

  window.open(UP, 'maklotUpload');
  let hello = false;
  window.addEventListener('message', async e => {
    let h = ''; try { h = new URL(e.origin).hostname; } catch (_) {}
    if (!h.endsWith('.googleusercontent.com') || !e.data) return;
    if (e.data.type === 'maklot-ready' && !hello) { hello = true; e.source.postMessage({ type: 'oref-hello' }, e.origin); toast('מתחבר לגיליון…'); }
    if (e.data.type === 'oref-request') {
      const { yishuvim, aliases } = e.data.result;
      try {
        toast(`שולף מדיניות התגוננות ל-${yishuvim.length} ישובים…`);
        const payload = await collect(yishuvim, aliases);
        e.source.postMessage({ type: 'oref-data', payload }, e.origin);
        toast('שולח לגיליון…');
      } catch (err) { toast('✗ השליפה נכשלה: ' + (err && err.message || err), '#b91c1c'); }
    }
    if (e.data.type === 'oref-done') {
      const r = e.data.result || {};
      toast(r.ok ? `✓ הנחיות פיקוד העורף עודכנו ל-${r.rows} ישובים` : `✗ ${r.error || 'שגיאה'}`, r.ok ? '#15803d' : '#b91c1c');
    }
  });

  async function collect(yishuvim, aliases) {
    const norm = s => String(s).replace(/\(.*?\)/g, '').replace(/קריית/g, 'קרית').replace(/["'״׳`]/g, '').replace(/[-–־]/g, ' ').replace(/\s+/g, ' ').trim();
    const cities = await fetch('/districts/cities_heb.json').then(r => r.json());
    const idx = {};
    cities.forEach(c => { const k = norm(c.label.split(' | ')[0]); (idx[k] = idx[k] || []).push(c.label); });
    const policy = await fetch('/api/v1/restrictionsPolicy/heb').then(r => r.json());
    const out = [], cache = {};
    let n = 0;
    for (const y of yishuvim) {
      const al = aliases[y];
      const key = al ? al.key : (idx[norm(y)] || [])[0];
      if (!key) { out.push({ yishuv: y, key: '', error: 'לא נמצא ישוב תואם בפיקוד העורף' }); continue; }
      if (!cache[key]) {
        const r = await fetch('/api/v1/restrictionsPolicy/data/heb/' + encodeURIComponent(key));
        cache[key] = r.ok ? await r.json() : { error: 'HTTP ' + r.status };
        await new Promise(res => setTimeout(res, 150));
      }
      const j = cache[key];
      toast(`שולף… ${++n} / ${yishuvim.length}`);
      if (j.error) { out.push({ yishuv: y, key, error: j.error }); continue; }
      const times = (j.areas || []).map(a => Number(a.migunTime)).filter(x => isFinite(x));
      const lit = [...new Set((j.areas || []).map(a => a.literalMigunTime).filter(Boolean))];
      out.push({
        yishuv: y, key, approx: al && al.approx ? al.approx : '', area: j.areaHeader || key, color: j.color || '',
        edu: (j.notes || [])[0] || '', gather: (j.notes || [])[1] || '', work: (j.notes || [])[2] || '',
        tMin: times.length ? Math.min(...times) : '', tMax: times.length ? Math.max(...times) : '', tText: lit.join(' / '),
        zones: (j.areas || []).map(a => a.displayName + ' (' + (a.literalMigunTime || a.migunTime + ' שנ׳') + ')').join(' ; '),
        alerts24: j.lastDayAlertCount ?? '', updates24: j.lastDayUpdateCount ?? '',
      });
    }
    const strip = x => String(x || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return { rows: out, meta: { level: (policy.guidelinesContainer || {}).title || '', since: strip(policy.dateRangeText) }, pulledAt: new Date().toISOString() };
  }
})();
