import { useCallback, useEffect, useRef, useState } from 'react'
import { api, store } from './spotify'

// Polls the Spotify Connect player and exposes remote-control actions.
export function usePlayer(toast) {
  const [state, setState] = useState(null)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(store.get('device'))
  const [progress, setProgress] = useState(0)
  const syncedAt = useRef(0)
  const dev = useRef(deviceId)
  dev.current = deviceId

  const poll = useCallback(async () => {
    try {
      const s = await api('/me/player')
      syncedAt.current = Date.now()
      setState(s)
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
    const a = setInterval(poll, 3000)
    return () => clearInterval(a)
  }, [poll, loadDevices])

  // smooth progress between polls
  useEffect(() => {
    const t = setInterval(() => {
      if (!state?.item) return setProgress(0)
      const extra = state.is_playing ? Date.now() - syncedAt.current : 0
      setProgress(Math.min(state.item.duration_ms, state.progress_ms + extra))
    }, 250)
    return () => clearInterval(t)
  }, [state])

  const err = e => toast(/premium/i.test(e.message) ? 'Spotify Premium is required for remote playback' : e.message)
  const later = () => setTimeout(poll, 450)

  const play = async body => {
    const id = dev.current || (await loadDevices().catch(() => null))
    if (!id) return toast('No device found — open the Spotify desktop app and play something once')
    try { await api('/me/player/play?device_id=' + id, { method: 'PUT', body: JSON.stringify(body) }); later() } catch (e) { err(e) }
  }
  const cmd = async (path, method = 'POST') => {
    try { await api('/me/player/' + path + (path.includes('?') ? '&' : '?') + 'device_id=' + (dev.current || ''), { method }); later() } catch (e) { err(e) }
  }
  const selectDevice = async id => {
    setDeviceId(id); store.set('device', id)
    try { await api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [id] }) }); later() } catch (e) { err(e) }
  }

  const controls = {
    play,
    toggle: () => state?.is_playing ? cmd('pause', 'PUT') : state?.item ? cmd('play', 'PUT') : toast('Pick a song to play'),
    next: () => cmd('next'),
    prev: () => cmd('previous'),
    shuffle: () => cmd('shuffle?state=' + !state?.shuffle_state, 'PUT'),
    repeat: () => cmd('repeat?state=' + { off: 'context', context: 'track', track: 'off' }[state?.repeat_state || 'off'], 'PUT'),
    volume: v => cmd('volume?volume_percent=' + v, 'PUT'),
    seek: ms => { setProgress(ms); cmd('seek?position_ms=' + Math.round(ms), 'PUT') },
    selectDevice, loadDevices,
  }
  return { state, progress, devices, deviceId, controls }
}
