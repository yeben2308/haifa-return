// טעינה ראשונית של נתוני המקלוט (data/maklot_initial.json) ללשונית "מקלוט" בגיליון.
// המפתח נקרא מ-apps-script/Config.gs ואינו מודפס. הסקריפט בצד גוגל מסרב לדרוס לשונית שכבר מלאה.
// הרצה: node push_maklot.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WEBAPP = 'https://script.google.com/macros/s/AKfycbwWhfOyGFvlxcvWJsReJIzlJ9AIye4VLx3ghVCprqO6maw2UKDmuneEJe29Om3AzJEqvQ/exec';

const cfg = readFileSync(join(here, 'apps-script', 'Config.gs'), 'utf8');
const token = (cfg.match(/PUSH_TOKEN\s*=\s*"([^"]+)"/) || [])[1];
if (!token) throw new Error('לא נמצא PUSH_TOKEN ב-Config.gs');

const data = JSON.parse(readFileSync(join(here, 'data', 'maklot_initial.json'), 'utf8'));
const body = JSON.stringify({ token, type: 'maklot', note: 'טעינה ראשונית מקובץ מוסדות-מקלוט.xlsx', ...data });

const res = await fetch(WEBAPP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, redirect: 'follow' });
const text = await res.text();
console.log(res.status, text.slice(0, 300));
