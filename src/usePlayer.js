import { useCallback, useEffect, useRef, useState } from 'react'
import { api, rateLimited, store } from './spotify'

// Spotify's dev-mode quota is small and shared, so poll gently; commands update the UI instantly anyway.
const POLL_VISIBLE = 3000
const POLL_HIDDEN = 30000

// Polls the Spotify Connect player and exposes remote-control actions.
// Commands update the UI immediately (optimistic) and any poll that started before the
// latest command is thrown away, so the screen never jumps back to stale state.
export function usePlayer(toast) {
  const [state, setState] = useState(null)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(store.get('device'))
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(null)
  const syncedAt = useRef(0)
  const cmdAt = useRef(0)
  const volAt = useRef(0)
  const volSent = useRef(0)
  const volNext = useRef(0)
  const volTimer = useRef(null)
  const dev = useRef(deviceId)
  dev.current = deviceId

  const poll = useCallback(async () => {
    const started = Date.now()
    try {
      if (rateLimited()) return
      const s = await api('/me/player', { background: true })
      if (started < cmdAt.current) return // a command was sent while this was in flight
      syncedAt.current = Date.now()
      setState(s)
      if (s?.device?.volume_percent != null && Date.now() - volAt.current > 2500) setVolume(s.device.volume_percent)
      if (s?.device?.id && !dev.current) setDeviceId(s.device.id)
    } catch {}
  }, [])

  const loadDevices = useCallback(async () => {
    const { devices } = await api('/me/player/devices')
    setDevices(devices)
    let id = dev.current
    if (!devices.find(d => d.id === id))
      id = (devices.find(d => d.is_active) || devices.find(d => d.type === 'Computer') || devices[0])?.id || null
    setDeviceId(id)
    if (id) store.set('device', id)
    return id
  }, [])

  useEffect(() => {
    loadDevices().catch(() => {})
    poll()
    let t
    const schedule = () => { t = setTimeout(async () => { await poll(); schedule() }, document.hidden ? POLL_HIDDEN : POLL_VISIBLE) }
    schedule()
    const vis = () => { if (!document.hidden) poll() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', vis) }
  }, [poll, loadDevices])

  // smooth progress between polls
  useEffect(() => {
    const t = setInterval(() => {
      if (!state?.item) return setProgress(0)
      const extra = state.is_playing ? Date.now() - syncedAt.current : 0
      setProgress(Math.min(state.item.duration_ms, state.progress_ms + extra))
    }, 200)
    return () => clearInterval(t)
  }, [state])

  const err = e => toast(/premium/i.test(e.message) ? 'Spotify Premium is required for remote playback' : e.message)

  // apply an optimistic change to the local state right away
  const patch = p => {
    cmdAt.current = Date.now()
    setState(s => s && { ...s, ...p })
  }
  const settle = (ms = 350) => setTimeout(poll, ms)

  const play = async body => {
    const id = dev.current || (await loadDevices().catch(() => null))
    if (!id) return toast('No device found — open Spotify on your device and play something once')
    cmdAt.current = Date.now()
    const send = d => api('/me/player/play?device_id=' + d, { method: 'PUT', body: JSON.stringify(body) })
    const wake = d => api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [d], play: false }) }).catch(() => {})
    const deviceProblem = e => e.status === 404 || /device|no active|restriction/i.test(e.message)
    try { await send(id) } catch (e) {
      if (!deviceProblem(e)) return err(e)
      // 1) the device is idle: make it the active player, then try again
      await wake(id)
      try { await send(id) } catch (e2) {
        if (!deviceProblem(e2)) return err(e2)
        // 2) the device id went stale (app restarted): refresh the list and try once more
        store.del('device'); dev.current = null
        const fresh = await loadDevices().catch(() => null)
        if (!fresh) return toast('Your Spotify device is offline — open Spotify on it and play something once')
        await wake(fresh)
        try { await send(fresh) } catch (e3) { return err(e3) }
      }
    }
    settle(250); settle(900)
  }
  const lastErr = useRef({ msg: '', at: 0 })
  const cmd = async (path, method = 'POST', again = true, quiet = false) => {
    const dq = dev.current ? (path.includes('?') ? '&' : '?') + 'device_id=' + dev.current : ''
    try {
      await api('/me/player/' + path + dq, { method, background: quiet })
      if (again) { settle(); settle(1000) }
    } catch (e) {
      // don't flood the screen with the same error while dragging/scratching
      const now = Date.now()
      if (!quiet || lastErr.current.msg !== e.message || now - lastErr.current.at > 5000) {
        lastErr.current = { msg: e.message, at: now }
        if (/volume/i.test(e.message) || e.status === 403 && /volume/.test(path)) toast("This device doesn't allow volume control from the web")
        else err(e)
      }
      if (!quiet) settle(0)
    }
  }
  const selectDevice = async id => {
    setDeviceId(id); store.set('device', id)
    try { await api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [id] }) }); settle() } catch (e) { err(e) }
  }

  const controls = {
    play,
    toggle: () => {
      if (!state?.item) return toast('Pick a song to play')
      const playing = state.is_playing
      // freeze progress at the current position so the bar doesn't jump
      patch({ is_playing: !playing, progress_ms: progress }); syncedAt.current = Date.now()
      cmd(playing ? 'pause' : 'play', 'PUT')
    },
    next: () => { patch({}); cmd('next') },
    prev: () => { patch({}); cmd('previous') },
    shuffle: () => { patch({ shuffle_state: !state?.shuffle_state }); cmd('shuffle?state=' + !state?.shuffle_state, 'PUT') },
    repeat: () => {
      const n = { off: 'context', context: 'track', track: 'off' }[state?.repeat_state || 'off']
      patch({ repeat_state: n }); cmd('repeat?state=' + n, 'PUT')
    },
    // called on every slider move: sends at most every 250ms while dragging, plus the final value
    volume: v => {
      volAt.current = Date.now(); setVolume(+v)
      const send = () => { volSent.current = Date.now(); cmd('volume?volume_percent=' + Math.round(volNext.current), 'PUT', false, true) }
      volNext.current = +v
      clearTimeout(volTimer.current)
      const wait = 250 - (Date.now() - volSent.current)
      if (wait <= 0) send(); else volTimer.current = setTimeout(send, wait)
    },
    // live: used while scratching — no follow-up polls, so many seeks in a row stay cheap
    seek: (ms, live) => {
      patch({ progress_ms: Math.round(ms) }); syncedAt.current = Date.now(); setProgress(ms)
      return cmd('seek?position_ms=' + Math.round(ms), 'PUT', !live, live)
    },
    selectDevice, loadDevices,
  }
  return { state, progress, devices, deviceId, volume, controls }
}
