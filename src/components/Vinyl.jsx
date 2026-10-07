import { useEffect } from 'react'
import { artists, img } from '../spotify'

// Full-screen retro turntable. Tap the record to go back.
export default function Vinyl({ track, playing, onClose }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [onClose])

  const art = img(track?.album?.images)
  return (
    <div className="vinyl-stage">
      <div className="vinyl-glow" style={{ backgroundImage: art ? `url(${art})` : undefined }} />
      <div className="deck">
        <button className={'record' + (playing ? ' spin' : '')} onClick={onClose} title="Tap to go back">
          <div className="grooves" />
          <div className="shine" />
          <div className="label" style={{ backgroundImage: art ? `url(${art})` : undefined }}>
            <span className="spindle" />
          </div>
        </button>
        <div className={'tonearm' + (playing ? ' on' : '')}>
          <span className="pivot" /><span className="arm" /><span className="head" />
        </div>
      </div>
      <div className="vinyl-meta">
        <h2>{track?.name || 'Nothing playing'}</h2>
        <p>{artists(track)}</p>
        <small>{playing ? 'NOW SPINNING' : 'PAUSED'} · tap the record to return</small>
      </div>
    </div>
  )
}
