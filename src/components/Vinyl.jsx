import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { artists, fmt, img } from '../spotify'
import { Bar } from './Player'
import Tonearm from './Tonearm'
import Lyrics from './Lyrics'
import { MS_PER_DEG, scratchSpeed, scratchStart, scratchStop } from '../scratch'
import { ChevronDown, Lyrics as LyricsIcon, Next, Pause, Play, Prev, Repeat, Shuffle, Volume } from './Icons'

const LABEL_INSET = 0.17 // label size = 66% of the record (keep in sync with .label in CSS)
const EASE = 'cubic-bezier(.2,.8,.2,1)'
const DUR = 700
const SPIN = 30        // degrees per second while playing (one turn every 12s)
const TAP_DEG = 4      // less rotation than this counts as a tap (closes the view)
const LIVE_SEEK_MS = 250 // while scratching, jump the device's playback this often (4x a second keeps
                         // within Spotify's request quota; faster used it up and broke search/albums)
const FRICTION = 0.35    // seconds for a flung record to lose ~63% of its extra speed (lower = stops sooner)
const MAX_FLING = 1500   // deg/s cap on how hard you can fling it

function labelRect(deck) {
  const r = deck.getBoundingClientRect()
  const pad = r.width * LABEL_INSET
  return { left: r.left + pad, top: r.top + pad, width: r.width - pad * 2, height: r.height - pad * 2 }
}
const artRect = () => document.querySelector('.player .now-art img')?.getBoundingClientRect()

// Transform that shrinks the whole deck so its label sits exactly on top of the player-bar cover.
function deckFromArt(deck, art) {
  const d = deck.getBoundingClientRect()
  const label = labelRect(deck)
  const scale = art.width / label.width
  const dx = art.left + art.width / 2 - (d.left + d.width / 2)
  const dy = art.top + art.height / 2 - (d.top + d.height / 2)
  return { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, radius: 4 / scale + 'px' }
}

// Full-screen turntable "screen saver". Spin the record with a finger to scrub; tap it to go back.
export default function Vinyl({ state, progress, volume, controls, closing, onClose, onClosed, linked }) {
  const track = state?.item
  const playing = !!state?.is_playing
  const dur = track?.duration_ms || 0
  const art = img(track?.album?.images)
  const deck = useRef(null)
  const record = useRef(null)
  const angle = useRef(0)
  const drag = useRef(null)
  const unwind = useRef(null)
  const [ready, setReady] = useState(false)
  const [scrub, setScrub] = useState(null) // song position while scratching / dragging the bar
  const [vol, setVol] = useState(null)     // volume while dragging its slider
  const [showLyrics, setShowLyrics] = useState(() => { try { return localStorage.getItem('lyrics') === '1' } catch { return false } })
  // Switching layouts dissolves one screen into the other (View Transitions cross-fade), with a
  // fade-out/fade-in where the browser doesn't support that.
  const stage = useRef(null)
  const toggleLyrics = () => {
    const flip = () => flushSync(() => setShowLyrics(v => { try { localStorage.setItem('lyrics', v ? '0' : '1') } catch {} return !v }))
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return flip()
    if (document.startViewTransition) return document.startViewTransition(flip)
    const el = stage.current
    // fallback dissolve: fade the screen down, swap layouts, fade it back up
    el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' })
      .finished.then(() => { flip(); el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out', fill: 'forwards' }) })
  }

  // Opening: the whole record grows out of the cover photo. The photo *is* the label, so it
  // stays put as a square, rounds into a circle, and the grooves/arm fade in around it.
  // Closing runs the same animation backwards into the player bar.
  const morph = (forward, done) => {
    const from = artRect()
    if (!art || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) return done()
    const { transform, radius } = deckFromArt(deck.current, from)
    const opt = { duration: DUR, easing: EASE, fill: 'both', direction: forward ? 'normal' : 'reverse' }
    const label = deck.current.querySelector('.label')
    const parts = deck.current.querySelectorAll('.grooves, .shine, .tonearm')
    const anims = [
      deck.current.animate([{ transform }, { transform: 'none' }], opt),
      label.animate([{ borderRadius: radius, boxShadow: 'none' }, { borderRadius: '50%' }], opt),
      record.current.animate([{ backgroundColor: 'transparent', boxShadow: 'none' }, {}], opt),
      ...[...parts].map(el => el.animate([{ opacity: 0 }, { opacity: 0, offset: forward ? 0.25 : 0.4 }, { opacity: 1 }], opt)),
    ]
    anims[0].finished.catch(() => {}).then(() => { done(); if (forward) anims.forEach(x => x.cancel()) })
  }

  useLayoutEffect(() => { morph(true, () => setReady(true)) }, [])

  useEffect(() => {
    if (!closing) return
    setReady(false)
    // unwind the spin so the cover lands upright
    const start = ((angle.current % 360) + 360) % 360, target = start > 180 ? 360 : 0, t0 = performance.now()
    unwind.current = now => { const k = Math.min(1, (now - t0) / (DUR * 0.8)); angle.current = start + (target - start) * (1 - Math.pow(1 - k, 3)) }
    morph(false, onClosed)
  }, [closing])

  // ---------- turntable physics ----------
  // One loop owns the record's angle and velocity (deg/s). While a finger (or the progress bar) holds it,
  // the velocity is measured from the motion; once released it keeps spinning and friction pulls it back
  // to normal speed (or to rest when paused). The scratch sound and the song position both follow it.
  const vel = useRef(0)
  const session = useRef(null) // { startPos, startT, wasPlaying, deviation, seekAt } while scrubbing with the disc
  const base = useRef(0)
  base.current = playing && ready && !closing ? SPIN : 0
  const live = useRef({})
  live.current = { progress, dur, controls }

  const songPos = sess => {
    const elapsed = sess.wasPlaying ? performance.now() - sess.startT : 0
    return Math.max(0, Math.min(live.current.dur - 1000, sess.startPos + elapsed + sess.deviation * MS_PER_DEG))
  }
  const endSession = () => {
    const sess = session.current
    session.current = null
    scratchStop()
    if (sess && live.current.dur) live.current.controls.seek(songPos(sess))
    setTimeout(() => setScrub(null), 700) // let the next poll catch up before handing back to live progress
  }

  useEffect(() => {
    let raf, last = performance.now(), prev = angle.current, lastScrubSet = 0
    const loop = now => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const held = drag.current
      if (unwind.current) unwind.current(now)
      else if (held) {
        // finger/bar sets the angle; measure velocity from it
        const inst = dt ? (angle.current - prev) / dt : 0
        vel.current = vel.current * 0.45 + inst * 0.55
      } else {
        // free spin: friction eases the velocity toward normal speed
        vel.current = base.current + (vel.current - base.current) * Math.exp(-dt / FRICTION)
        angle.current += vel.current * dt
      }
      const moved = angle.current - prev
      prev = angle.current

      const sess = session.current
      // a finger resting on the record hasn't scrubbed anything until it has actually turned it
      // (otherwise a simple tap-to-close would jump the song back to where it was a moment ago)
      const armed = !held || held.mode !== 'disc' || held.total >= TAP_DEG
      if (sess && armed) {
        // during a hold the song is under the finger; while coasting only the extra speed counts
        sess.deviation += held ? moved : moved - base.current * dt
        const rel = held ? vel.current : vel.current - base.current
        scratchSpeed(rel)
        const pos = songPos(sess)
        if (now - lastScrubSet > 50) { lastScrubSet = now; setScrub(pos) }
        // never more than one jump in flight, so slow responses can't pile up behind the finger
        if (now - sess.seekAt > LIVE_SEEK_MS && !sess.inflight && live.current.dur) {
          sess.seekAt = now; sess.inflight = true
          Promise.resolve(live.current.controls.seek(pos, true)).finally(() => { sess.inflight = false })
        }
        if (!held && Math.abs(rel) < 4) endSession()
      }
      if (record.current) record.current.style.transform = `rotate(${angle.current}deg)`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); scratchStop() }
  }, [])

  // ---------- finger on the record ----------
  const pointerAngle = e => {
    const r = deck.current.getBoundingClientRect()
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI
  }
  const down = e => {
    if (!ready) return
    e.currentTarget.setPointerCapture(e.pointerId)
    scratchStart()
    drag.current = { mode: 'disc', last: pointerAngle(e), total: 0, t0: performance.now(), samples: [] }
    // grabbing a record that is still coasting continues the same scrub
    if (!session.current) session.current = { startPos: progress, startT: performance.now(), wasPlaying: playing, deviation: 0, seekAt: 0 }
    vel.current = 0
  }
  const move = e => {
    const d = drag.current
    if (d?.mode !== 'disc') return
    const a = pointerAngle(e)
    let delta = a - d.last
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    d.last = a
    d.total += Math.abs(delta)
    angle.current += delta
    const now = performance.now()
    d.samples.push([now, angle.current])
    while (d.samples.length > 2 && now - d.samples[0][0] > 80) d.samples.shift()
  }
  const up = () => {
    const d = drag.current
    if (d?.mode !== 'disc') return
    drag.current = null
    // a quick touch without turning = tap, go back
    if (d.total < TAP_DEG && performance.now() - d.t0 < 350) {
      session.current = null; scratchStop(); vel.current = base.current; setScrub(null)
      return onClose()
    }
    // fling: release velocity from the last ~80ms of motion
    const s0 = d.samples[0], s1 = d.samples[d.samples.length - 1]
    const fresh = s0 && s1 && s1[0] - s0[0] > 10 && performance.now() - s1[0] < 60
    const fling = fresh ? (s1[1] - s0[1]) / ((s1[0] - s0[0]) / 1000) : 0
    vel.current = Math.max(-MAX_FLING, Math.min(MAX_FLING, fling))
  }

  // ---------- progress bar: dragging it turns the record and scratches ----------
  const barMove = v => {
    const now = performance.now()
    let d = drag.current
    if (d?.mode !== 'bar') {
      scratchStart()
      d = drag.current = { mode: 'bar', lastV: scrub ?? progress, t: now }
    }
    const deg = (v - d.lastV) / MS_PER_DEG
    const dt = Math.max(8, now - d.t) / 1000
    angle.current += deg
    scratchSpeed(Math.max(-1800, Math.min(1800, deg / dt)))
    d.lastV = v
    d.t = now
    setScrub(v)
  }
  const barCommit = v => {
    if (drag.current?.mode === 'bar') drag.current = null
    scratchStop()
    vel.current = base.current
    controls.seek(v)
    setTimeout(() => setScrub(null), 700)
  }

  const pos = scrub ?? progress
  return (
    <div ref={stage} className={'vinyl-stage' + (closing ? ' out' : '') + (showLyrics ? ' lyrics-on' : '')}>
      <div className="vinyl-glow" style={{ backgroundImage: art ? `url(${art})` : undefined }} />
      <button className="vinyl-close" onClick={onClose} title="Back" aria-label="Back"><ChevronDown size={22} /></button>

      <div className="vinyl-disc">
        <div className="deck" ref={deck}>
          <div ref={record} className={'record' + (ready ? ' ready' : '') + (scrub != null ? ' scratching' : '')}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title="Spin or fling to scrub · tap to go back">
            <span className="grooves" />
            <span className="shine" />
            <span className="label" style={{ backgroundImage: art ? `url(${art})` : undefined }}>
              <span className="spindle" />
            </span>
          </div>
          <Tonearm on={playing && ready} />
        </div>
      </div>

      {showLyrics && <Lyrics track={track} pos={pos} dur={dur} />}

      <div className="vinyl-panel">
        <div className="vinyl-meta">
          <h2>{track?.name || 'Nothing playing'}</h2>
          <p>{artists(track)}</p>
        </div>
        <div className="vinyl-prog">
          <Bar value={pos} max={dur} onChange={barMove} onCommit={barCommit} />
          <div className="times"><span>{fmt(pos)}</span><span>-{fmt(Math.max(0, dur - pos))}</span></div>
        </div>
        {/* play/pause sits in the exact middle: equal-width groups on either side */}
        <div className="vinyl-btns">
          <div className="side l">
            <button className={'icon' + (state?.shuffle_state ? ' lit' : '')} onClick={controls.shuffle} title="Shuffle" aria-label="Shuffle"><Shuffle size={22} /></button>
            <button className={'icon' + (state?.repeat_state && state.repeat_state !== 'off' ? ' lit' : '')} onClick={controls.repeat} title="Repeat" aria-label="Repeat">
              <Repeat size={22} />{state?.repeat_state === 'track' && <sup>1</sup>}
            </button>
            <button className="icon" onClick={controls.prev} title="Previous" aria-label="Previous"><Prev size={28} /></button>
          </div>
          <button className="pp big" onClick={controls.toggle} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={28} /> : <Play size={28} />}</button>
          <div className="side r">
            <button className="icon" onClick={controls.next} title="Next" aria-label="Next"><Next size={28} /></button>
            <button className={'icon lyr-toggle' + (showLyrics ? ' lit' : '')} onClick={toggleLyrics} title={showLyrics ? 'Hide lyrics' : 'Show lyrics'} aria-label={showLyrics ? 'Hide lyrics' : 'Show lyrics'} aria-pressed={showLyrics}>
              <LyricsIcon size={22} />
            </button>
          </div>
        </div>
        <div className="vinyl-vol">
          <Volume size={18} />
          <Bar value={vol ?? volume ?? 50} max={100} onChange={v => { setVol(v); controls.volume(v) }} onCommit={v => { controls.volume(v); setVol(null) }} />
        </div>
        <p className="vinyl-hint">Spin or fling the record to scrub · tap it to go back</p>
      </div>
    </div>
  )
}
