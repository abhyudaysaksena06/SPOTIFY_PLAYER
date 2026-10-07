import { useState } from 'react'
import { artists, fmt, img } from '../spotify'

export default function Player({ state, progress, controls, onArt }) {
  const t = state?.item
  const [seeking, setSeeking] = useState(null)
  const dur = t?.duration_ms || 1
  return (
    <footer className="player">
      <div className="now">
        <button className={'now-art' + (state?.is_playing ? ' live' : '')} onClick={() => t && onArt()} title="Open vinyl view">
          {t ? <img src={img(t.album.images, 2)} alt="" /> : <span>♪</span>}
          <i className="mini-disc" />
        </button>
        <div>
          <b>{t?.name || 'Nothing playing'}</b>
          <small>{t ? artists(t) : 'Open the Spotify desktop app'}</small>
        </div>
      </div>
      <div className="ctl">
        <div className="btns">
          <button className={state?.shuffle_state ? 'lit' : ''} onClick={controls.shuffle} title="Shuffle">⤮</button>
          <button onClick={controls.prev} title="Previous">⏮</button>
          <button className="pp" onClick={controls.toggle} title="Play / Pause">{state?.is_playing ? '⏸' : '▶'}</button>
          <button onClick={controls.next} title="Next">⏭</button>
          <button className={state?.repeat_state && state.repeat_state !== 'off' ? 'lit' : ''} onClick={controls.repeat} title="Repeat">
            {state?.repeat_state === 'track' ? '↻¹' : '↻'}
          </button>
        </div>
        <div className="prog">
          <span>{fmt(seeking ?? progress)}</span>
          <input type="range" min="0" max={dur} value={seeking ?? progress}
            onChange={e => setSeeking(+e.target.value)}
            onPointerUp={() => { if (seeking != null) controls.seek(seeking); setSeeking(null) }}
            onKeyUp={() => { if (seeking != null) controls.seek(seeking); setSeeking(null) }} />
          <span>{fmt(t?.duration_ms)}</span>
        </div>
      </div>
      <div className="right">
        🔊 <input type="range" min="0" max="100" key={state?.device?.id}
          defaultValue={state?.device?.volume_percent ?? 50}
          onPointerUp={e => controls.volume(e.target.value)} />
      </div>
    </footer>
  )
}
