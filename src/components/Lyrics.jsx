import { useEffect, useState } from 'react'
import { currentLine, fetchLyrics } from '../lyrics'

const SHOW = 4 // lines visible at once

// A small window of lyrics that follows the song: the sung line is bright, the rest dimmed.
export default function Lyrics({ track, pos, dur }) {
  const [lyrics, setLyrics] = useState(undefined) // undefined = loading, null = none found
  useEffect(() => {
    let live = true
    setLyrics(undefined)
    fetchLyrics(track).then(l => live && setLyrics(l))
    return () => { live = false }
  }, [track?.id])

  if (lyrics === undefined) return <div className="lyrics"><p className="lyr-msg">Loading lyrics…</p></div>
  if (!lyrics) return <div className="lyrics"><p className="lyr-msg">No lyrics found for this song</p></div>

  const cur = currentLine(lyrics, pos, dur)
  // keep the current line second from the top, so one past line and two upcoming lines show
  const start = Math.max(0, Math.min(lyrics.lines.length - SHOW, cur - 1))
  const view = lyrics.lines.slice(start, start + SHOW)
  return (
    <div className="lyrics">
      {view.map((l, k) => {
        const i = start + k
        return <p key={i} className={'lyr' + (i === cur ? ' now' : i < cur ? ' past' : '')}>{l.text || '♪'}</p>
      })}
      {!lyrics.synced && <small className="lyr-note">Not time-synced</small>}
    </div>
  )
}
