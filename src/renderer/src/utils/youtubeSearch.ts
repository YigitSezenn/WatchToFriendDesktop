import type { YtSearchResult } from '../types'

const YT_API_KEY =
  (import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined) ??
  ''

/** YouTube Data API — yalnızca gömülebilir videoları döndürür */
async function embeddableVideoIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids.join(',')}&key=${YT_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return new Set(ids)
    const data = await res.json()
    const items = data.items as Array<{ id?: string; status?: { embeddable?: boolean } }> | undefined
    if (!items) return new Set()
    return new Set(
      items
        .filter(it => it.id && it.status?.embeddable !== false)
        .map(it => it.id as string)
    )
  } catch {
    return new Set(ids)
  }
}

export async function searchYouTube(query: string): Promise<YtSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20` +
      `&q=${encodeURIComponent(q)}&key=${YT_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    const items = data.items as Array<{
      id?: { videoId?: string }
      snippet?: { title?: string; channelTitle?: string; thumbnails?: { default?: { url?: string } } }
    }> | undefined
    if (!items) return []
    return items
      .map((it) => {
        const videoId = it.id?.videoId ?? ''
        const sn = it.snippet
        if (!videoId || !sn) return null
        return {
          videoId,
          title: sn.title ?? '',
          channelTitle: sn.channelTitle ?? '',
          thumbnailUrl: sn.thumbnails?.default?.url ?? ''
        } satisfies YtSearchResult
      })
      .filter((r): r is YtSearchResult => r != null)
    const allowed = await embeddableVideoIds(results.map(r => r.videoId))
    return results.filter(r => allowed.has(r.videoId))
  } catch {
    return []
  }
}

export async function fetchVideoTitle(url: string): Promise<string> {
  if (!url.includes('youtu')) return url
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    )
    if (!res.ok) return url
    const data = await res.json()
    return (data.title as string) || url
  } catch {
    return url
  }
}
