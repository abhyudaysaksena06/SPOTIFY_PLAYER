// Peer-to-peer link between the phone (controller) and the device playing Spotify (speaker).
// Both tabs are logged into the same Spotify account, so the speaker's peer id is derived from the user id.
//
// Self-healing: the speaker sends a heartbeat every 2s; a controller that misses them drops the link and
// reconnects. A speaker whose id is still held by the signalling server (e.g. its window was just
// closed and reopened) keeps retrying until the old registration expires.
import Peer from 'peerjs'
import { scratchSpeed, scratchStart, scratchStop, scratchTest, setRemote } from './scratch'

const idFor = userId => 'spconsole-' + userId.replace(/[^a-zA-Z0-9]/g, '')
const PING_MS = 2000
const DEAD_MS = 10000

let peer = null
let timers = []
const later = (fn, ms) => timers.push(setTimeout(fn, ms))
const every = (fn, ms) => timers.push(setInterval(fn, ms))

function reset() {
  timers.forEach(t => { if (t?.clear) t.clear(); else { clearTimeout(t); clearInterval(t) } })
  timers = []
  setRemote(null)
  peer?.destroy()
  peer = null
}

// If the link to the signalling server drops (network blip, laptop sleep), get back on it.
function stayOnline(p, restart) {
  p.on('disconnected', () => { if (!p.destroyed) try { p.reconnect() } catch { restart() } })
}

// This tab plays the scratch sound for whoever is spinning the record.
export function startSpeaker(userId, onStatus, quiet) {
  reset()
  if (!quiet) scratchTest() // unlock audio during the click, and let you hear that this device works
  const restart = () => later(() => startSpeaker(userId, onStatus, true), 3000)
  const p = peer = new Peer(idFor(userId))
  const conns = new Set()
  stayOnline(p, restart)
  p.on('open', () => onStatus(conns.size ? 'speaker-linked' : 'speaker'))
  p.on('connection', c => {
    c.on('open', () => { conns.add(c); onStatus('speaker-linked') })
    c.on('data', m => {
      if (m.t === 'start') scratchStart()
      else if (m.t === 'speed') scratchSpeed(m.v, true)
      else if (m.t === 'stop') scratchStop(true)
    })
    const gone = () => { conns.delete(c); if (!conns.size) onStatus('speaker') }
    c.on('close', gone)
    c.on('error', gone)
  })
  // heartbeat so phones can tell this speaker is alive
  every(() => conns.forEach(c => { try { c.open && c.send({ t: 'ping' }) } catch {} }), PING_MS)
  p.on('error', e => {
    // id still held by a previous window (closed abruptly) → wait for it to expire and try again
    onStatus(e.type === 'unavailable-id' ? 'reclaiming' : 'error')
    if (['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) restart()
  })
}

// This tab sends its scratching to the speaker, if one is online; otherwise it plays locally.
export function startController(userId, onStatus) {
  reset()
  const restart = () => later(() => startController(userId, onStatus), 3000)
  const p = peer = new Peer()
  stayOnline(p, restart)
  let conn = null, lastPing = 0, connecting = false

  const drop = () => {
    if (conn) { try { conn.close() } catch {} }
    conn = null
    setRemote(null)
    onStatus('local')
  }
  const tryConnect = () => {
    if (p.destroyed || conn || connecting) return
    connecting = true
    const c = p.connect(idFor(userId), { reliable: false })
    const giveUp = setTimeout(() => { connecting = false; if (!c.open) try { c.close() } catch {} }, 5000)
    c.on('open', () => {
      clearTimeout(giveUp); connecting = false
      conn = c; lastPing = Date.now()
      setRemote(c); onStatus('linked')
    })
    c.on('data', m => { if (m?.t === 'ping') lastPing = Date.now() })
    c.on('close', () => { clearTimeout(giveUp); connecting = false; if (conn === c) drop() })
    c.on('error', () => { clearTimeout(giveUp); connecting = false; if (conn === c) drop() })
  }

  p.on('open', tryConnect)
  // every few seconds: reconnect if not linked, or drop a link whose heartbeat stopped
  every(() => {
    if (conn && Date.now() - lastPing > DEAD_MS) drop()
    if (!conn) tryConnect()
  }, 3000)
  // coming back to the tab (phone unlocked, app switched) → check right away
  const wake = () => { if (!document.hidden) { if (conn && Date.now() - lastPing > DEAD_MS) drop(); if (!conn) tryConnect() } }
  document.addEventListener('visibilitychange', wake)
  timers.push({ clear: () => document.removeEventListener('visibilitychange', wake) })
  p.on('error', e => {
    if (e.type === 'peer-unavailable') { connecting = false; onStatus('local') }
    else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) restart()
  })
}

export const stopRemote = reset
