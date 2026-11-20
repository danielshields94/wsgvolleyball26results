import { getStore } from '@netlify/blobs';
// Netlify Function: serves /api/data, /api/login and /api/write for the WSG Volleyball site.
// Results are stored in Netlify Blobs. The staff password is the EDIT_PASSWORD environment variable.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const MAX_BODY = 64 * 1024;          // largest request accepted (bytes)
const TOKEN_HOURS = 14;              // how long a staff login lasts
const SCORE_KEY = /^scores\/\d{8}$/;
const PLAYER_KEY = /^players\/g1[69]-[a-z]{3,4}$/;
const INFO_KEY = /^info\/main$/;
const ORDER_KEY = /^order\/g1[69]-[AB]$/;

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

const sha = (s) => createHash('sha256').update(String(s)).digest();
const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret) {
  const body = b64u(JSON.stringify(payload));
  const mac = b64u(createHmac('sha256', secret).update(body).digest());
  return body + '.' + mac;
}
function verify(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [body, mac] = token.split('.');
  const expect = b64u(createHmac('sha256', secret).update(body).digest());
  const a = Buffer.from(mac), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return typeof p.exp === 'number' && p.exp > Date.now(); }
  catch { return false; }
}

// Light clean-up so only plain, size-limited JSON is stored.
function clean(v, depth = 0) {
  if (depth > 6) return null;
  if (typeof v === 'string') return v.slice(0, 4000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'boolean' || v === null) return v;
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => clean(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).slice(0, 60)) if (/^[A-Za-z0-9_]{1,40}$/.test(k)) o[k] = clean(v[k], depth + 1);
    return o;
  }
  return null;
}

async function readAll(store) {
  const out = { scores: {}, players: {}, info: {}, order: {}, rev: 0 };
  const { blobs } = await store.list();
  await Promise.all(blobs.map(async ({ key }) => {
    const doc = await store.get(key, { type: 'json' });
    if (!doc || typeof doc !== 'object') return;
    const rev = typeof doc._rev === 'number' ? doc._rev : 0;
    if (rev > out.rev) out.rev = rev;
    delete doc._rev;
    if (SCORE_KEY.test(key)) out.scores[key.slice(7)] = doc;
    else if (PLAYER_KEY.test(key)) out.players[key.slice(8)] = doc;
    else if (INFO_KEY.test(key)) out.info = doc;
    else if (ORDER_KEY.test(key)) out.order[key.slice(6)] = doc;
  }));
  // Deletions also move the revision forward.
  const meta = await store.get('_meta/rev', { type: 'json' }).catch(() => null);
  if (meta && typeof meta.rev === 'number' && meta.rev > out.rev) out.rev = meta.rev;
  return out;
}

function createHandler({ getStore, env }) {
  return async function handler(req) {
    const url = new URL(req.url);
    const action = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
    const store = getStore();
    const secret = env('SESSION_SECRET');
    const password = env('EDIT_PASSWORD');

    try {
      // ---- Public: current results, squads and details ----
      if (action === 'data' && req.method === 'GET') {
        const data = await readAll(store);
        return json(200, data, {
          // Browsers always re-check; Netlify's CDN may answer repeat requests for a few seconds.
          'cache-control': 'public, max-age=0, must-revalidate',
          'netlify-cdn-cache-control': 'public, s-maxage=5, stale-while-revalidate=10',
        });
      }

      if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
      const text = await req.text();
      if (text.length > MAX_BODY) return json(413, { error: 'too_large' });
      let body; try { body = JSON.parse(text || '{}'); } catch { return json(400, { error: 'bad_json' }); }

      if (!secret || !password) return json(503, { error: 'not_configured', message: 'Set EDIT_PASSWORD and SESSION_SECRET in Netlify, then redeploy.' });

      // ---- Staff login ----
      if (action === 'login') {
        const ok = timingSafeEqual(sha(body.password ?? ''), sha(password));
        if (!ok) { await new Promise((r) => setTimeout(r, 900)); return json(401, { error: 'wrong_password' }); }
        const exp = Date.now() + TOKEN_HOURS * 3600e3;
        return json(200, { token: sign({ exp }, secret), exp }, { 'cache-control': 'no-store' });
      }

      // ---- Staff save / delete ----
      if (action === 'write') {
        if (!verify(body.token, secret)) return json(401, { error: 'not_signed_in' });
        const path = String(body.path || '');
        if (!(SCORE_KEY.test(path) || PLAYER_KEY.test(path) || INFO_KEY.test(path) || ORDER_KEY.test(path))) return json(400, { error: 'bad_path' });
        const rev = Date.now();
        if (body.delete === true) {
          await store.delete(path);
          await store.setJSON('_meta/rev', { rev });
        } else {
          const data = clean(body.data);
          if (!data || typeof data !== 'object' || Array.isArray(data)) return json(400, { error: 'bad_data' });
          data._rev = rev;
          await store.setJSON(path, data);
        }
        const fresh = await readAll(store);
        if (fresh.rev < rev) fresh.rev = rev;
        return json(200, fresh, { 'cache-control': 'no-store' });
      }

      return json(404, { error: 'not_found' });
    } catch (e) {
      console.error(e);
      return json(500, { error: 'server_error' });
    }
  };
}

const handler = createHandler({
  getStore: () => getStore({ name: 'wsg-volleyball', consistency: 'strong' }),
  env: (k) => (globalThis.Netlify?.env?.get(k)) ?? process.env[k],
});

export default handler;

export const config = { path: ['/api/data', '/api/login', '/api/write'] };
