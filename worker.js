// Cloudflare Worker — Amplop Kasih
// /api  -> proxy ke Google Apps Script (URL GAS disembunyikan sebagai secret)
// /v/ID -> halaman penonton (SPA index.html)
// lainnya -> file statis di ./public
const ALLOWED = ['register', 'verify', 'login', 'saveCard', 'listCards', 'getCard', 'deleteCard', 'sendCard'];
const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api') {
      if (request.method !== 'POST') return json({ ok: false, error: 'Method tidak diizinkan' }, 405);
      let body;
      try { body = await request.json(); } catch { return json({ ok: false, error: 'Body tidak valid' }, 400); }
      if (!ALLOWED.includes(body.action)) return json({ ok: false, error: 'Aksi tidak dikenal' }, 400);
      body._origin = url.origin;
      body._key = env.SHARED_KEY || '';
      try {
        const res = await fetch(env.GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
          redirect: 'follow'
        });
        const text = await res.text();
        try { JSON.parse(text); } catch { return json({ ok: false, error: 'Backend tidak merespons dengan benar (cek deployment Apps Script)' }, 502); }
        return new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      } catch (e) {
        return json({ ok: false, error: 'Gagal menghubungi backend' }, 502);
      }
    }

    if (url.pathname.startsWith('/v/')) {
      return env.ASSETS.fetch(new Request(new URL('/', url), { method: 'GET', headers: request.headers }));
    }
    return env.ASSETS.fetch(request);
  }
};
