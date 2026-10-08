import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { currentLine, fetchLyrics } from '../lyrics'

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

  // keep the current line in the middle of the window, scrolling smoothly to it
  useLayoutEffect(() => {
    const el = col.current?.children[Math.max(0, cur)]
    if (!el || !box.current) return
    setShift(el.offsetTop + el.offsetHeight / 2 - box.current.clientHeight / 2)
  }, [cur, lyrics])

  if (lyrics === undefined) return <div className="lyrics"><p className="lyr-msg">Loading lyrics…</p></div>
  if (!lyrics) return <div className="lyrics"><p className="lyr-msg">No lyrics found for this song</p></div>

  return (
    <div className="lyrics" ref={box}>
      <div className="lyr-col" ref={col} style={{ transform: `translateY(${-shift}px)` }}>
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
