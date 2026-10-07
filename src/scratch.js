// Synthesised vinyl-scratch sound: filtered noise whose pitch and loudness follow the record's speed.
let ctx, gain, filter, src

function init() {
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return false
  ctx = new AC()
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
  return true
}

// call from a pointerdown so mobile browsers allow audio
export function scratchStart() {
  if (!ctx && !init()) return
  if (ctx.state === 'suspended') ctx.resume()
}

// degPerSec: how fast the finger is turning the record (sign = direction)
export function scratchSpeed(degPerSec) {
  if (!ctx) return
  const v = Math.min(Math.abs(degPerSec), 1500)
  const t = ctx.currentTime
  filter.frequency.setTargetAtTime(200 + v * 2.2 * (degPerSec < 0 ? 0.75 : 1), t, 0.02)
  gain.gain.setTargetAtTime(Math.min(0.9, v / 700), t, 0.02)
}

export function scratchStop() {
  if (ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
}
