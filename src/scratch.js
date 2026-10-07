// Synthesised vinyl-scratch sound: filtered noise whose pitch and loudness follow the record's speed.
let ctx, gain, filter, src
let remote = null // open PeerJS connection to a speaker tab, if any
export const setRemote = c => { remote = c }
const send = m => { if (remote?.open) { remote.send(m); return true } return false }

// Seeking: one full turn of the record = 1 minute of the song.
export const MS_PER_DEG = 60000 / 360

let lastMove = 0
function init() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return false
  ctx = new AC({ latencyHint: 'interactive' })
  const len = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  // crackly noise: white noise plus occasional dust pops
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6 + (Math.random() < 0.0008 ? (Math.random() * 2 - 1) : 0)
  src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 4
  gain = ctx.createGain()
  gain.gain.value = 0
  src.connect(filter).connect(gain).connect(ctx.destination)
  src.start()
  // finger held still → fade out
  setInterval(() => { if (performance.now() - lastMove > 80) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05) }, 40)
  return true
}

// call from a pointerdown/click so browsers allow audio
export function scratchStart() {
  send({ t: 'start' })
  if (!ctx && !init()) return
  if (ctx.state === 'suspended') ctx.resume()
}

// degPerSec: how fast the finger is turning the record (sign = direction)
export function scratchSpeed(degPerSec, fromRemote) {
  if (!fromRemote && send({ t: 'speed', v: degPerSec })) return
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()
  lastMove = performance.now()
  const v = Math.min(Math.abs(degPerSec), 1500)
  const t = ctx.currentTime
  filter.frequency.setTargetAtTime(200 + v * 2.2 * (degPerSec < 0 ? 0.75 : 1), t, 0.02)
  gain.gain.setTargetAtTime(Math.min(0.9, v / 700), t, 0.02)
}

export function scratchStop(fromRemote) {
  if (!fromRemote && send({ t: 'stop' })) return
  if (ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
}

// short "zip" so you can check the speaker device is actually making sound
export function scratchTest() {
  scratchStart()
  if (!ctx) return
  let i = 0
  const id = setInterval(() => { scratchSpeed(i < 6 ? 600 : -500, true); if (++i > 12) clearInterval(id) }, 30)
}
