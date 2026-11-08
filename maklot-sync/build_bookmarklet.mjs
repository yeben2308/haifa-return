// בונה את שני כפתורי הסימנייה:
//   bookmarklet.src.js      → עדכון נתוני מוסדות (מתוך "הכל אודות מוסד") — גיבוי ידני; העדכון היומי אוטומטי
//   bookmarklet_oref.src.js → עדכון הנחיות פיקוד העורף (מתוך oref.org.il) — האתר חוסם אוטומציה
// פלט: bookmarklet.txt, bookmarklet_oref.txt, install_bookmarklet.html
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
function build(src, out) {
  const code = readFileSync(join(here, src), 'utf8')
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))
    .map(l => l.replace(/\s+\/\/ .*$/, ''))
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');
  new Function(code); // בדיקת תחביר
  const url = 'javascript:' + encodeURIComponent(code);
  writeFileSync(join(here, out), url);
  return url;
}
const odot = build('bookmarklet.src.js', 'bookmarklet.txt');
const oref = build('bookmarklet_oref.src.js', 'bookmarklet_oref.txt');
const q = u => u.replace(/"/g, '&quot;');

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>כפתורי עדכון — מיגון חיפה</title>
<style>body{font-family:Arial,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.7;color:#1f2937}
a.bm{display:inline-block;padding:12px 20px;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;margin:6px 0}
.oref{background:#f07a1a;color:#141414!important}.odot{background:#161616}h2{margin-top:28px}</style></head><body>
<h1>כפתורי עדכון לגיליון המיגון</h1>
<p>הציגו את סרגל הסימניות ב-Chrome (Ctrl+Shift+B) וגררו אליו את הכפתורים.</p>
<h2>הנחיות פיקוד העורף</h2>
<p><a class="bm oref" href="${q(oref)}">עדכון פיקוד העורף</a></p>
<p>פתחו כל דף באתר <a href="https://www.oref.org.il/heb/restriction-policy/${encodeURIComponent('חיפה | אזור המפרץ')}">פיקוד העורף</a> ולחצו על הכפתור.
ייפתח חלון "עדכון נתוני מוסדות"; הודעה ירוקה = עודכן. מומלץ פעם ביום ובכל שינוי מדיניות.</p>
<h2>נתוני מוסדות (גיבוי)</h2>
<p><a class="bm odot" href="${q(odot)}">עדכון מקלוט חיפה</a></p>
<p>נתוני המוסדות מתעדכנים אוטומטית כל בוקר. הכפתור הזה רק לעדכון ידני באמצע היום, מתוך
<a href="https://infocenter.education.gov.il/all/extensions/Odot_M/Odot_M.html#odot">הכל אודות מוסד</a>.</p>
<p>בפעם הראשונה בכל דפדפן יש להזין בחלון את מפתח העדכון.</p>
</body></html>`;
writeFileSync(join(here, 'install_bookmarklet.html'), html);
console.log(`✓ bookmarklet.txt (${odot.length}), bookmarklet_oref.txt (${oref.length}), install_bookmarklet.html`);
