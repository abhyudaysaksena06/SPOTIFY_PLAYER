import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { artists, fmt, img } from '../spotify'
import { Bar } from './Player'
import { scratchSpeed, scratchStart, scratchStop } from '../scratch'
import { Next, Pause, Play, Prev, Repeat, Shuffle } from './Icons'

const LABEL_INSET = 0.17 // label size = 66% of the record (keep in sync with .label in CSS)
const EASE = 'cubic-bezier(.2,.8,.2,1)'
const DUR = 700
const SPIN = 30        // degrees per second while playing (one turn every 12s)
const MS_PER_DEG = 60  // scratching: one full turn = ~21.6s of the song
const TAP_DEG = 4      // less rotation than this counts as a tap (closes the view)
const LIVE_SEEK_MS = 300 // while scratching, jump the laptop's playback this often

function labelRect(deck) {
  const r = deck.getBoundingClientRect()
  const pad = r.width * LABEL_INSET
  return { left: r.left + pad, top: r.top + pad, width: r.width - pad * 2, height: r.height - pad * 2 }
}
const artRect = () => document.querySelector('.player .now-art img')?.getBoundingClientRect()

// Flies a copy of the cover between two rects, morphing square ↔ circle.
function fly(url, from, to, fromRadius, toRadius, fromRot = 0) {
  const el = document.createElement('div')
  el.className = 'morph'
  el.style.backgroundImage = `url(${url})`
  document.body.appendChild(el)
  const frame = (r, radius, rot) => ({ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: radius, transform: `rotate(${rot}deg)` })
  const anim = el.animate([frame(from, fromRadius, fromRot), frame(to, toRadius, 0)], { duration: DUR, easing: EASE, fill: 'forwards' })
  return anim.finished.catch(() => {}).then(() => el)
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
  const [ready, setReady] = useState(false)
  const [scrub, setScrub] = useState(null) // song position while scratching / dragging the bar

  // opening: cover photo flies from the player bar and becomes the record label
  useLayoutEffect(() => {
    const from = artRect()
    if (!art || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) return setReady(true)
    let el
    fly(art, from, labelRect(deck.current), '4px', '50%').then(e => { el = e; setReady(true); requestAnimationFrame(() => el.remove()) })
    return () => el?.remove()
  }, [])

  // closing: label flies back down to the player bar
  useEffect(() => {
    if (!closing) return
    const to = artRect()
    if (!art || !to || !ready) return onClosed()
    setReady(false)
    fly(art, labelRect(deck.current), to, '50%', '4px', angle.current % 360).then(el => { onClosed(); requestAnimationFrame(() => el.remove()) })
  }, [closing])

  // spin loop: the record turns while playing, and follows the finger while scratching
  const spinning = useRef(false)
  spinning.current = playing && ready && !closing
  useEffect(() => {
    let raf, last = performance.now()
    const loop = now => {
      if (spinning.current && !drag.current) angle.current += SPIN * (now - last) / 1000
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
    drag.current = { last: pointerAngle(e), total: 0, start: progress, t: performance.now(), seekAt: 0 }
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
    scratchSpeed(delta / Math.max(1, now - d.t) * 1000)
    d.t = now
    clearTimeout(d.still)
    d.still = setTimeout(scratchStop, 80) // finger held still → silence
    const pos = Math.max(0, Math.min(dur - 1000, d.start + d.total * MS_PER_DEG))
    setScrub(pos)
    if (now - d.seekAt > LIVE_SEEK_MS) { d.seekAt = now; controls.seek(pos) }
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    scratchStop()
    if (!d) return
    clearTimeout(d.still)
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
