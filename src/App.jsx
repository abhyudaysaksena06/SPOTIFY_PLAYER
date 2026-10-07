import { useCallback, useEffect, useState } from 'react'
import { REDIRECT, all, api, artists, clientId, fmt, handleRedirect, img, loggedIn, login, logout } from './spotify'
import { usePlayer } from './usePlayer'
import Player from './components/Player'
import Vinyl from './components/Vinyl'

const card = (x, sub) => ({ id: x.id, type: x.type, name: x.name, image: img(x.images, 1), sub })

/* ---------- data loaders for each view ---------- */
const loaders = {
  albums: async () => ({ title: 'My Albums', cards: (await all('/me/albums?limit=50')).map(x => card(x.album, artists(x.album))) }),
  liked: async () => ({ title: 'Liked Songs', tracks: (await all('/me/tracks?limit=50', 2000)).map(x => x.track) }),
  recent: async () => ({ title: 'Recently Played', tracks: (await api('/me/player/recently-played?limit=50')).items.map(x => x.track) }),
  top: async () => ({ title: 'Your Top Tracks', tracks: (await api('/me/top/tracks?limit=50')).items }),
  album: async id => {
    const a = await api('/albums/' + id)
    const tracks = (await all(`/albums/${id}/tracks?limit=50`)).map(t => ({ ...t, album: a }))
    return { title: a.name, hero: { kind: 'Album · ' + a.release_date?.slice(0, 4), image: img(a.images), sub: `${artists(a)} · ${a.total_tracks} songs`, uri: a.uri }, tracks, ctx: a.uri, hideAlbum: true }
  },
  playlist: async id => {
    const p = await api(`/playlists/${id}?fields=name,uri,images,owner.display_name`)
    const tracks = (await all(`/playlists/${id}/tracks?limit=100`, 3000)).map(x => x.track).filter(t => t?.uri && !t.uri.startsWith('spotify:local'))
    return { title: p.name, hero: { kind: 'Playlist', image: img(p.images), sub: `${p.owner.display_name} · ${tracks.length} songs`, uri: p.uri }, tracks, ctx: p.uri }
  },
  artist: async id => {
    const [a, top, al] = await Promise.all([api('/artists/' + id), api(`/artists/${id}/top-tracks?market=from_token`), api(`/artists/${id}/albums?include_groups=album,single&limit=50`)])
    return { title: a.name, hero: { kind: 'Artist', image: img(a.images), sub: `${(a.followers?.total || 0).toLocaleString()} followers`, uri: a.uri }, tracks: top.tracks, cardsTitle: 'Discography', cards: al.items.map(x => card(x, x.release_date.slice(0, 4) + ' · ' + x.album_type)) }
  },
  search: async q => {
    const j = await api('/search?' + new URLSearchParams({ q, type: 'track,album,artist,playlist', limit: 20 }))
    return {
      title: `Results for "${q}"`, tracks: j.tracks.items,
      sections: [
        ['Artists', j.artists.items.map(x => card(x, 'Artist'))],
        ['Albums', j.albums.items.map(x => card(x, artists(x)))],
        ['Playlists', j.playlists.items.filter(Boolean).map(x => card(x, x.owner?.display_name))],
      ],
    }
  },
}

export default function App() {
  const [authed, setAuthed] = useState(loggedIn())
  const [boot, setBoot] = useState(true)
  const [msg, setMsg] = useState('')
  const toast = useCallback(m => { setMsg(m); clearTimeout(toast.t); toast.t = setTimeout(() => setMsg(''), 3500) }, [])
  useEffect(() => {
    handleRedirect().then(() => setAuthed(loggedIn())).catch(e => toast(e.message)).finally(() => setBoot(false))
  }, [toast])
  if (boot) return null
  return <>
    {authed ? <Console toast={toast} /> : <Login />}
    {msg && <div className="toast">{msg}</div>}
  </>
}

function Login() {
  const [cid, setCid] = useState(clientId())
  return (
    <div className="login">
      <div className="box">
        <div className="login-disc" />
        <h1>Spotify<span>.</span>console</h1>
        <ol>
          <li>Open <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a> → <b>Create app</b></li>
          <li>Add Redirect URI: <code>{REDIRECT}</code></li>
          <li>Tick <b>Web API</b>, save, copy the <b>Client ID</b></li>
        </ol>
        {!import.meta.env.VITE_SPOTIFY_CLIENT_ID && <input value={cid} onChange={e => setCid(e.target.value.trim())} placeholder="Paste Client ID" />}
        <button className="primary" disabled={!cid} onClick={() => login(cid)}>Log in with Spotify</button>
      </div>
    </div>
  )
}

function Console({ toast }) {
  const { state, progress, devices, deviceId, controls } = usePlayer(toast)
  const [view, setView] = useState(['albums'])
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [playlists, setPlaylists] = useState([])
  const [q, setQ] = useState('')
  const [vinyl, setVinyl] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  const go = (...v) => { setView(v); setNavOpen(false) }

  useEffect(() => {
    all('/me/playlists?limit=50').then(p => setPlaylists(p.filter(Boolean))).catch(e => {
      if (/invalid|revoked|refresh/i.test(e.message)) { logout(); location.reload() }
      toast(e.message)
    })
  }, [toast])

  useEffect(() => {
    let live = true
    setData(null); setErr('')
    document.querySelector('.content')?.scrollTo(0, 0)
    loaders[view[0]](view[1]).then(d => live && setData(d)).catch(e => live && setErr(e.message))
    return () => { live = false }
  }, [view])

  useEffect(() => {
    if (!q.trim()) return
    const t = setTimeout(() => go('search', q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const k = e => {
      if (vinyl) return
      if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return }
      if (e.key === '/') { e.preventDefault(); document.querySelector('.search').focus() }
      if (e.code === 'Space') { e.preventDefault(); controls.toggle() }
      if (e.shiftKey && e.key === 'ArrowRight') controls.next()
      if (e.shiftKey && e.key === 'ArrowLeft') controls.prev()
      if (e.key === 'v' && state?.item) setVinyl(true)
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  const playTrack = (tracks, i, ctx) =>
    ctx ? controls.play({ context_uri: ctx, offset: { uri: tracks[i].uri } }) : controls.play({ uris: tracks.slice(i, i + 100).map(t => t.uri) })

  const nowUri = state?.item?.uri
  const tabs = [['albums', '💿', 'My Albums'], ['liked', '♥', 'Liked Songs'], ['recent', '🕘', 'Recently Played'], ['top', '🔥', 'Top Tracks']]
  const cardGroups = [...(data?.cards ? [[data.cardsTitle, data.cards]] : []), ...(data?.sections || [])]

  return (
    <div className="app">
      <header>
        <button className="burger" onClick={() => setNavOpen(o => !o)}>☰</button>
        <h1 onClick={() => go('albums')}>Spotify<span>.</span>console</h1>
        <input className="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search songs, albums, artists…   /" />
        <select value={deviceId || ''} onChange={e => controls.selectDevice(e.target.value)} onFocus={() => controls.loadDevices().catch(() => {})} title="Playback device">
          {devices.length ? devices.map(d => <option key={d.id} value={d.id}>{d.type === 'Computer' ? '💻' : '📱'} {d.name}</option>) : <option value="">No devices — open Spotify</option>}
        </select>
        <button className="ghost" onClick={() => { logout(); location.reload() }}>Log out</button>
      </header>

      <main>
        <nav className={navOpen ? 'open' : ''}>
          {tabs.map(([v, ic, label]) => <button key={v} className={'tab' + (view[0] === v ? ' on' : '')} onClick={() => go(v)}><span>{ic}</span>{label}</button>)}
          <h3>Playlists</h3>
          {playlists.map(p => <button key={p.id} className={'tab' + (view[1] === p.id ? ' on' : '')} onClick={() => go('playlist', p.id)}>{p.name}</button>)}
        </nav>

        <section className="content">
          {err ? <><h2>Something went wrong</h2><p className="muted">{err}</p></>
            : !data ? <div className="skeleton">{Array.from({ length: 10 }, (_, i) => <div key={i} />)}</div>
            : <>
              {data.hero ? (
                <div className="hero">
                  <img src={data.hero.image} alt="" />
                  <div>
                    <small>{data.hero.kind}</small>
                    <h2>{data.title}</h2>
                    <p className="muted">{data.hero.sub}</p>
                    <button className="primary" onClick={() => controls.play({ context_uri: data.hero.uri })}>▶ Play</button>
                  </div>
                </div>
              ) : <h2>{data.title} <small className="muted">{data.sections ? '' : (data.tracks || data.cards).length}</small></h2>}

              {data.tracks && <>
                {data.sections && <h3>Songs</h3>}
                {data.hero?.kind === 'Artist' && <h3>Popular</h3>}
                <div className="tracks">
                  {data.tracks.map((t, i) => (
                    <div key={t.id + i} className={'row' + (t.uri === nowUri ? ' playing' : '')} onClick={() => playTrack(data.tracks, i, data.ctx)}>
                      <span className="n">{t.uri === nowUri && state?.is_playing ? <i className="eq"><b /><b /><b /></i> : i + 1}</span>
                      {!data.hideAlbum && <img loading="lazy" src={img(t.album?.images, 2)} alt="" />}
                      <div className="t"><b>{t.name}</b><small>{artists(t)}</small></div>
                      {!data.hideAlbum && <span className="al" onClick={e => { e.stopPropagation(); go('album', t.album.id) }}>{t.album?.name}</span>}
                      <span className="d">{fmt(t.duration_ms)}</span>
                    </div>
                  ))}
                </div>
              </>}

              {cardGroups.map(([title, cards]) => cards.length > 0 && (
                <div key={title || 'cards'}>
                  {title && <h3>{title}</h3>}
                  <div className="grid">
                    {cards.map(c => (
                      <div key={c.id} className="card" onClick={() => go(c.type, c.id)}>
                        <div className={'cover' + (c.type === 'artist' ? ' round' : '')}>
                          {c.image ? <img loading="lazy" src={c.image} alt="" /> : <span>♪</span>}
                          {c.type !== 'artist' && <button className="fab" onClick={e => { e.stopPropagation(); controls.play({ context_uri: `spotify:${c.type}:${c.id}` }) }}>▶</button>}
                        </div>
                        <b>{c.name}</b><small>{c.sub}</small>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>}
        </section>
      </main>

      <Player state={state} progress={progress} controls={controls} onArt={() => setVinyl(true)} />
      {vinyl && <Vinyl track={state?.item} playing={!!state?.is_playing} onClose={() => setVinyl(false)} />}
    </div>
  )
}
