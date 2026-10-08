// Spotify Web API + PKCE auth, all client-side.
export const REDIRECT = location.origin + '/'
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read playlist-read-private playlist-read-collaborative user-read-recently-played user-top-read'

export const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch {} },
  del: k => { try { localStorage.removeItem(k) } catch {} },
}

export const clientId = () => import.meta.env.VITE_SPOTIFY_CLIENT_ID || store.get('cid') || ''

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function login(cid) {
  store.set('cid', cid)
  const verifier = b64(crypto.getRandomValues(new Uint8Array(64)))
  store.set('verifier', verifier)
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: cid, response_type: 'code', redirect_uri: REDIRECT,
    code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES,
  })
}

async function tokenReq(body) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), ...body }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error_description || j.error)
  store.set('at', j.access_token)
  store.set('exp', Date.now() + j.expires_in * 1000 - 60000)
  if (j.refresh_token) store.set('rt', j.refresh_token)
}

export async function handleRedirect() {
  const code = new URLSearchParams(location.search).get('code')
  if (!code) return
  history.replaceState(null, '', REDIRECT)
  await tokenReq({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: store.get('verifier') })
}

export const loggedIn = () => !!store.get('rt')
export const logout = () => ['at', 'rt', 'exp', 'device'].forEach(store.del)

let refreshing = null
async function token() {
  if (Date.now() > +store.get('exp')) {
    refreshing ??= tokenReq({ grant_type: 'refresh_token', refresh_token: store.get('rt') }).finally(() => (refreshing = null))
    try { await refreshing } catch (e) {
      // login expired or access was removed in the dashboard: back to the login screen
      if (/invalid|revoked|expired|grant/i.test(e.message)) { logout(); location.reload() }
      throw e
    }
  }
  return store.get('at')
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Spotify's development-mode quota is shared across the whole developer account. When it says
// "too many requests", everything here backs off until the time it asks for, instead of hammering it.
let blockedUntil = 0
export const rateLimited = () => Date.now() < blockedUntil
const limitError = () => {
  const s = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000))
  const e = new Error(`Spotify is limiting requests right now — try again in ${s}s`)
  e.status = 429
  return e
}

// Library pages (albums, artists, playlists, searches) rarely change: reuse answers for a few minutes
// so going back and forth doesn't spend quota.
const cache = new Map()
const CACHE_MS = 5 * 60 * 1000
const cacheable = (path, opts) => (!opts.method || opts.method === 'GET') && !/\/me\/player/.test(path)

export async function api(path, opts = {}, tries = 1) {
  const key = cacheable(path, opts) && path
  const hit = key && cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data
  if (rateLimited()) {
    if (opts.background) throw limitError()
    // a user action: wait briefly if the block is short, otherwise say how long
    if (blockedUntil - Date.now() > 3000) throw limitError()
    await sleep(blockedUntil - Date.now())
  }
  const r = await fetch(path.startsWith('http') ? path : 'https://api.spotify.com/v1' + path, {
    method: opts.method, body: opts.body,
    headers: { Authorization: 'Bearer ' + (await token()), 'Content-Type': 'application/json' },
  })
  if (r.status === 429) {
    blockedUntil = Date.now() + Math.min(120, +r.headers.get('Retry-After') || 5) * 1000
    if (tries > 0 && !opts.background && blockedUntil - Date.now() <= 3000) {
      await sleep(blockedUntil - Date.now())
      return api(path, opts, tries - 1)
    }
    throw limitError()
  }
  if (r.status === 204 || r.status === 202) return null
  // player commands can reply with a plain-text id instead of JSON
  const t = await r.text()
  let j = null
  try { j = t ? JSON.parse(t) : null } catch {}
  if (!r.ok) { const e = new Error(j?.error?.message || r.statusText || 'Request failed (' + r.status + ')'); e.status = r.status; throw e }
  if (key) cache.set(key, { at: Date.now(), data: j })
  return j
}

export async function all(path, max = 1000) {
  const out = []
  let url = path
  while (url && out.length < max) {
    const j = await api(url)
    out.push(...j.items)
    url = j.next
  }
  return out
}

export const fmt = ms => { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }
export const img = (imgs, i = 0) => imgs?.[Math.min(i, (imgs?.length || 1) - 1)]?.url || ''
export const artists = t => t?.artists?.map(a => a.name).join(', ') || ''
