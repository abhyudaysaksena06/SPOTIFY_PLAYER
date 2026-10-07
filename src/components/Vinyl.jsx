import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { artists, img } from '../spotify'

const LABEL_INSET = 0.17 // label size = 66% of the record (keep in sync with .label in CSS)
const EASE = 'cubic-bezier(.2,.8,.2,1)'
const DUR = 700

// Where the label sits on screen, computed from the (un-rotated) deck box.
function labelRect(deck) {
  const r = deck.getBoundingClientRect()
  const pad = r.width * LABEL_INSET
  return { left: r.left + pad, top: r.top + pad, width: r.width - pad * 2, height: r.height - pad * 2 }
}
const artRect = () => document.querySelector('.now-art img')?.getBoundingClientRect()

// Current rotation of the spinning record, so the closing morph starts from the same angle.
function currentAngle(el) {
  const m = getComputedStyle(el).transform
  if (!m || m === 'none') return 0
  const [a, b] = m.slice(7, -1).split(',').map(Number)
  return Math.round(Math.atan2(b, a) * 180 / Math.PI)
}

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

// Spinning record "screen saver" shown inside the main panel. Click the record to go back.
export default function Vinyl({ track, playing, closing, onClose, onClosed }) {
  const art = img(track?.album?.images)
  const deck = useRef(null)
  const record = useRef(null)
  const [ready, setReady] = useState(false)

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
    const angle = currentAngle(record.current)
    setReady(false)
    fly(art, labelRect(deck.current), to, '50%', '4px', angle).then(el => { onClosed(); requestAnimationFrame(() => el.remove()) })
  }, [closing])

  return (
    <div className={'vinyl-stage' + (closing ? ' out' : '')}>
      <div className="vinyl-glow" style={{ backgroundImage: art ? `url(${art})` : undefined }} />
      <div className="deck" ref={deck}>
        <button ref={record} className={'record' + (playing && ready ? ' spin' : '') + (ready ? ' ready' : '')} onClick={onClose} title="Back to library">
          <span className="grooves" />
          <span className="shine" />
          <span className="label" style={{ backgroundImage: art ? `url(${art})` : undefined }}>
            <span className="spindle" />
          </span>
        </button>
        <div className={'tonearm' + (playing && ready ? ' on' : '')}>
          <span className="pivot" /><span className="arm" /><span className="head" />
        </div>
      </div>
      <div className="vinyl-meta">
        <h2>{track?.name || 'Nothing playing'}</h2>
        <p>{artists(track)}</p>
      </div>
    </div>
  )
}
