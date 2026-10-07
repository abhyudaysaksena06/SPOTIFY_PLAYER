import { artists, img } from '../spotify'

// Spinning record "screen saver" shown inside the main panel. Click the record to go back.
export default function Vinyl({ track, playing, onClose }) {
  const art = img(track?.album?.images)
  return (
    <div className="vinyl-stage">
      <div className="vinyl-glow" style={{ backgroundImage: art ? `url(${art})` : undefined }} />
      <div className="deck">
        <button className={'record' + (playing ? ' spin' : '')} onClick={onClose} title="Back to library">
          <span className="grooves" />
          <span className="shine" />
          <span className="label" style={{ backgroundImage: art ? `url(${art})` : undefined }}>
            <span className="spindle" />
          </span>
        </button>
        <div className={'tonearm' + (playing ? ' on' : '')}>
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
