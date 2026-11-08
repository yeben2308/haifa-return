/**
 * PortalSSO.js — להעתיק לכל אפליקציה שצריכה לקבל כניסה מהפורטל. הקובץ הזה לא רץ בפורטל עצמו
 * (הוא מוחרג ב-.claspignore של הפורטל).
 *
 * הגדרה באפליקציה (Project Settings ← Script Properties):
 *   PORTAL_SSO_SECRET = המפתח הייעודי של האפליקציה הזו, כפי שמציג ssoShowAppKeys() בעורך הפורטל (לא SSO_SECRET עצמו)
 *   ובקטלוג של הפורטל (Apps.js): sso: true, ו-id זהה למזהה שמועבר כאן כ-appId.
 *
 * שימוש ב-doGet של האפליקציה:
 *   var email = portalHandoff_(e.parameter.pt, 'tik-haifa');
 *   if (email && isAllowed_(email)) { ... להנפיק את אסימון הכניסה של האפליקציה עצמה ולהמשיך ... }
 *
 * מחזיר את המייל אם הכרטיס תקף, אחרת null. בודק: חתימה, גרסה h1, שהכרטיס הונפק לאפליקציה הזו,
 * תפוגה, ושימוש חד-פעמי (כרטיס שכבר נוצל נדחה — מי שהעתיק את הכתובת מההיסטוריה לא ייכנס איתו).
 * לא בודק את רשימת המורשים של האפליקציה: זה תפקידו של מי שקורא לפונקציה.
 * אחרי קליטה מוצלחת: להעביר את הדפדפן לכתובת בלי pt (למשל להחזיר דף שמפנה עם location.replace), כדי שהכרטיס לא יישאר בהיסטוריה.
 */
function portalHandoff_(pt, appId) {
  pt = String(pt || '');
  var dot = pt.indexOf('.');
  if (dot < 1 || pt.length > 500) return null;
  var secret = PropertiesService.getScriptProperties().getProperty('PORTAL_SSO_SECRET');
  if (!secret) return null;
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(pt.slice(0, dot))).getDataAsString(); } catch (e) { return null; }
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret)).replace(/=+$/, '');
  var got = pt.slice(dot + 1), diff = sig.length ^ got.length;   // השוואה בזמן קבוע
  for (var i = 0; i < Math.max(sig.length, got.length); i++) diff |= (sig.charCodeAt(i) || 0) ^ (got.charCodeAt(i) || 0);
  if (diff !== 0) return null;
  var parts = payload.split('|');            // h1 | מייל | אפליקציה | תפוגה | nonce
  if (parts.length !== 5 || parts[0] !== 'h1' || parts[2] !== appId) return null;
  var exp = Number(parts[3]);
  // תפוגה בעתיד, אבל לא רחוקה מדי: מגן מפני כרטיס שהונפק עם תוקף ארוך בטעות
  if (!(exp > Date.now()) || exp - Date.now() > 10 * 60 * 1000) return null;
  var cache = CacheService.getScriptCache(), used = 'pt_' + sig.slice(0, 40);
  var lock = LockService.getScriptLock(); lock.waitLock(5000);
  try {
    if (cache.get(used)) return null;
    cache.put(used, '1', 15 * 60);
  } finally { lock.releaseLock(); }
  return String(parts[1]).trim().toLowerCase();
}
