// Peer-to-peer link between the phone (controller) and the device playing Spotify (speaker).
// Both tabs are logged into the same Spotify account, so the speaker's peer id is derived from the user id.
import Peer from 'peerjs'
import { scratchSpeed, scratchStart, scratchStop, scratchTest, setRemote } from './scratch'

const idFor = userId => 'spconsole-' + userId.replace(/[^a-zA-Z0-9]/g, '')
let peer = null
let retry = null

function reset() {
  clearTimeout(retry)
  setRemote(null)
  peer?.destroy()
  peer = null
}

// This tab plays the scratch sound for whoever is spinning the record.
export function startSpeaker(userId, onStatus) {
  reset()
  scratchTest() // unlock audio during the click, and let you hear that this device works
  peer = new Peer(idFor(userId))
  peer.on('open', () => onStatus('speaker'))
  peer.on('connection', c => {
    onStatus('speaker-linked')
    c.on('data', m => {
      if (m.t === 'start') scratchStart()
      else if (m.t === 'speed') scratchSpeed(m.v, true)
      else if (m.t === 'stop') scratchStop(true)
    })
    c.on('close', () => onStatus('speaker'))
  })
  peer.on('error', e => onStatus(e.type === 'unavailable-id' ? 'taken' : 'error'))
}

// This tab sends its scratching to the speaker, if one is online; otherwise it plays locally.
export function startController(userId, onStatus) {
  reset()
  peer = new Peer()
  const tryConnect = () => {
    if (!peer || peer.destroyed) return
    const c = peer.connect(idFor(userId), { reliable: false })
    c.on('open', () => { setRemote(c); onStatus('linked') })
    c.on('close', () => { setRemote(null); onStatus('local'); retry = setTimeout(tryConnect, 5000) })
  }
  peer.on('open', tryConnect)
  peer.on('error', e => { if (e.type === 'peer-unavailable') { onStatus('local'); retry = setTimeout(tryConnect, 10000) } })
}

export const stopRemote = reset
