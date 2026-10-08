// Lyrics from LRCLIB (https://lrclib.net), a free public lyrics API that allows browser requests.
// Returns { synced: bool, lines: [{ t: ms | null, text }] } or null when nothing is found.
const cache = new Map()

function parseLrc(lrc) {
  const lines = []
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const [, m, s] of stamps) lines.push({ t: (+m * 60 + +s) * 1000, text })
  }
  // blank lines (musical pauses) would show as empty rows and make the spacing uneven
  return lines.filter(l => l.text).sort((a, b) => a.t - b.t)
}

function shape(rec) {
  if (!rec) return null
  if (rec.syncedLyrics) {
    const lines = parseLrc(rec.syncedLyrics)
    if (lines.length) return { synced: true, lines }
  }
  if (rec.plainLyrics) {
    const lines = rec.plainLyrics.split('\n').map(text => ({ t: null, text: text.trim() })).filter(l => l.text)
    if (lines.length) return { synced: false, lines }
  }
  if (rec.instrumental) return { synced: false, lines: [{ t: null, text: '♪ Instrumental ♪' }] }
  return null
}

export async function fetchLyrics(track) {
  if (!track?.id) return null
  if (cache.has(track.id)) return cache.get(track.id)
  const artist = track.artists?.[0]?.name || ''
  const p = (async () => {
    const exact = new URLSearchParams({
      track_name: track.name, artist_name: artist, album_name: track.album?.name || '',
      duration: Math.round((track.duration_ms || 0) / 1000),
    })
    let r = await fetch('https://lrclib.net/api/get?' + exact)
    if (r.ok) { const got = shape(await r.json()); if (got) return got }
    // fall back to a search and take the closest-length match
    r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ track_name: track.name, artist_name: artist }))
    if (!r.ok) return null
    const list = await r.json()
    const secs = (track.duration_ms || 0) / 1000
    list.sort((a, b) => (!!b.syncedLyrics - !!a.syncedLyrics) || Math.abs(a.duration - secs) - Math.abs(b.duration - secs))
    for (const rec of list) { const got = shape(rec); if (got) return got }
    return null
  })().catch(() => null)
  cache.set(track.id, p)
  const res = await p
  if (!res) cache.delete(track.id) // allow a retry later
  return res
}

// Index of the line being sung at song position `ms`.
export function currentLine(lyrics, ms, dur) {
  if (!lyrics?.lines.length) return -1
  if (!lyrics.synced) return Math.min(lyrics.lines.length - 1, Math.floor((ms / (dur || 1)) * lyrics.lines.length))
  let i = -1
  for (let k = 0; k < lyrics.lines.length; k++) { if (lyrics.lines[k].t <= ms + 250) i = k; else break }
  return i
}
