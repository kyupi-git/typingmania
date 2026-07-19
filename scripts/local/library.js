import fs from 'fs/promises'
import path from 'path'

import {
  canonicalSongTitle,
  songContentIdentity,
  songsAreEquivalent,
} from './song-identity.js'
import {
  ensureLibraryBaseline,
  isBaselineSongPath,
  LIBRARY_BASELINE,
} from './library-baseline.js'
import { readPackedSongMetadata } from './packed-song-reader.js'

export {
  canonicalSongTitle,
  songContentIdentity,
  songsAreEquivalent,
} from './song-identity.js'

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.agents',
  '.codex',
  '.library-trash',
  'node_modules',
  'QQMusicCache',
])

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function normalizeIdentityPart (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

export function songIdentity (song) {
  const source = song.source || {}
  if (source.service === 'qqmusic' && source.song_mid) {
    return `qqmusic:${source.song_mid}`
  }
  return songContentIdentity(song)
}

function songQualityScore (song) {
  const source = song.source || {}
  const checks = source.checks || {}
  const quality = source.quality || {}
  let score = source.service === 'qqmusic' ? 0 : 5
  score += Number(quality.version || quality.quality_version || 0) * 50
  for (const value of Object.values(checks)) {
    if (value === true) score += 2
    else if (value === false) score -= 5
  }
  if (checks.lyrics_online === true) score += 10
  const parentheticals = [...String(song.title || '').matchAll(/\(([^)]*)\)/g)]
    .map(match => normalizeIdentityPart(match[1]))
    .filter(Boolean)
  score -= parentheticals.length - new Set(parentheticals).size
  return score
}

async function findTypingManiaFiles (directory, root, output = []) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return output
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue
    }
    if (entry.isDirectory()) {
      if ([...EXCLUDED_DIRECTORIES].some(name => (
        name.toLocaleLowerCase() === entry.name.toLocaleLowerCase()
      ))) {
        continue
      }
      await findTypingManiaFiles(path.join(directory, entry.name), root, output)
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.typingmania')) {
      const filename = path.join(directory, entry.name)
      const relative = path.relative(root, filename)
      if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
        output.push(filename)
      }
    }
  }
  return output
}

function isSafeLibraryFile (root, filename) {
  const relative = path.relative(root, filename)
  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return false
  }
  return !relative
    .split(path.sep)
    .some(segment => segment.toLocaleLowerCase() === 'qqmusiccache')
}

const RESET_ARTIFACT_PATHS = [
  ['data', 'qqmusic'],
  ['data', 'trial-itsaetara'],
  ['data', 'qqmusic-origin-cache.json'],
  ['data', 'qqmusic-artist-cache.json'],
  ['data', 'cover-refresh.out.log'],
  ['data', 'cover-refresh.err.log'],
]

async function existingResetArtifacts (root) {
  const artifacts = []
  for (const parts of RESET_ARTIFACT_PATHS) {
    const filename = path.join(root, ...parts)
    try {
      const stat = await fs.stat(filename)
      artifacts.push({
        filename,
        relative: path.relative(root, filename),
        bytes: stat.isFile() ? stat.size : 0,
      })
    } catch {}
  }
  return artifacts
}

export async function inspectResettableLibrary (root) {
  const resolvedRoot = path.resolve(root)
  const files = await findTypingManiaFiles(resolvedRoot, resolvedRoot)
  const songs = []
  for (const filename of files) {
    if (
      !isSafeLibraryFile(resolvedRoot, filename) ||
      isBaselineSongPath(resolvedRoot, filename)
    ) {
      continue
    }
    try {
      const stat = await fs.stat(filename)
      if (!stat.isFile()) continue
      let title = ''
      let source = ''
      try {
        const metadata = await readPackedSongMetadata(filename)
        title = String(metadata.title || '')
        source = String(metadata.source?.service || '')
      } catch {}
      songs.push({
        filename,
        relative: path.relative(resolvedRoot, filename),
        bytes: stat.size,
        title,
        source,
      })
    } catch {}
  }
  const artifacts = await existingResetArtifacts(resolvedRoot)
  return {
    songs,
    count: songs.length,
    bytes: songs.reduce((total, song) => total + song.bytes, 0),
    artifacts,
    hasChanges: songs.length > 0 || artifacts.length > 0,
  }
}

export async function resetLibraryToBaseline (root) {
  const resolvedRoot = path.resolve(root)
  const baseline = await ensureLibraryBaseline(resolvedRoot)
  const before = await inspectResettableLibrary(resolvedRoot)

  for (const song of before.songs) {
    if (
      isSafeLibraryFile(resolvedRoot, song.filename) &&
      !isBaselineSongPath(resolvedRoot, song.filename)
    ) {
      await fs.rm(song.filename, { force: true }).catch(() => {})
    }
  }
  for (const parts of RESET_ARTIFACT_PATHS) {
    await fs.rm(
      path.join(resolvedRoot, ...parts),
      { recursive: true, force: true },
    ).catch(() => {})
  }

  const after = await inspectResettableLibrary(resolvedRoot)
  const library = await rebuildSongIndex(resolvedRoot)
  const baselineRecords = LIBRARY_BASELINE.songs.map(song => (
    library.records.find(record => (
      record.url === song.relativePath &&
      record.source?.service === song.sourceService
    ))
  ))
  const restored = Boolean(
    baselineRecords.every(Boolean) &&
    library.records.length === LIBRARY_BASELINE.songs.length &&
    library.errors.length === 0 &&
    after.count === 0 &&
    after.artifacts.length === 0
  )

  return {
    baselineVersion: LIBRARY_BASELINE.version,
    baselineRepaired: baseline.repaired,
    deleted: Math.max(0, before.count - after.count),
    deletedBytes: Math.max(0, before.bytes - after.bytes),
    removedArtifacts: Math.max(0, before.artifacts.length - after.artifacts.length),
    failed: after.count + after.artifacts.length,
    remaining: after.count,
    restored,
  }
}

function browserPath (root, filename) {
  return path.relative(root, filename)
    .split(path.sep)
    .map(segment => encodeURIComponent(segment))
    .join('/')
}

export async function scanSongLibrary (root) {
  const files = await findTypingManiaFiles(root, root)
  files.sort((left, right) => left.localeCompare(right))

  const records = []
  const errors = []
  for (const filename of files) {
    try {
      const song = await readPackedSongMetadata(filename)
      const identity = songIdentity(song)
      const packageUrl = browserPath(root, filename)
      const artworkUrl = kind => (
        `/api/local/song-artwork?src=${encodeURIComponent(packageUrl)}` +
        `&kind=${kind}`
      )
      const hasPoster = Boolean(song.poster)
      const candidate = {
        ...song,
        url: packageUrl,
        preview_image_url: artworkUrl(hasPoster ? 'poster' : 'image'),
        preview_album_url: hasPoster ? artworkUrl('image') : '',
        preview_image_is_poster: hasPoster,
        _local_filename: filename,
        _identity: identity,
      }
      const duplicateIndex = records.findIndex(record => (
        record._identity === identity || songsAreEquivalent(record, candidate)
      ))
      if (duplicateIndex < 0) {
        records.push(candidate)
      } else if (songQualityScore(candidate) > songQualityScore(records[duplicateIndex])) {
        records[duplicateIndex] = candidate
      }
    } catch (error) {
      errors.push({ filename, error: error.message })
    }
  }

  records.sort((left, right) => {
    return String(left.artist || '').localeCompare(String(right.artist || '')) ||
      String(left.title || '').localeCompare(String(right.title || ''))
  })
  return { records, errors, scannedFiles: files.length }
}

export function makeSongsIndex (records) {
  const clean = record => {
    const song = { ...record }
    delete song._local_filename
    delete song._identity
    return song
  }

  const regular = records.filter(record => record.source?.service !== 'qqmusic').map(clean)
  const qqmusic = records
    .filter(record => record.source?.service === 'qqmusic')
    .sort((left, right) => {
      const leftAdded = Date.parse(
        left.source?.imported_at || left.source?.verified_at || '',
      ) || 0
      const rightAdded = Date.parse(
        right.source?.imported_at || right.source?.verified_at || '',
      ) || 0
      return leftAdded - rightAdded ||
        String(left._local_filename || '').localeCompare(
          String(right._local_filename || ''),
        )
    })
    .map(clean)
  if (qqmusic.length) {
    regular.push({
      type: 'collection',
      name: 'QQ Music',
      description: 'Songs imported locally from QQ Music cache.',
      translations: {
        zh: {
          name: 'QQ音乐',
          description: '从QQ音乐缓存导入到本地的歌曲。',
        },
        en: {
          name: 'QQ Music',
          description: 'Songs imported locally from QQ Music cache.',
        },
        ja: {
          name: 'QQ Music',
          description: 'QQ Musicのキャッシュからローカルに取り込んだ曲です。',
        },
      },
      contents: qqmusic,
    })
  }
  return regular
}

export async function rebuildSongIndex (root) {
  const library = await scanSongLibrary(root)
  const index = makeSongsIndex(library.records)
  const dataDirectory = path.join(root, 'data')
  await fs.mkdir(dataDirectory, { recursive: true })
  await fs.writeFile(path.join(dataDirectory, 'songs.json'), JSON.stringify(index), 'utf8')
  return { ...library, index }
}

export { exactArrayBuffer, readPackedSongMetadata }
