/**
 * כניסה לדשבורד: קוד חד-פעמי למייל + אסימון חתום. מבוסס על המנגנון של תיק סיור (Auth.js),
 * עם הבדל אחד: רשימת המורשים וההיקף של כל אחד נמצאים בלשונית "הרשאות" בגיליון, ולא במאפייני הסקריפט.
 *
 * לשונית הרשאות — עמודות: מייל | שם | תפקיד | היקף
 *   תפקיד "מנהל" או "מחוז" → רואה הכל
 *   תפקיד "רשות"           → היקף = שם רשות (כמה רשויות מופרדות בפסיק), כפי שמופיע בעמודה "רשות" בלשונית המאוחדת
 *   תפקיד "מפקח"           → היקף = שם המפקח, כפי שמופיע בעמודות המפקח בלשונית המאוחדת
 * שינוי בלשונית חל מיד, גם על מי שכבר מחובר (כל בקשה בודקת מחדש).
 *
 * האסימון: base64(מייל|תפוגה).HMAC-SHA256 עם AUTH_SECRET (מאפיין סקריפט, נוצר לבד).
 * ניתוק כולם: למחוק את AUTH_SECRET במאפייני הסקריפט. לא כפונקציה — כל פונקציה גלובלית בלי _
 * ניתנת להפעלה מהדפדפן דרך google.script.run, גם בלי כניסה.
 */
var SHEET_PERMS = 'הרשאות';
var SESSION_DAYS = 30;
var OTP_MIN = 10;
var OTP_TRIES = 5;
var OTP_PER_HOUR = 5;
var OTP_GAP_SEC = 45;
var AUTH_APP_NAME = 'מיגון מוסדות חינוך — מחוז חיפה';

function normEmail_(e) { return String(e || '').trim().toLowerCase(); }

/** כל ההרשאות מהלשונית: { מייל: {email, name, role, scope:[...] } } */
function perms_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PERMS);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues().forEach(function (r) {
    var email = normEmail_(r[0]);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return;
    out[email] = {
      email: email,
      name: String(r[1] || '').trim(),
      role: String(r[2] || '').trim(),
      scope: String(r[3] || '').split(/[,;\n]+/).map(function (s) { return s.trim(); }).filter(String)
    };
  });
  return out;
}

function permOf_(email) {
  var p = perms_()[normEmail_(email)];
  if (!p) return null;
  if (['מנהל', 'מחוז', 'רשות', 'מפקח'].indexOf(p.role) < 0) return null;   // תפקיד לא מוכר = אין גישה
  if ((p.role === 'רשות' || p.role === 'מפקח') && !p.scope.length) return null; // היקף חסר = אין גישה
  return p;
}

function authSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('AUTH_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('AUTH_SECRET', s); }
  return s;
}
function b64_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function sign_(payload) { return b64_(Utilities.computeHmacSha256Signature(payload, authSecret_())); }
function sha_(s) { return b64_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)); }

function issueToken_(email, ms) {
  var payload = email + '|' + (Date.now() + ms);
  return b64_(Utilities.newBlob(payload).getBytes()) + '.' + sign_(payload);
}

/** מחזיר את ההרשאה אם האסימון תקף והמייל עדיין ברשימה, אחרת null */
function verifyToken_(tok) {
  tok = String(tok || '');
  var dot = tok.indexOf('.');
  if (dot < 1 || tok.length > 400) return null;
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(tok.slice(0, dot))).getDataAsString(); } catch (e) { return null; }
  if (sign_(payload) !== tok.slice(dot + 1)) return null;
  var bar = payload.lastIndexOf('|'), email = payload.slice(0, bar), exp = Number(payload.slice(bar + 1));
  if (!(exp > Date.now())) return null;
  return permOf_(email);
}

function authRequire_(tok) {
  var p = verifyToken_(tok);
  if (!p) throw new Error('AUTH');
  return p;
}

/**
 * כניסה מפורטל משרד החינוך – מחוז חיפה. הפורטל כבר אימת את המייל בקוד חד-פעמי וחתם על כרטיס מעבר
 * (PortalSSO.gs: חתימה, יעד migun, תפוגה של 2 דקות, שימוש חד-פעמי).
 * ההרשאה נשארת של הדשבורד: אסימון ניתן רק למי שיש לו שורה תקינה בלשונית "הרשאות" (permOf_ — תפקיד והיקף).
 * מחזיר אסימון כניסה רגיל, או null — ואז הדף מציג את הכניסה הרגילה.
 */
function portalLogin_(pt) {
  try {
    var email = portalHandoff_(String(pt), 'migun');
    if (!email || !permOf_(email)) return null;
    return issueToken_(email, SESSION_DAYS * 24 * 60 * 60 * 1000);
  } catch (err) {
    console.error('portalLogin_: ' + err);
    return null;
  }
}

/* ---------- מסך הכניסה ---------- */

function requestCode(email) {
  email = normEmail_(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, msg: 'כתובת המייל אינה תקינה.' };
  if (!permOf_(email)) return { ok: false, msg: 'המייל הזה אינו ברשימת המורשים. לבקשת גישה פנו למנהל הדשבורד במחוז.' };

  var cache = CacheService.getScriptCache(), key = 'otp_' + sha_(email), cntKey = 'otpn_' + sha_(email);
  var prev = cache.get(key);
  if (prev) {
    var age = (Date.now() - JSON.parse(prev).t) / 1000;
    if (age < OTP_GAP_SEC) return { ok: false, msg: 'קוד נשלח לפני רגע. אפשר לבקש קוד חדש בעוד ' + Math.ceil(OTP_GAP_SEC - age) + ' שניות.' };
  }
  var n = Number(cache.get(cntKey) || 0);
  if (n >= OTP_PER_HOUR) return { ok: false, msg: 'נשלחו יותר מדי קודים למייל הזה. נסו שוב בעוד שעה.' };

  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put(key, JSON.stringify({ h: sha_(email + '|' + code), tries: 0, t: Date.now() }), OTP_MIN * 60);
  cache.put(cntKey, String(n + 1), 60 * 60);

  MailApp.sendEmail({
    to: email,
    subject: 'קוד כניסה לדשבורד המיגון: ' + code,
    name: AUTH_APP_NAME,
    body: 'קוד הכניסה שלך לדשבורד מיגון מוסדות החינוך: ' + code + '\n\nהקוד בתוקף ' + OTP_MIN + ' דקות. אם לא ביקשת להיכנס, אפשר להתעלם מהמייל הזה.',
    htmlBody: '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:16px;color:#142231">' +
      '<p>קוד הכניסה שלך לדשבורד מיגון מוסדות החינוך — מחוז חיפה:</p>' +
      '<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">' + code + '</p>' +
      '<p style="color:#56657a">הקוד בתוקף ' + OTP_MIN + ' דקות. אם לא ביקשת להיכנס, אפשר להתעלם מהמייל הזה.</p></div>'
  });
  return { ok: true, min: OTP_MIN };
}

function verifyCode(email, code) {
  email = normEmail_(email);
  code = String(code || '').replace(/\D/g, '');
  var cache = CacheService.getScriptCache(), key = 'otp_' + sha_(email);
  var lock = LockService.getScriptLock(); lock.waitLock(5000);
  try {
    var raw = cache.get(key);
    if (!raw) return { ok: false, msg: 'הקוד פג או לא נשלח. בקשו קוד חדש.', restart: true };
    var st = JSON.parse(raw);
    if (st.h !== sha_(email + '|' + code)) {
      st.tries++;
      if (st.tries >= OTP_TRIES) { cache.remove(key); return { ok: false, msg: 'יותר מדי ניסיונות שגויים. בקשו קוד חדש.', restart: true }; }
      var left = Math.max(1, Math.round(OTP_MIN * 60 - (Date.now() - st.t) / 1000));
      cache.put(key, JSON.stringify(st), left);
      return { ok: false, msg: 'הקוד שגוי. נותרו ' + (OTP_TRIES - st.tries) + ' ניסיונות.' };
    }
    cache.remove(key);
  } finally { lock.releaseLock(); }
  if (!permOf_(email)) return { ok: false, msg: 'המייל הזה אינו ברשימת המורשים.', restart: true };
  return { ok: true, s: issueToken_(email, SESSION_DAYS * 24 * 60 * 60 * 1000) };
}

/* ---------- מהעורך ---------- */

/** הפעלה ראשונה (ואחרי כל שינוי הרשאות OAuth): מאשר שליחת מייל, יוצר את הסוד ואת לשונית ההרשאות */
// המנהל הראשון. קבוע ולא Session.getEffectiveUser — זה דורש הרשאת userinfo.email שלא ביקשנו
var OWNER_EMAIL = '1002026036@edu-haifa.org.il';

function authSetup() {
  authSecret_();
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_PERMS) || ss.insertSheet(SHEET_PERMS);
  // אידמפוטנטי: משלים לשונית שנוצרה חלקית, ולא נוגע בשורות שכבר קיימות
  sh.getRange(1, 1, 1, 4).setValues([['מייל', 'שם', 'תפקיד', 'היקף']]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setRightToLeft(true);
  sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['מנהל', 'מחוז', 'רשות', 'מפקח'], true).setAllowInvalid(false).build());
  if (!perms_()[OWNER_EMAIL]) sh.appendRow([OWNER_EMAIL, 'מנהל המערכת', 'מנהל', 'הכל']);
  console.log('מכסת מיילים שנותרה היום: ' + MailApp.getRemainingDailyQuota());
  console.log('מורשים: ' + Object.keys(perms_()).length);
}
