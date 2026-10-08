import { useCallback, useEffect, useRef, useState } from 'react'
import { api, store } from './spotify'

const POLL_VISIBLE = 1500
const POLL_HIDDEN = 10000

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
  const dev = useRef(deviceId)
  dev.current = deviceId

  const poll = useCallback(async () => {
    const started = Date.now()
    try {
      const s = await api('/me/player')
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
    try { await send(id) } catch (e) {
      // device id went stale (app restarted / went to sleep): refresh the list and try once more
      if (e.status !== 404 && !/device/i.test(e.message)) return err(e)
      store.del('device'); dev.current = null
      const fresh = await loadDevices().catch(() => null)
      if (!fresh) return toast('Your Spotify device is offline — open Spotify on it and play something once')
      try { await send(fresh) } catch (e2) { return err(e2) }
    }
    settle(250); settle(900)
  }
  const cmd = async (path, method = 'POST', again = true) => {
    try {
      await api('/me/player/' + path + (path.includes('?') ? '&' : '?') + 'device_id=' + (dev.current || ''), { method })
      if (again) { settle(); settle(1000) }
    } catch (e) { err(e); settle(0) }
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
    volume: v => { volAt.current = Date.now(); setVolume(+v); cmd('volume?volume_percent=' + Math.round(v), 'PUT', false) },
    // live: used while scratching — no follow-up polls, so many seeks in a row stay cheap
    seek: (ms, live) => {
      patch({ progress_ms: Math.round(ms) }); syncedAt.current = Date.now(); setProgress(ms)
      cmd('seek?position_ms=' + Math.round(ms), 'PUT', !live)
    },
    selectDevice, loadDevices,
  }
  return { state, progress, devices, deviceId, volume, controls }
}
