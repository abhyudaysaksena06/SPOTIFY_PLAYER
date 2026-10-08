import { useState } from 'react'
import { artists, fmt, img } from '../spotify'
import { Device, Next, Pause, Play, Prev, Repeat, Shuffle, Volume } from './Icons'

// Thin Spotify-style slider: white fill, green on hover, thumb appears on hover.
export function Bar({ value, max, onChange, onCommit }) {
  const p = max ? (value / max) * 100 : 0
  return (
    <input type="range" className="bar" min="0" max={max || 1} value={value} style={{ '--p': p + '%' }}
      onChange={e => onChange(+e.target.value)}
      onPointerUp={e => onCommit(+e.target.value)}
      onKeyUp={e => onCommit(+e.target.value)} />
  )
}

export default function Player({ state, progress, volume, controls, vinyl, onArt, deviceName }) {
  const t = state?.item
  const [seek, setSeek] = useState(null)
  const [vol, setVol] = useState(null) // while dragging

  return (
    <footer className="player">
      <div className="now">
        <button className={'now-art' + (vinyl ? ' active' : '') + (state?.is_playing ? ' live' : '')} onClick={() => t && onArt()} title={vinyl ? 'Back to library' : 'Spin the record'}>
          {t ? <img src={img(t.album.images, 2)} alt="" /> : <span />}
        </button>
        <div className="now-text">
          <b>{t?.name || 'Nothing playing'}</b>
          <small>{t ? artists(t) : 'Open Spotify on your laptop'}</small>
        </div>
      </div>

      <div className="ctl">
        <div className="btns">
          <button className={'icon' + (state?.shuffle_state ? ' lit' : '')} onClick={controls.shuffle} title="Shuffle"><Shuffle /></button>
          <button className="icon" onClick={controls.prev} title="Previous"><Prev /></button>
          <button className="pp" onClick={controls.toggle} title={state?.is_playing ? 'Pause' : 'Play'}>
            {state?.is_playing ? <Pause /> : <Play />}
          </button>
          <button className="icon" onClick={controls.next} title="Next"><Next /></button>
          <button className={'icon' + (state?.repeat_state && state.repeat_state !== 'off' ? ' lit' : '')} onClick={controls.repeat} title="Repeat">
            <Repeat />{state?.repeat_state === 'track' && <sup>1</sup>}
          </button>
        </div>
        <div className="prog">
          <span>{fmt(seek ?? progress)}</span>
          <Bar value={seek ?? progress} max={t?.duration_ms} onChange={setSeek} onCommit={v => { controls.seek(v); setSeek(null) }} />
          <span>{fmt(t?.duration_ms)}</span>
        </div>
      </div>

      <div className="right">
        {deviceName && <span className="dev"><Device /> {deviceName}</span>}
        <Volume />
        <div className="vol"><Bar value={vol ?? volume ?? 50} max={100} onChange={v => { setVol(v); controls.volume(v) }} onCommit={v => { controls.volume(v); setVol(null) }} /></div>
      </div>
    </footer>
  )
}
