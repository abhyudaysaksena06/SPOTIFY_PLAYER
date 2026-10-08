import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MUSIC, currentLine, fetchLyrics } from '../lyrics'

// Spotify-style lyrics: a column that glides up as the song moves on. The current line is white
// and a little bigger, lines already sung stay soft white, upcoming lines are dim.
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

  // keep the current line exactly in the middle of the window, scrolling smoothly to it.
  // Measured from the column's own layout (ignoring its current transform), and re-measured
  // whenever the window or the column changes size (fonts loading, rotating the phone).
  const centre = () => {
    const el = col.current?.children[Math.max(0, cur)]
    if (!el || !box.current) return
    const lineMid = el.offsetTop - col.current.offsetTop + el.offsetHeight / 2
    setShift(lineMid - box.current.clientHeight / 2)
  }
  useLayoutEffect(centre, [cur, lyrics])
  useEffect(() => {
    if (!box.current || !col.current) return
    const ro = new ResizeObserver(centre)
    ro.observe(box.current); ro.observe(col.current)
    return () => ro.disconnect()
  })

  // nothing to show (loading, or no lyrics for this song): just the notes, in the middle
  if (!lyrics) return (
    <div className="lyrics only-music">
      <p className={'lyr music' + (lyrics === null ? ' now' : '')}>{MUSIC}</p>
    </div>
  )

  return (
    <div className="lyrics" ref={box}>
      <div key={track?.id} className="lyr-col" ref={col} style={{ transform: `translateY(${-shift}px)` }}>
        {lyrics.lines.map((l, i) => (
          <p key={i} className={'lyr' + (l.music ? ' music' : '') + (i === cur ? ' now' : i < cur ? ' past' : '')}>
            {l.text || '♪'}
          </p>
        ))}
      </div>
      {!lyrics.synced && <small className="lyr-note">Not time-synced</small>}
    </div>
  )
}
