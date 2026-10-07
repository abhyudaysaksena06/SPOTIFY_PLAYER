import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { artists, fmt, img } from '../spotify'
import { Bar } from './Player'
import { MS_PER_DEG, scratchSpeed, scratchStart, scratchStop } from '../scratch'
import { Next, Pause, Play, Prev, Repeat, Shuffle } from './Icons'

const LABEL_INSET = 0.17 // label size = 66% of the record (keep in sync with .label in CSS)
const EASE = 'cubic-bezier(.2,.8,.2,1)'
const DUR = 700
const SPIN = 30        // degrees per second while playing (one turn every 12s)
const TAP_DEG = 4      // less rotation than this counts as a tap (closes the view)
const LIVE_SEEK_MS = 300 // while scratching, jump the laptop's playback this often

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
export default function Vinyl({ state, progress, controls, closing, onClose, onClosed, linked }) {
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
    const start = angle.current % 360, target = start > 180 ? 360 : 0, t0 = performance.now()
    unwind.current = now => { const k = Math.min(1, (now - t0) / (DUR * 0.8)); angle.current = start + (target - start) * (1 - Math.pow(1 - k, 3)) }
    morph(false, onClosed)
  }, [closing])

  // spin loop: the record turns while playing, and follows the finger while scratching
  const spinning = useRef(false)
  spinning.current = playing && ready && !closing
  useEffect(() => {
    let raf, last = performance.now()
    const loop = now => {
      if (unwind.current) unwind.current(now)
      else if (spinning.current && !drag.current) angle.current += SPIN * (now - last) / 1000
      last = now
      if (record.current) record.current.style.transform = `rotate(${angle.current}deg)`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const pointerAngle = e => {
    const r = deck.current.getBoundingClientRect()
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI
  }
  const down = e => {
    if (!ready) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { last: pointerAngle(e), total: 0, start: progress, t: performance.now(), seekAt: 0, acc: 0 }
    scratchStart()
  }
  const move = e => {
    const d = drag.current
    if (!d) return
    const a = pointerAngle(e)
    let delta = a - d.last
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    const now = performance.now()
    d.last = a
    d.total += delta
    angle.current += delta
    if (Math.abs(d.total) < TAP_DEG || !dur) return
    // velocity from the actual finger motion; ignore ultra-short gaps that cause spikes
    const dt = now - d.t
    if (dt >= 8) { scratchSpeed((d.acc + delta) / dt * 1000); d.acc = 0; d.t = now } else d.acc += delta
    const pos = Math.max(0, Math.min(dur - 1000, d.start + d.total * MS_PER_DEG))
    setScrub(pos)
    if (now - d.seekAt > LIVE_SEEK_MS) { d.seekAt = now; controls.seek(pos) }
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    scratchStop()
    if (!d) return
    if (Math.abs(d.total) < TAP_DEG) return onClose()
    if (dur) controls.seek(Math.max(0, Math.min(dur - 1000, d.start + d.total * MS_PER_DEG)))
    setTimeout(() => setScrub(null), 600) // let the next poll catch up before handing back to live progress
  }

  const pos = scrub ?? progress
  return (
    <div className={'vinyl-stage' + (closing ? ' out' : '')}>
      <div className="vinyl-glow" style={{ backgroundImage: art ? `url(${art})` : undefined }} />
      <button className="vinyl-close" onClick={onClose} title="Back">⌄</button>

      <div className="vinyl-disc">
        <div className="deck" ref={deck}>
          <div ref={record} className={'record' + (ready ? ' ready' : '') + (scrub != null ? ' scratching' : '')}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} title="Spin to scrub · tap to go back">
            <span className="grooves" />
            <span className="shine" />
            <span className="label" style={{ backgroundImage: art ? `url(${art})` : undefined }}>
              <span className="spindle" />
            </span>
          </div>
          <div className={'tonearm' + (playing && ready ? ' on' : '')}>
            <span className="pivot" /><span className="arm" /><span className="head" />
          </div>
        </div>
      </div>

      <div className="vinyl-panel">
        <div className="vinyl-meta">
          <h2>{track?.name || 'Nothing playing'}</h2>
          <p>{artists(track)}</p>
        </div>
        <div className="vinyl-prog">
          <Bar value={pos} max={dur} onChange={setScrub} onCommit={v => { controls.seek(v); setTimeout(() => setScrub(null), 600) }} />
          <div className="times"><span>{fmt(pos)}</span><span>-{fmt(Math.max(0, dur - pos))}</span></div>
        </div>
        <div className="vinyl-btns">
          <button className={'icon' + (state?.shuffle_state ? ' lit' : '')} onClick={controls.shuffle}><Shuffle size={22} /></button>
          <button className="icon" onClick={controls.prev}><Prev size={28} /></button>
          <button className="pp big" onClick={controls.toggle}>{playing ? <Pause size={28} /> : <Play size={28} />}</button>
          <button className="icon" onClick={controls.next}><Next size={28} /></button>
          <button className={'icon' + (state?.repeat_state && state.repeat_state !== 'off' ? ' lit' : '')} onClick={controls.repeat}>
            <Repeat size={22} />{state?.repeat_state === 'track' && <sup>1</sup>}
          </button>
        </div>
        <p className="vinyl-hint">{linked ? 'Scratch sound → your Spotify device' : 'Spin the record to scrub'} · tap it to go back</p>
      </div>
    </div>
  )
}
