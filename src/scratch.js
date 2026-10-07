// Vinyl-scratch sound. Like a real record, a short "groove" sample is played back at the speed and
// in the direction the finger turns the disc: slow drag = low and muffled, fast flick = high and bright,
// finger still = instant silence.
let ctx, fwd, rev, gFwd, gRev, lp, master
let remote = null // open PeerJS connection to a speaker tab, if any
export const setRemote = c => { remote = c }
const send = m => { if (remote?.open) { remote.send(m); return true } return false }

// Seeking: one full turn of the record = 10 minutes of the song.
export const MS_PER_DEG = 600000 / 360
// Sound: a hand turning the record at this many degrees/second plays the groove at normal speed.
// Playback speed and loudness scale linearly with the finger from there.
const SOUND_DEG_PER_SEC = 90
let smooth = 0, lastMove = 0, watchdog = 0

// One second of a synthetic "ahh" stab: a buzzy vowel-like tone with a noisy attack and groove crackle.
function grooveBuffer(ctx) {
  const sr = ctx.sampleRate, len = sr
  const buf = ctx.createBuffer(1, len, sr)
  const d = buf.getChannelData(0)
  let ph = 0, n1 = 0, n2 = 0
  for (let i = 0; i < len; i++) {
    const t = i / sr
    const f = 70 + 15 * Math.sin(t * 6.3)   // low, slightly wobbling pitch so fast scratches stay musical
    ph += f / sr
    const saw = 2 * (ph % 1) - 1
    // crude vowel: emphasise ~700Hz and ~1200Hz with resonant one-pole filters
    n1 += (saw - n1) * 0.09; n2 += (saw - n2) * 0.17
    const vowel = (n2 - n1) * 3
    const env = 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 4)) // syllable pulses
    const noise = (Math.random() * 2 - 1) * (0.25 + 0.6 * Math.exp(-((t * 4) % 1) * 18)) // attack hiss
    const pop = Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 1.2 : 0
    d[i] = Math.tanh((vowel * env + noise * 0.35 + pop) * 1.4) * 0.8
  }
  return buf
}

function init() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return false
  // iOS 17+: mix with the Spotify app instead of pausing it
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient' } catch {}
  ctx = new AC({ latencyHint: 'interactive' })
  const buf = grooveBuffer(ctx)
  const rbuf = ctx.createBuffer(1, buf.length, buf.sampleRate)
  rbuf.getChannelData(0).set(buf.getChannelData(0).slice().reverse())

  lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 1.2
  master = ctx.createGain()
  master.gain.value = 0.9
  lp.connect(master).connect(ctx.destination)

  const mk = b => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = 0.0001; s.start(); return s }
  fwd = mk(buf); rev = mk(rbuf)
  gFwd = ctx.createGain(); gRev = ctx.createGain()
  gFwd.gain.value = gRev.gain.value = 0
  fwd.connect(gFwd).connect(lp)
  rev.connect(gRev).connect(lp)

  // if moves stop arriving (finger held still), cut the sound almost immediately
  const tick = () => { if (performance.now() - lastMove > 35 && smooth) apply(0); watchdog = requestAnimationFrame(tick) }
  watchdog = requestAnimationFrame(tick)
  return true
}

function apply(degPerSec) {
  // light smoothing removes touch jitter without adding audible lag
  smooth = Math.abs(degPerSec) < 1 ? 0 : smooth * 0.35 + degPerSec * 0.65
  const v = Math.abs(smooth)
  const t = ctx.currentTime
  const rate = Math.max(0.0001, Math.min(8, v / SOUND_DEG_PER_SEC))
  const loud = v < 4 ? 0 : Math.min(1, Math.pow(v / SOUND_DEG_PER_SEC, 0.6))
  const forward = smooth >= 0
  fwd.playbackRate.setTargetAtTime(rate, t, 0.004)
  rev.playbackRate.setTargetAtTime(rate, t, 0.004)
  gFwd.gain.setTargetAtTime(forward ? loud : 0, t, 0.006)
  gRev.gain.setTargetAtTime(forward ? 0 : loud, t, 0.006)
  lp.frequency.setTargetAtTime(Math.min(16000, 300 + rate * 900), t, 0.006) // slow = muffled, fast = bright
}

// call from a pointerdown so mobile browsers allow audio
export function scratchStart() {
  send({ t: 'start' })
  if (!ctx && !init()) return
  if (ctx.state === 'suspended') ctx.resume()
}

// degPerSec: how fast the finger is turning the record (sign = direction)
export function scratchSpeed(degPerSec, fromRemote) {
  if (!fromRemote && send({ t: 'speed', v: degPerSec })) return
  if (!ctx) return
  lastMove = performance.now()
  apply(degPerSec)
}

export function scratchStop(fromRemote) {
  if (!fromRemote && send({ t: 'stop' })) return
  if (ctx) apply(0)
}
