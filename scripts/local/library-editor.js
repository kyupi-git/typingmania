import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

import { isBaselineSongPath } from './library-baseline.js'
import { rebuildSongIndex, scanSongLibrary } from './library.js'

const MAX_DELETE_SELECTION = 500
const TRASH_DIRECTORY = '.library-trash'
const MANIFEST_FILENAME = 'manifest.json'

export class LibraryEditError extends Error {
  constructor (code, message) {
    super(message)
    this.name = 'LibraryEditError'
    this.code = code
  }
}

function transactionRoot (root) {
  return path.join(root, 'data', TRASH_DIRECTORY)
}

function insideRoot (root, filename) {
  const relative = path.relative(root, filename)
  return Boolean(
    relative &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    !relative
      .split(path.sep)
      .some(segment => segment.toLocaleLowerCase() === 'qqmusiccache')
  )
}

async function writeJson (filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true })
  await fs.writeFile(filename, JSON.stringify(value), 'utf8')
}

async function removeEmptyParents (root, directory) {
  let current = path.resolve(directory)
  while (current !== root && insideRoot(root, current)) {
    try {
      await fs.rmdir(current)
    } catch {
      break
    }
    current = path.dirname(current)
  }
}

async function rollbackTransaction (root, directory, manifest) {
  for (const entry of [...manifest.entries].reverse()) {
    const original = path.resolve(root, entry.original)
    const staged = path.join(directory, entry.staged)
    if (!insideRoot(root, original)) continue
    try {
      await fs.access(staged)
    } catch {
      continue
    }
    await fs.mkdir(path.dirname(original), { recursive: true })
    await fs.rename(staged, original)
  }
  await fs.rm(directory, { recursive: true, force: true })
}

export async function recoverLibraryEditTransactions (root) {
  const resolvedRoot = path.resolve(root)
  const trashRoot = transactionRoot(resolvedRoot)
  let directories
  try {
    directories = await fs.readdir(trashRoot, { withFileTypes: true })
  } catch {
    return { recovered: 0, finalized: 0 }
  }

  let recovered = 0
  let finalized = 0
  for (const entry of directories) {
    if (!entry.isDirectory()) continue
    const directory = path.join(trashRoot, entry.name)
    let manifest
    try {
      manifest = JSON.parse(
        await fs.readFile(path.join(directory, MANIFEST_FILENAME), 'utf8'),
      )
    } catch {
      await fs.rm(directory, { recursive: true, force: true })
      finalized++
      continue
    }
    if (manifest.state === 'committed') {
      await fs.rm(directory, { recursive: true, force: true })
      finalized++
    } else {
      await rollbackTransaction(resolvedRoot, directory, manifest)
      recovered++
    }
  }
  await fs.rmdir(trashRoot).catch(() => {})
  return { recovered, finalized }
}

function editableRecords (root, records) {
  return records.filter(record => (
    record._local_filename &&
    insideRoot(root, record._local_filename) &&
    !isBaselineSongPath(root, record._local_filename)
  ))
}

export async function inspectEditableLibrary (root) {
  const resolvedRoot = path.resolve(root)
  const library = await scanSongLibrary(resolvedRoot)
  const songs = editableRecords(resolvedRoot, library.records).map(record => ({
    id: record.url,
    title: String(record.title || ''),
    artist: String(record.artist || ''),
    language: String(record.language || ''),
    source: String(record.source?.service || ''),
  }))
  return { songs, count: songs.length }
}

async function pruneCacheFile (filename, keepEntry) {
  let cache
  try {
    cache = JSON.parse(await fs.readFile(filename, 'utf8'))
  } catch {
    return 0
  }
  if (!cache?.entries || typeof cache.entries !== 'object') return 0
  let removed = 0
  for (const [key, entry] of Object.entries(cache.entries)) {
    if (keepEntry(key, entry)) continue
    delete cache.entries[key]
    removed++
  }
  if (!removed) return 0
  if (Object.keys(cache.entries).length) {
    await writeJson(filename, cache)
  } else {
    await fs.rm(filename, { force: true })
  }
  return removed
}

export async function pruneUnusedLibraryCaches (root, records = null) {
  const resolvedRoot = path.resolve(root)
  const songs = records || (await scanSongLibrary(resolvedRoot)).records
  const singerMids = new Set()
  const catalogIds = new Set()
  for (const song of songs) {
    for (const artist of song.source?.artist_resolution?.artists || []) {
      if (artist.singer_mid) singerMids.add(String(artist.singer_mid))
    }
    for (const value of [
      song.origin?.catalog_id,
      song.source?.cover?.poster_catalog_id,
    ]) {
      if (value) catalogIds.add(String(value))
    }
  }

  const artists = await pruneCacheFile(
    path.join(resolvedRoot, 'data', 'qqmusic-artist-cache.json'),
    key => singerMids.has(String(key)),
  )
  let origins = 0
  for (const cacheName of [
    'song-origin-cache.json',
    'qqmusic-origin-cache.json',
  ]) {
    origins += await pruneCacheFile(
      path.join(resolvedRoot, 'data', cacheName),
      (_, entry) => (
        entry?.origin?.catalog_id &&
        catalogIds.has(String(entry.origin.catalog_id))
      ),
    )
  }
  return { artists, origins }
}

export async function deleteLibrarySongs (root, requestedIds) {
  const resolvedRoot = path.resolve(root)
  const ids = [...new Set((requestedIds || []).map(value => String(value)))]
  if (!ids.length) {
    throw new LibraryEditError(
      'EMPTY_SELECTION',
      'Select at least one song to delete.',
    )
  }
  if (ids.length > MAX_DELETE_SELECTION) {
    throw new LibraryEditError(
      'SELECTION_TOO_LARGE',
      `No more than ${MAX_DELETE_SELECTION} songs can be deleted at once.`,
    )
  }

  await recoverLibraryEditTransactions(resolvedRoot)
  const before = await scanSongLibrary(resolvedRoot)
  const editable = new Map(
    editableRecords(resolvedRoot, before.records)
      .map(record => [record.url, record]),
  )
  const selected = ids.map(id => editable.get(id))
  if (selected.some(record => !record)) {
    throw new LibraryEditError(
      'SONG_NOT_EDITABLE',
      'One or more selected songs are missing or protected.',
    )
  }

  const transactionId = crypto.randomUUID()
  const directory = path.join(transactionRoot(resolvedRoot), transactionId)
  const manifest = {
    version: 1,
    state: 'preparing',
    entries: selected.map((record, index) => ({
      id: record.url,
      title: String(record.title || ''),
      original: path.relative(resolvedRoot, record._local_filename),
      staged: `${String(index).padStart(4, '0')}-${path.basename(record._local_filename)}`,
    })),
  }
  await fs.mkdir(directory, { recursive: true })
  await writeJson(path.join(directory, MANIFEST_FILENAME), manifest)

  try {
    for (const entry of manifest.entries) {
      const original = path.resolve(resolvedRoot, entry.original)
      if (
        !insideRoot(resolvedRoot, original) ||
        isBaselineSongPath(resolvedRoot, original)
      ) {
        throw new LibraryEditError(
          'UNSAFE_SONG_PATH',
          'A selected song resolved outside the editable library.',
        )
      }
      await fs.rename(original, path.join(directory, entry.staged))
    }
    manifest.state = 'staged'
    await writeJson(path.join(directory, MANIFEST_FILENAME), manifest)

    const library = await rebuildSongIndex(resolvedRoot)
    manifest.state = 'committed'
    await writeJson(path.join(directory, MANIFEST_FILENAME), manifest)
    const prunedCaches = await pruneUnusedLibraryCaches(
      resolvedRoot,
      library.records,
    )
    await fs.rm(directory, { recursive: true, force: true })
    await fs.rmdir(transactionRoot(resolvedRoot)).catch(() => {})
    for (const entry of manifest.entries) {
      await removeEmptyParents(
        resolvedRoot,
        path.dirname(path.resolve(resolvedRoot, entry.original)),
      )
    }
    return {
      deleted: manifest.entries.length,
      songs: manifest.entries.map(({ id, title }) => ({ id, title })),
      remaining: library.records.length,
      prunedCaches,
    }
  } catch (error) {
    if (manifest.state === 'committed') {
      throw new LibraryEditError(
        'DELETE_CLEANUP_PENDING',
        'Songs were deleted, but temporary cleanup must finish on the next start.',
      )
    }
    await rollbackTransaction(resolvedRoot, directory, manifest).catch(() => {})
    await rebuildSongIndex(resolvedRoot).catch(() => {})
    throw error
  }
}
