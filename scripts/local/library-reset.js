import {
  rebuildSongIndex,
  resetLibraryToBaseline,
} from './library.js'
import {
  deleteLibrarySongs,
  inspectEditableLibrary,
} from './library-editor.js'

export const RESETTABLE_LIBRARY_SOURCES = new Set([
  'qqmusic',
  'netease',
  'apple-music',
  'local-files',
])

export async function resetLibraryScope (root, scope) {
  if (scope === 'all') return resetLibraryToBaseline(root)
  if (!RESETTABLE_LIBRARY_SOURCES.has(scope)) {
    throw new Error('Unknown library reset scope')
  }
  const editable = await inspectEditableLibrary(root)
  const selected = editable.songs.filter(song => song.source === scope)
  let deleted = 0
  let prunedCaches = { artists: 0, origins: 0 }
  for (let offset = 0; offset < selected.length; offset += 500) {
    const batch = selected.slice(offset, offset + 500)
    const result = await deleteLibrarySongs(root, batch.map(song => song.id))
    deleted += result.deleted
    prunedCaches = {
      artists: prunedCaches.artists + Number(result.prunedCaches?.artists || 0),
      origins: prunedCaches.origins + Number(result.prunedCaches?.origins || 0),
    }
  }
  const library = await rebuildSongIndex(root)
  return {
    scope,
    deleted,
    failed: 0,
    remaining: library.records.filter(
      song => song.source?.service === scope,
    ).length,
    restored: true,
    prunedCaches,
  }
}
