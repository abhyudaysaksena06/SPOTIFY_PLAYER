import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { currentLine, fetchLyrics } from '../lyrics'

// How long a line is "sung" for, when the next line starts much later (instrumental gaps).
const MS_PER_CHAR = 70
const MIN_LINE_MS = 900

// Fraction (0-1) of the current line that has been sung, estimated from line timings.
function lineProgress(lines, i, pos) {
  const l = lines[i]
  if (l?.t == null) return 1
  const next = lines[i + 1]?.t ?? l.t + 4000
  const singFor = Math.min(next - l.t, Math.max(MIN_LINE_MS, l.text.length * MS_PER_CHAR))
  return Math.max(0, Math.min(1, (pos - l.t) / singFor))
}

// Words of the current line, each marked sung once the estimated singing point passes it
// (longer words take proportionally longer).
function Words({ text, progress }) {
  const words = text.split(/(\s+)/)
  const total = text.replace(/\s+/g, '').length || 1
  let done = 0
  return words.map((w, k) => {
    if (!w.trim()) return w
    const start = done / total
    done += w.length
    return <span key={k} className={'w' + (progress > start ? ' sung' : '')}>{w}</span>
  })
}

// Spotify-style lyrics: a column that glides up as the song moves on. Sung lines are white,
// the current line is a little bigger and fills in word by word, upcoming lines are dim.
export default function Lyrics({ track, pos, dur }) {
  const [lyrics, setLyrics] = useState(undefined) // undefined = loading, null = none found
  const col = useRef(null)
  const box = useRef(null)
  const [shift, setShift] = useState(0)

  useEffect(() => {
    let live = true
    setLyrics(undefined)
    setShift(0)
    fetchLyrics(track).then(l => live && setLyrics(l))
    return () => { live = false }
  }, [track?.id])

  const cur = lyrics ? currentLine(lyrics, pos, dur) : -1

  // keep the current line in the upper third of the window, scrolling smoothly to it
  useLayoutEffect(() => {
    const el = col.current?.children[Math.max(0, cur)]
    if (!el || !box.current) return
    setShift(Math.max(0, el.offsetTop - box.current.clientHeight * 0.3 + el.offsetHeight / 2))
  }, [cur, lyrics])

  if (lyrics === undefined) return <div className="lyrics"><p className="lyr-msg">Loading lyrics…</p></div>
  if (!lyrics) return <div className="lyrics"><p className="lyr-msg">No lyrics found for this song</p></div>

  return (
    <div className="lyrics" ref={box}>
      <div className="lyr-col" ref={col} style={{ transform: `translateY(${-shift}px)` }}>
        {lyrics.lines.map((l, i) => (
          <p key={i} className={'lyr' + (i === cur ? ' now' : i < cur ? ' past' : '')}>
            {i === cur && lyrics.synced && l.text
              ? <Words text={l.text} progress={lineProgress(lyrics.lines, i, pos)} />
              : (l.text || '♪')}
          </p>
        ))}
      </div>
      {!lyrics.synced && <small className="lyr-note">Not time-synced</small>}
    </div>
  )
}
