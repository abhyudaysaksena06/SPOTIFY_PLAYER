// Synthesised vinyl-scratch sound, driven every animation frame by how fast the record is moving
// relative to normal playback. Two layers:
//  - groove noise through a bandpass that sweeps up with speed (the hiss/"zzz" of the needle)
//  - a buzzy low tone whose pitch rises and falls with speed (the "wicka" body of a scratch)
let ctx, out, nGain, bp, tGain, osc, tLp
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
  out = ctx.createDynamicsCompressor()
  out.connect(ctx.destination)

  // layer 1: crackly groove noise
  const len = ctx.sampleRate * 2
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.6 + (Math.random() < 0.0008 ? (Math.random() * 2 - 1) : 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 4
  nGain = ctx.createGain()
  nGain.gain.value = 0
  src.connect(bp).connect(nGain).connect(out)
  src.start()

  // layer 2: pitched body
  osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.value = 40
  tLp = ctx.createBiquadFilter()
  tLp.type = 'lowpass'
  tLp.frequency.value = 600
  tLp.Q.value = 3
  tGain = ctx.createGain()
  tGain.gain.value = 0
  osc.connect(tLp).connect(tGain).connect(out)
  osc.start()

  // nothing arriving (finger held still / speaker lost the phone) → fade out
  setInterval(() => { if (performance.now() - lastMove > 90) silence() }, 40)
  return true
}

function silence() {
  const t = ctx.currentTime
  nGain.gain.setTargetAtTime(0, t, 0.03)
  tGain.gain.setTargetAtTime(0, t, 0.03)
}

// call from a pointerdown/click so browsers allow audio
export function scratchStart() {
  send({ t: 'start' })
  if (!ctx && !init()) return
  if (ctx.state === 'suspended') ctx.resume()
}

// degPerSec: speed of the record relative to normal playback (sign = direction)
export function scratchSpeed(degPerSec, fromRemote) {
  if (!fromRemote && send({ t: 'speed', v: degPerSec })) return
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()
  lastMove = performance.now()
  const v = Math.min(Math.abs(degPerSec), 1800)
  const t = ctx.currentTime
  const k = 0.012 // response time: fast enough to feel attached to the finger
  const level = v < 6 ? 0 : Math.min(1, Math.pow(v / 450, 0.7))
  const back = degPerSec < 0
  bp.frequency.setTargetAtTime(180 + v * (back ? 1.3 : 1.7), t, k)
  bp.Q.setTargetAtTime(2.5 + Math.min(4, v / 300), t, k)
  nGain.gain.setTargetAtTime(level * 0.85, t, k)
  osc.frequency.setTargetAtTime(28 + v * (back ? 0.28 : 0.34), t, k)
  tLp.frequency.setTargetAtTime(350 + v * 1.4, t, k)
  tGain.gain.setTargetAtTime(level * 0.35, t, k)
}

export function scratchStop(fromRemote) {
  if (!fromRemote && send({ t: 'stop' })) return
  if (ctx) silence()
}

// short back-and-forth so you can check the speaker device is actually making sound
export function scratchTest() {
  scratchStart()
  if (!ctx) return
  let i = 0
  const id = setInterval(() => { scratchSpeed(Math.sin(i / 3) * 700, true); if (++i > 20) clearInterval(id) }, 25)
}
