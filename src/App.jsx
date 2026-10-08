import { useCallback, useEffect, useRef, useState } from 'react'
import { REDIRECT, all, api, artists, clientId, fmt, handleRedirect, img, loggedIn, login, logout, store } from './spotify'
import { usePlayer } from './usePlayer'
import Player from './components/Player'
import Vinyl from './components/Vinyl'
import { startController, startSpeaker, stopRemote } from './remote'
import { scratchStart, setRouteRemote } from './scratch'
import { Clock, Collapse, Disc, Expand, Heart, Home, Library, Pause, Play, Search, Speaker } from './components/Icons'

const card = (x, sub) => ({ id: x.id, type: x.type, name: x.name, image: img(x.images, 1), sub })

/* ---------- data loaders for each view ---------- */
const loaders = {
  home: async () => {
    const [saved, liked, pls] = await Promise.all([
      all('/me/albums?limit=50').catch(() => []),
      all('/me/tracks?limit=50', 100).catch(() => []),
      all('/me/playlists?limit=50').catch(() => []),
    ])
    // albums of your liked songs, so Home isn't empty when nothing is saved in "Albums"
    const seen = new Set(saved.map(x => x.album.id))
    const fromLiked = []
    for (const { track } of liked.filter(Boolean)) if (track?.album?.id && !seen.has(track.album.id)) { seen.add(track.album.id); fromLiked.push(card(track.album, artists(track.album))) }
    const sections = [
      ['Your Albums', saved.map(x => card(x.album, artists(x.album)))],
      ['Albums from your Liked Songs', fromLiked],
      ['Your Playlists', pls.filter(Boolean).map(x => card(x, 'By ' + (x.owner?.display_name || '')))],
    ]
    return { title: 'Home', sections, empty: sections.every(s => !s[1].length) }
  },
  liked: async () => {
    const tracks = (await all('/me/tracks?limit=50', 500)).map(x => x?.track).filter(t => t?.uri)
    return { title: 'Liked Songs', hero: { kind: 'Playlist', tile: 'liked', sub: `${tracks.length} songs` }, tracks }
  },
  recent: async () => ({ title: 'Recently Played', hero: { kind: 'History', tile: 'recent', sub: 'Your last 50 plays' }, tracks: (await api('/me/player/recently-played?limit=50')).items.map(x => x?.track).filter(t => t?.uri) }),
  top: async () => ({ title: 'Your Top Tracks', hero: { kind: 'Playlist', tile: 'top', sub: 'Most played lately' }, tracks: (await api('/me/top/tracks?limit=50')).items.filter(t => t?.uri) }),
  album: async id => {
    const a = await api('/albums/' + id)
    // the album response already holds the first 50 tracks; only page if there are more
    const rest = a.tracks?.next ? await all(a.tracks.next).catch(() => []) : []
    const tracks = [...(a.tracks?.items || []), ...rest].filter(Boolean).map(t => ({ ...t, album: a }))
    return { title: a.name, hero: { kind: a.album_type === 'single' ? 'Single' : 'Album', image: img(a.images), sub: `${artists(a)} • ${a.release_date?.slice(0, 4)} • ${a.total_tracks} songs`, uri: a.uri }, tracks, ctx: a.uri, hideAlbum: true }
  },
  playlist: async id => {
    const p = await api(`/playlists/${id}`)
    // Spotify (2026) only lists songs of playlists you own or collaborate on; others can still be played
    let tracks = [], locked = false
    try {
      tracks = (await all(`/playlists/${id}/items?limit=100`, 1000)).map(x => x.item || x.track).filter(t => t?.uri && !t.uri.startsWith('spotify:local'))
    } catch (e) { if (e.status === 403 || e.status === 404) locked = true; else throw e }
    const total = p.items?.total ?? p.tracks?.total
    return {
      title: p.name, tracks, ctx: p.uri,
      hero: { kind: 'Playlist', image: img(p.images), sub: `${p.owner?.display_name || ''}${total != null ? ` • ${total} songs` : ''}`, uri: p.uri },
      note: locked && "Spotify doesn't let this app list the songs of playlists you don't own. Press play to listen to it.",
    }
  },
  artist: async id => {
    // top-tracks was removed for dev-mode apps (Feb 2026), so search the artist's songs instead
    const a = await api('/artists/' + id)
    const [top, al] = await Promise.all([
      api('/search?' + new URLSearchParams({ q: `artist:"${a.name}"`, type: 'track', limit: 10 })).catch(() => ({ tracks: { items: [] } })),
      api(`/artists/${id}/albums?include_groups=album,single&limit=50`),
    ])
    return { title: a.name, hero: { kind: 'Artist', image: img(a.images), round: true, sub: a.genres?.slice(0, 3).join(' • ') || 'Artist', uri: a.uri }, tracksTitle: 'Popular', tracks: (top.tracks?.items || []).filter(t => t?.artists?.some(x => x.id === id)), cardsTitle: 'Discography', cards: al.items.filter(Boolean).map(x => card(x, (x.release_date || '').slice(0, 4) + ' • ' + x.album_type)) }
  },
  search: async q => {
    const j = await api('/search?' + new URLSearchParams({ q, type: 'track,album,artist,playlist', limit: 10 }))
    const none = !j.tracks?.items?.length && !j.artists?.items?.length && !j.albums?.items?.length && !j.playlists?.items?.length
    return {
      empty: none, emptyText: `No results for "${q}"`,
      title: '', tracksTitle: 'Songs', tracks: (j.tracks?.items || []).filter(t => t?.uri),
      sections: [
        ['Artists', (j.artists?.items || []).filter(Boolean).map(x => card(x, 'Artist'))],
        ['Albums', (j.albums?.items || []).filter(Boolean).map(x => card(x, artists(x)))],
        ['Playlists', (j.playlists?.items || []).filter(Boolean).map(x => card(x, 'By ' + (x.owner?.display_name || '')))],
      ],
    }
  },
}

// The Windows companion opens the site with ?speaker=1 in its own Edge profile. Remember it, because
// the Spotify login redirect comes back to "/" without the query string.
if (new URLSearchParams(location.search).get('speaker') === '1') store.set('speakerMode', '1')
const speakerMode = store.get('speakerMode') === '1'

// Minimal page for the companion window: just receives scratches from the phone and plays them.
function SpeakerPage() {
  const [status, setStatus] = useState('starting')
  useEffect(() => {
    api('/me').then(u => { startSpeaker(u.id, setStatus, true); scratchStart() }).catch(e => setStatus('error: ' + e.message))
    // keep the audio engine awake even if the window was minimised for a long time
    const t = setInterval(scratchStart, 30000)
    return () => { clearInterval(t); stopRemote() }
  }, [])
  const text = {
    starting: 'Starting…', speaker: 'Ready — waiting for your phone',
    'speaker-linked': 'Phone connected — scratches play here', reclaiming: 'Reconnecting… (can take up to a minute after a restart)', error: 'Connection problem — retrying',
  }[status] || status
  return (
    <div className="login">
      <div className="box">
        <div className="login-disc" />
        <h1>Scratch Speaker</h1>
        <p className={status === 'speaker-linked' ? 'green' : 'muted'}>{text}</p>
        <p className="muted" style={{ fontSize: 12 }}>You can minimise this window. It closes when Spotify closes.</p>
        <button className="primary" onClick={() => { scratchStart(); import('./scratch').then(m => m.scratchTest()) }}>Test sound</button>
      </div>
    </div>
  )
}

const TILES = { liked: <Heart size={24} />, recent: <Clock size={24} />, top: <Play size={24} />, home: <Disc size={24} /> }

export default function App() {
  const [authed, setAuthed] = useState(loggedIn())
  const [boot, setBoot] = useState(true)
  const [msg, setMsg] = useState('')
  const toast = useCallback(m => { setMsg(m); clearTimeout(toast.t); toast.t = setTimeout(() => setMsg(''), 3500) }, [])
  useEffect(() => {
    handleRedirect().then(() => setAuthed(loggedIn())).catch(e => toast(e.message)).finally(() => setBoot(false))
  }, [toast])
  if (boot) return null
  if (speakerMode) return <>{authed ? <SpeakerPage /> : <Login />}{msg && <div className="toast">{msg}</div>}</>
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
        <h1>Music Console</h1>
        <p className="muted">Control the Spotify app on your laptop from anywhere.</p>
        {!import.meta.env.VITE_SPOTIFY_CLIENT_ID && <>
          <ol>
            <li>Open <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a> → <b>Create app</b></li>
            <li>Add Redirect URI: <code>{REDIRECT}</code></li>
            <li>Tick <b>Web API</b>, save, copy the <b>Client ID</b></li>
          </ol>
          <input value={cid} onChange={e => setCid(e.target.value.trim())} placeholder="Client ID" />
        </>}
        <button className="primary" disabled={!cid} onClick={() => login(cid)}>Log in with Spotify</button>
      </div>
    </div>
  )
}

function Console({ toast }) {
  const { state, progress, devices, deviceId, volume, controls } = usePlayer(toast)
  const [view, setView] = useState(['home'])
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [playlists, setPlaylists] = useState([])
  const [q, setQ] = useState('')
  const [vinyl, setVinyl] = useState(false) // false | true | 'closing'
  const [full, setFull] = useState(false)
  const [me, setMe] = useState(null)
  const [link, setLink] = useState('local') // local | linked | speaker | speaker-linked | reclaiming | error
  const isSpeaker = link.startsWith('speaker')

  // phone ⇄ Spotify-device link for the scratch sound
  useEffect(() => {
    api('/me').then(u => { setMe(u.id); startController(u.id, setLink) }).catch(() => {})
    return stopRemote
  }, [])
  useEffect(() => {
    if (link === 'error') toast('Could not connect the scratch speaker (network may block it)')
    // the companion window (or another tab) is already the speaker: this tab just stays a controller
    if (link === 'reclaiming') { toast('Another window is already the scratch speaker'); me && startController(me, setLink) }
  }, [link])
  // A laptop/desktop browser while Spotify plays on a computer is almost certainly that computer:
  // make it the scratch speaker automatically. Browsers only allow sound after one click on the page.
  const autoSpk = useRef(false)
  useEffect(() => {
    if (autoSpk.current || !me || link !== 'local' || matchMedia('(hover: none)').matches) return
    if (state?.device?.type !== 'Computer') return
    autoSpk.current = true
    startSpeaker(me, setLink, true)
    const unlock = () => { scratchStart(); removeEventListener('pointerdown', unlock) }
    addEventListener('pointerdown', unlock)
    toast('This computer is now the scratch speaker — click anywhere once to allow sound')
  }, [me, link, state?.device?.type])

  const touch = matchMedia('(hover: none)').matches
  // where the scratch sound plays: 'device' = the Spotify device's Scratch Speaker app, 'here' = this page
  const [route, setRoute] = useState(() => { try { return localStorage.getItem('scratchRoute') || 'device' } catch { return 'device' } })
  useEffect(() => { setRouteRemote(route === 'device'); try { localStorage.setItem('scratchRoute', route) } catch {} }, [route])
  const toggleSpeaker = () => {
    if (!me) return
    if (touch) {
      const next = route === 'device' ? 'here' : 'device'
      setRoute(next)
      if (next === 'here') { scratchStart(); return toast('Scratch sound: this phone') }
      return toast(link === 'linked' ? 'Scratch sound: your Spotify device' : 'Scratch sound: your Spotify device — open the Scratch Speaker app there')
    }
    if (isSpeaker) return startController(me, setLink)
    startSpeaker(me, setLink)
    toast('Speaker on — you should hear a test scratch. Keep this tab open.')
  }
  const closeVinyl = () => setVinyl(v => (v ? 'closing' : v))
  const toggleVinyl = () => (vinyl ? closeVinyl() : state?.item && setVinyl(true))

  useEffect(() => {
    const f = () => setFull(!!(document.fullscreenElement || document.webkitFullscreenElement))
    document.addEventListener('fullscreenchange', f); document.addEventListener('webkitfullscreenchange', f)
    return () => { document.removeEventListener('fullscreenchange', f); document.removeEventListener('webkitfullscreenchange', f) }
  }, [])
  const toggleFull = () => {
    const d = document, el = d.documentElement
    if (d.fullscreenElement || d.webkitFullscreenElement) return (d.exitFullscreen || d.webkitExitFullscreen).call(d)
    const req = el.requestFullscreen || el.webkitRequestFullscreen
    if (req) return req.call(el)
    toast('On iPhone: tap Share → Add to Home Screen, then open it from there for full screen')
  }
  const [navOpen, setNavOpen] = useState(false)

  const go = (...v) => { setView(v); setNavOpen(false); setVinyl(false) }

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
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) { if (e.key === 'Escape') e.target.blur(); return }
      if (e.code === 'Space' && e.target.closest('button')) return
      if (e.key === 'Escape') closeVinyl()
      if (e.key === 'f') toggleFull()
      if (e.key === '/') { e.preventDefault(); document.querySelector('.search input').focus() }
      if (e.code === 'Space') { e.preventDefault(); controls.toggle() }
      if (e.shiftKey && e.key === 'ArrowRight') controls.next()
      if (e.shiftKey && e.key === 'ArrowLeft') controls.prev()
      if (e.key === 'v') toggleVinyl()
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  const playTrack = (tracks, i, ctx) =>
    ctx ? controls.play({ context_uri: ctx, offset: { uri: tracks[i].uri } }) : controls.play({ uris: tracks.slice(i, i + 100).map(t => t.uri) })

  const nowUri = state?.item?.uri
  const playing = !!state?.is_playing
  const ctxPlaying = data?.hero?.uri && state?.context?.uri === data.hero.uri && playing
  const tabs = [['liked', 'Liked Songs', 'Playlist'], ['top', 'Top Tracks', 'Playlist'], ['recent', 'Recently Played', 'History']]
  const cardGroups = [...(data?.cards ? [[data.cardsTitle, data.cards]] : []), ...(data?.sections || [])]
  const device = devices.find(d => d.id === deviceId)
  // where the scratch sound goes: the speaker app for a computer, this page for anything else (e.g. this phone)

  return (
    <div className="app">
      <header>
        <button className="burger" aria-label="Your library" aria-expanded={navOpen} onClick={() => setNavOpen(o => !o)}><Library size={20} /></button>
        <button className={'home' + (view[0] === 'home' ? ' on' : '')} onClick={() => { setQ(''); go('home') }} title="Home" aria-label="Home"><Home size={22} /></button>
        <label className="search">
          <Search size={20} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="What do you want to play?" aria-label="Search" type="search" enterKeyHint="search" />
          {q && <button className="clear" aria-label="Clear search" onClick={() => setQ('')}>✕</button>}
        </label>
        <div className="hdr-right">
          <select aria-label="Playback device" value={deviceId || ''} onChange={e => controls.selectDevice(e.target.value)} onFocus={() => controls.loadDevices().catch(() => {})} title="Playback device">
            {devices.length ? devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>) : <option value="">No devices</option>}
          </select>
          <button className={'fs' + (touch
              ? (route === 'device' ? (link === 'linked' ? ' on' : ' linked') : '')
              : (isSpeaker ? ' on' : link === 'linked' ? ' linked' : ''))} onClick={toggleSpeaker}
            title={touch
              ? (route === 'device' ? 'Scratch sound: your Spotify device (tap for this phone)' : 'Scratch sound: this phone (tap for your Spotify device)')
              : (isSpeaker ? 'Scratch speaker: ON (click to turn off)' : 'Make this computer the scratch speaker')}>
            <Speaker size={18} />
          </button>
          <button className="fs" onClick={toggleFull} title={full ? 'Exit full screen' : 'Full screen'}>{full ? <Collapse size={18} /> : <Expand size={18} />}</button>
          <button className="pill" onClick={() => { logout(); location.reload() }}>Log out</button>
        </div>
      </header>

      <main>
        <nav className={navOpen ? 'open' : ''}>
          <div className="lib-head"><Library size={22} /> Your Library</div>
          <div className="lib-list">
            {tabs.map(([v, label, sub]) => (
              <button key={v} className={'lib-item' + (view[0] === v ? ' on' : '')} onClick={() => go(v)}>
                <span className={'tile tile-' + v}>{TILES[v]}</span>
                <span className="lib-text"><b>{label}</b><small>{sub}</small></span>
              </button>
            ))}
            {playlists.map(p => (
              <button key={p.id} className={'lib-item' + (view[1] === p.id ? ' on' : '')} onClick={() => go('playlist', p.id)}>
                <span className="tile">{img(p.images, 2) ? <img loading="lazy" src={img(p.images, 2)} alt="" /> : <Disc size={24} />}</span>
                <span className="lib-text"><b className={state?.context?.uri === p.uri ? 'green' : ''}>{p.name}</b><small>Playlist • {p.owner?.display_name}</small></span>
              </button>
            ))}
          </div>
        </nav>

        <section className="content" aria-live="polite">
          {err ? <div className="pad"><h1>Something went wrong</h1><p className="muted">{err}</p></div>
            : !data ? <div className="pad skeleton">{Array.from({ length: 10 }, (_, i) => <div key={i} />)}</div>
            : <div className="view-in" key={view.join(':')}>
              {data.hero ? (
                <div className="hero">
                  <div className="hero-bg" style={data.hero.image ? { backgroundImage: `url(${data.hero.image})` } : undefined} data-tile={data.hero.tile} />
                  {data.hero.image ? <img className={data.hero.round ? 'round' : ''} src={data.hero.image} alt="" />
                    : <span className={'hero-tile tile-' + data.hero.tile}>{TILES[data.hero.tile]}</span>}
                  <div className="hero-text">
                    <small>{data.hero.kind}</small>
                    <h1 className={data.title.length > 24 ? 'long' : ''}>{data.title}</h1>
                    <p>{data.hero.sub}</p>
                  </div>
                </div>
              ) : data.title && <h1 className="page-title">{data.title}</h1>}
              {data.empty && <p className="pad muted">{data.emptyText || 'Nothing in your library yet. Save some albums or like some songs in Spotify, or use search.'}</p>}

              <div className="pad">
                {data.hero && (data.tracks?.length > 0 || data.hero.uri) && (
                  <div className="action-bar">
                    <button className="big-play" aria-label={ctxPlaying ? 'Pause' : 'Play'} onClick={() => ctxPlaying ? controls.toggle() : data.hero.uri ? controls.play({ context_uri: data.hero.uri }) : playTrack(data.tracks, 0)}>
                      {ctxPlaying ? <Pause size={22} /> : <Play size={22} />}
                    </button>
                  </div>
                )}

                {data.note && <p className="muted note">{data.note}</p>}
                {data.tracks?.length > 0 && <>
                  {data.tracksTitle && <h2>{data.tracksTitle}</h2>}
                  <div className={'tracks' + (data.hideAlbum ? ' no-album' : '')}>
                    {!data.sections && (
                      <div className="row head">
                        <span className="n">#</span><span>Title</span>{!data.hideAlbum && <span className="al">Album</span>}<span className="d"><Clock /></span>
                      </div>
                    )}
                    {data.tracks.map((t, i) => {
                      const cur = t.uri === nowUri
                      return (
                        <div key={t.id + i} className={'row' + (cur ? ' playing' : '')} onClick={e => { if (!e.target.closest('a, button')) playTrack(data.tracks, i, data.ctx) }}>
                          <span className="n">
                            <span className="num">{cur && playing ? <i className="eq"><b /><b /><b /><b /></i> : i + 1}</span>
                            <button className="row-play" aria-label={cur && playing ? 'Pause' : 'Play ' + t.name} onClick={() => cur ? controls.toggle() : playTrack(data.tracks, i, data.ctx)}>
                              {cur && playing ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                          </span>
                          <span className="t">
                            {!data.hideAlbum && <img loading="lazy" src={img(t.album?.images, 2)} alt="" />}
                            <span><b>{t.name}</b><small>{t.explicit && <i className="e">E</i>}{(t.artists || []).map((a, k) => <span key={a.id}>{k > 0 && ', '}<a onClick={() => go('artist', a.id)}>{a.name}</a></span>)}</small></span>
                          </span>
                          {!data.hideAlbum && <span className="al"><a onClick={() => t.album?.id && go('album', t.album.id)}>{t.album?.name}</a></span>}
                          <span className="d">{fmt(t.duration_ms)}</span>
                        </div>
                      )
                    })}
                  </div>
                </>}

                {cardGroups.map(([title, cards]) => cards.length > 0 && (
                  <div key={title || 'cards'}>
                    {title && <h2>{title}</h2>}
                    <div className="grid">
                      {cards.map(c => (
                        <div key={c.id} className="card" onClick={() => go(c.type, c.id)}>
                          <div className={'cover' + (c.type === 'artist' ? ' round' : '')}>
                            {c.image ? <img loading="lazy" src={c.image} alt="" /> : <Disc size={40} />}
                            <button className="fab" aria-label={'Play ' + c.name} onClick={e => { e.stopPropagation(); controls.play({ context_uri: `spotify:${c.type}:${c.id}` }) }}><Play size={20} /></button>
                          </div>
                          <b>{c.name}</b><small>{c.sub}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>}
        </section>
      </main>

      <Player state={state} progress={progress} volume={volume} controls={controls} vinyl={vinyl} deviceName={device?.name}
        onArt={toggleVinyl} />
      {vinyl && <Vinyl state={state} progress={progress} volume={volume} controls={controls} linked={link === 'linked'}
        closing={vinyl === 'closing'} onClose={closeVinyl} onClosed={() => setVinyl(false)} />}
    </div>
  )
}
