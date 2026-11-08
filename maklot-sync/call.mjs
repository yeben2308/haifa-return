// פקודות ניהול לגיליון: node call.mjs rebuild | stats
// המפתח נקרא מ-apps-script/Config.gs ואינו מודפס.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const WEBAPP = 'https://script.google.com/macros/s/AKfycbwWhfOyGFvlxcvWJsReJIzlJ9AIye4VLx3ghVCprqO6maw2UKDmuneEJe29Om3AzJEqvQ/exec';
const token = (readFileSync(join(here, 'apps-script', 'Config.gs'), 'utf8').match(/PUSH_TOKEN\s*=\s*"([^"]+)"/) || [])[1];
const type = process.argv[2];
if (!type) { console.error('שימוש: node call.mjs rebuild|stats'); process.exit(1); }

const res = await fetch(WEBAPP, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ token, type }) });
const txt = await res.text();
try { console.log(JSON.stringify(JSON.parse(txt), null, 1)); } catch { console.log(res.status, txt.slice(0, 400)); }
