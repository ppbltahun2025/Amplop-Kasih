/**
 * Amplop Kasih — Backend (Google Apps Script)
 * Auth: username + email + password (sama seperti MoneyLedger, tabel "Users" kamu tetap dipakai).
 * Data kartu: tersimpan sebagai file JSON di folder Drive per akun + index di tab "Cards".
 *
 * SETUP:
 *  1. Project Settings -> Script properties:
 *       APP_ORIGIN = https://domain-worker-kamu.workers.dev   (tanpa slash di akhir)
 *       SHARED_KEY = (string acak panjang; sama dengan secret SHARED_KEY di Worker)
 *  2. Deploy -> New deployment -> Web app -> Execute as: Me, Who has access: Anyone
 *  3. Salin URL /exec -> jadikan secret GAS_URL di Cloudflare Worker.
 *  4. Jalankan fungsi authorize() sekali dari editor agar izin Drive & Mail diberikan.
 */

const MASTER_SHEET_ID = '11Wxc4dUQFk4XnLrB81m3B2tTQl80fUPJB5SOdI4hJRA';
const USERS = 'Users', CARDS = 'Cards';
const COLS = ['username', 'email', 'passwordHash', 'salt', 'verified', 'verificationToken', 'sessionToken', 'spreadsheetId', 'createdAt', 'folderId'];
const CARD_COLS = ['id', 'username', 'fileId', 'title', 'recipient', 'sender', 'createdAt', 'updatedAt'];
const PROP = PropertiesService.getScriptProperties();

function authorize() {
  DriveApp.getRootFolder(); MailApp.getRemainingDailyQuota(); getSheet(USERS, COLS); getSheet(CARDS, CARD_COLS);
}

// ---------- Sheet helpers ----------
function getSheet(name, cols) {
  const ss = SpreadsheetApp.openById(MASTER_SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(cols);
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), cols.length);
  const head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (!cols.every((c, i) => head[i] === c)) sheet.getRange(1, 1, 1, cols.length).setValues([cols]);
  return sheet;
}
function findRow(sheet, cols, name, value) {
  if (value === '' || value == null) return null;
  const data = sheet.getDataRange().getValues();
  const idx = cols.indexOf(name);
  for (let i = 1; i < data.length; i++) if (String(data[i][idx]) === String(value)) return { rowNum: i + 1, row: data[i] };
  return null;
}
function rowToObj(cols, row) { const o = {}; cols.forEach((c, i) => (o[c] = row[i])); return o; }
const isTrue = v => v === true || String(v).toLowerCase() === 'true';
const str = (v, n) => String(v || '').slice(0, n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = v => { v = String(v || ''); return v.indexOf('data:image/jpeg;base64,') === 0 && v.length < 3000000 ? v : ''; };

function hashPassword(password, salt) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ':' + salt);
  return d.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}
function randomToken() { return Utilities.getUuid().replace(/-/g, ''); }
function baseUrl(p) { return PROP.getProperty('APP_ORIGIN') || p._origin || ''; }

// ---------- Auth ----------
function auth(p) {
  const sheet = getSheet(USERS, COLS);
  const f = findRow(sheet, COLS, 'sessionToken', p.sessionToken);
  if (!f) return null;
  const user = rowToObj(COLS, f.row);
  return isTrue(user.verified) ? { sheet, rowNum: f.rowNum, user } : null;
}
function userFolder(a) {
  if (a.user.folderId) { try { return DriveApp.getFolderById(a.user.folderId); } catch (e) {} }
  const folder = DriveApp.createFolder('Amplop Kasih — ' + a.user.username);
  try { folder.addEditor(a.user.email); } catch (e) {}
  a.sheet.getRange(a.rowNum, COLS.indexOf('folderId') + 1).setValue(folder.getId());
  a.user.folderId = folder.getId();
  return folder;
}

function register(p) {
  const username = String(p.username || '').trim();
  const email = String(p.email || '').trim().toLowerCase();
  const password = String(p.password || '');
  if (!username || !email || !password) return { ok: false, error: 'Username, email, dan password wajib diisi' };
  if (password.length < 6) return { ok: false, error: 'Password minimal 6 karakter' };
  if (!/^[\w.-]{3,30}$/.test(username)) return { ok: false, error: 'Username 3-30 karakter (huruf, angka, . _ -)' };
  const sheet = getSheet(USERS, COLS);
  if (findRow(sheet, COLS, 'username', username)) return { ok: false, error: 'Username sudah dipakai' };
  if (findRow(sheet, COLS, 'email', email)) return { ok: false, error: 'Email sudah terdaftar' };

  const salt = randomToken(), token = randomToken();
  sheet.appendRow([username, email, hashPassword(password, salt), salt, false, token, '', '', new Date().toISOString(), '']);
  const link = baseUrl(p) + '/?verify=' + token;
  try {
    MailApp.sendEmail({
      to: email, subject: 'Verifikasi akun Amplop Kasih',
      htmlBody: '<p>Halo <b>' + esc(username) + '</b>,</p><p>Klik tombol untuk mengaktifkan akun Amplop Kasih kamu:</p>' +
        '<p><a href="' + link + '" style="background:#7a2438;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;">Verifikasi Akun</a></p><p>Atau salin link: ' + link + '</p>'
    });
  } catch (e) { return { ok: false, error: 'Gagal mengirim email verifikasi: ' + e }; }
  return { ok: true, message: 'Cek email kamu untuk verifikasi akun.' };
}

function verify(p) {
  const sheet = getSheet(USERS, COLS);
  const f = findRow(sheet, COLS, 'verificationToken', p.token);
  if (!f) return { ok: false, error: 'Link tidak valid atau sudah dipakai.' };
  const user = rowToObj(COLS, f.row);
  if (isTrue(user.verified)) return { ok: true, message: 'Akun sudah terverifikasi. Silakan masuk.' };
  sheet.getRange(f.rowNum, COLS.indexOf('verified') + 1).setValue(true);
  userFolder({ sheet, rowNum: f.rowNum, user });
  return { ok: true, message: 'Akun berhasil diverifikasi! Silakan masuk.' };
}

function login(p) {
  const id = String(p.identifier || '').trim();
  const sheet = getSheet(USERS, COLS);
  const f = findRow(sheet, COLS, 'username', id) || findRow(sheet, COLS, 'email', id.toLowerCase());
  if (!f) return { ok: false, error: 'Akun tidak ditemukan' };
  const user = rowToObj(COLS, f.row);
  if (!isTrue(user.verified)) return { ok: false, error: 'Akun belum diverifikasi. Cek email kamu.' };
  if (hashPassword(String(p.password || ''), user.salt) !== user.passwordHash) return { ok: false, error: 'Password salah' };
  const sessionToken = randomToken();
  sheet.getRange(f.rowNum, COLS.indexOf('sessionToken') + 1).setValue(sessionToken);
  return { ok: true, user: { username: user.username, email: user.email, sessionToken } };
}

// ---------- Kartu ----------
function mailCard(p, to, from, recipient, id) {
  const link = baseUrl(p) + '/v/' + id;
  MailApp.sendEmail({
    to: to, subject: 'Buah tangan pernikahan dari ' + from,
    htmlBody: '<p>Untuk <b>' + esc(recipient) + '</b>,</p><p>' + esc(from) + ' mengirimkan amplop buah tangan untuk pernikahan kalian.</p>' +
      '<p><a href="' + link + '" style="background:#7a2438;color:#fff;padding:10px 18px;text-decoration:none;border-radius:4px;">Buka Amplop</a></p><p>' + link + '</p>'
  });
}

function saveCard(p) {
  const a = auth(p);
  if (!a) return { ok: false, error: 'Sesi tidak valid, silakan login ulang' };
  const c = p.card;
  if (!c || typeof c !== 'object') return { ok: false, error: 'Data tidak valid' };
  const card = {
    theme: str(c.theme, 20), recipient: str(c.recipient, 80), from: str(c.from, 80),
    envHtml: str(c.envHtml, 6000), msgHtml: str(c.msgHtml, 20000), photo: img(c.photo), proof: img(c.proof)
  };
  const json = JSON.stringify(card), title = 'Amplop untuk ' + card.recipient, now = new Date().toISOString();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let id;
  try {
    const sheet = getSheet(CARDS, CARD_COLS);
    let f = p.id ? findRow(sheet, CARD_COLS, 'id', p.id) : null;
    if (f && f.row[1] !== a.user.username) f = null;
    if (f) {
      id = String(p.id);
      DriveApp.getFileById(f.row[2]).setContent(json);
      sheet.getRange(f.rowNum, 4, 1, 3).setValues([[title, card.recipient, card.from]]);
      sheet.getRange(f.rowNum, 8).setValue(now);
    } else {
      id = randomToken().slice(0, 14);
      const file = userFolder(a).createFile(id + '.json', json, MimeType.PLAIN_TEXT);
      sheet.appendRow([id, a.user.username, file.getId(), title, card.recipient, card.from, now, now]);
    }
  } finally { lock.releaseLock(); }
  let mailed = false;
  if (p.emailTo) { try { mailCard(p, String(p.emailTo).trim(), card.from, card.recipient, id); mailed = true; } catch (e) {} }
  return { ok: true, id, mailed };
}

function listCards(p) {
  const a = auth(p);
  if (!a) return { ok: false, error: 'Sesi tidak valid, silakan login ulang' };
  const rows = getSheet(CARDS, CARD_COLS).getDataRange().getValues().slice(1)
    .filter(r => r[1] === a.user.username).map(r => rowToObj(CARD_COLS, r));
  rows.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  return { ok: true, cards: rows.map(r => ({ id: r.id, title: r.title, recipient: r.recipient, createdAt: r.createdAt })), folderUrl: a.user.folderId ? 'https://drive.google.com/drive/folders/' + a.user.folderId : '' };
}

function getCard(p) {
  const f = findRow(getSheet(CARDS, CARD_COLS), CARD_COLS, 'id', p.id);
  if (!f) return { ok: false, error: 'Amplop tidak ditemukan' };
  try { return { ok: true, card: JSON.parse(DriveApp.getFileById(f.row[2]).getBlob().getDataAsString()) }; }
  catch (e) { return { ok: false, error: 'Amplop tidak dapat dibuka' }; }
}

function ownCard(p) {
  const a = auth(p);
  if (!a) return null;
  const sheet = getSheet(CARDS, CARD_COLS);
  const f = findRow(sheet, CARD_COLS, 'id', p.id);
  return f && f.row[1] === a.user.username ? { sheet, f } : null;
}
function deleteCard(p) {
  const o = ownCard(p);
  if (!o) return { ok: false, error: 'Tidak diizinkan' };
  try { DriveApp.getFileById(o.f.row[2]).setTrashed(true); } catch (e) {}
  o.sheet.deleteRow(o.f.rowNum);
  return { ok: true };
}
function sendCard(p) {
  const o = ownCard(p);
  if (!o) return { ok: false, error: 'Tidak diizinkan' };
  const to = String(p.emailTo || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: 'Email tidak valid' };
  try { mailCard(p, to, o.f.row[5], o.f.row[4], p.id); } catch (e) { return { ok: false, error: 'Gagal mengirim email: ' + e }; }
  return { ok: true };
}

// ---------- HTTP ----------
function jsonOut(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return jsonOut({ ok: true, service: 'Amplop Kasih' }); }
function doPost(e) {
  let p;
  try { p = JSON.parse(e.postData.contents); } catch (err) { p = e.parameter || {}; }
  try {
    const key = PROP.getProperty('SHARED_KEY');
    if (key && p._key !== key) return jsonOut({ ok: false, error: 'Akses ditolak' });
    const actions = { register, verify, login, saveCard, listCards, getCard, deleteCard, sendCard };
    return jsonOut(actions[p.action] ? actions[p.action](p) : { ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) { return jsonOut({ ok: false, error: String(err) }); }
}
