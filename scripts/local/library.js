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
import {
  readPackedSongMetadata,
  readPackedSongText,
} from './packed-song-reader.js'
import {
  needsOriginalNameDetail,
  ORIGINAL_ARTIST_VERSION,
  isLikelyArtistName,
  normalizeArtistCredits,
} from './original-artist.js'
import { assertOriginalLyricLayer } from './pronunciation.js'
import { estimateAssistReferencePace } from '../../src/util/song-meta.js'

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
  'assets',
  'docs',
  'game',
  'import-staging',
  'latin-table',
  'mv-cache',
  'node_modules',
  'QQMusicCache',
  'runtime',
  'scripts',
  'src',
  'tools',
  'upload-sessions',
  'vendor',
])
const IMPORT_SERVICES = new Set([
  'applemusic',
  'apple-music',
  'local',
  'local-files',
  'netease',
  'qqmusic',
])

function displayedLyricRows (lyricsCsv) {
  return String(lyricsCsv || '')
    .split(/\r?\n/u)
    .filter(row => row.trim())
    .map(row => {
      const [, , ...parts] = row.split(',')
      const lyric = parts.join(',')
      const explicit = lyric.match(/^<<([\s\S]*)>>\[[\s\S]*\]$/u)
      return { text: String(explicit?.[1] || lyric).replace(/\\([\\<>\[\]])/gu, '$1') }
    })
}

export function sanitizeUnverifiedImportedArtists (song) {
  if (!IMPORT_SERVICES.has(song?.source?.service)) return song
  const resolution = song.source?.artist_resolution
  if (
    Number(resolution?.version || 0) >= ORIGINAL_ARTIST_VERSION &&
    resolution?.resolved === true
  ) return song
  const resolutionArtists = Array.isArray(resolution?.artists)
    ? resolution.artists.map(item => item?.raw_name || item?.rawName).filter(Boolean)
    : []
  const candidates = normalizeArtistCredits(
    resolutionArtists.length
      ? resolutionArtists
      : (song.artistNames?.length ? song.artistNames : String(song.artist || '')),
  ).filter(isLikelyArtistName)
  const source = {
    ...(song.source || {}),
    artist_resolution: {
      ...(resolution || {}),
      version: Math.max(Number(resolution?.version || 0), ORIGINAL_ARTIST_VERSION),
      status: 'pending',
      resolved: false,
      artists: candidates.map((name, index) => ({
        ...(resolution?.artists?.[index] || {}),
        raw_name: name,
        original_name: '',
        resolved: false,
        source: resolution?.artists?.[index]?.source || 'pending-raw-artist',
      })),
    },
    checks: { ...(song.source?.checks || {}), artist_original: false },
  }
  if (!candidates.length) {
    if (!song.artist && !song.artistNames?.length) return song
    return { ...song, artist: '', artistNames: [], rawArtistNames: [], source }
  }
  if (song.artist === candidates.join(' / ') &&
      song.source?.artist_resolution?.status === 'pending') return song
  return {
    ...song,
    artist: candidates.join(' / '),
    artistNames: candidates,
    rawArtistNames: candidates,
    source,
  }
}

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
  if (source.service && source.track_id) {
    return `${source.service}:${source.track_id}`
  }
  return songContentIdentity(song)
}

export function songQualityScore (song) {
  const source = song.source || {}
  const checks = source.checks || {}
  const quality = source.quality || {}
  let score = ['qqmusic', 'netease', 'apple-music'].includes(source.service)
    ? 0
    : 5
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
  ['data', 'netease'],
  ['data', 'apple-music'],
  ['data', 'local-files'],
  ['data', 'mv-cache'],
  ['data', 'upload-sessions'],
  ['data', 'import-staging'],
  ['data', 'trial-itsaetara'],
  ['data', 'song-origin-cache.json'],
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

export async function scanSongPackages (root) {
  const files = await findTypingManiaFiles(root, root)
  files.sort((left, right) => left.localeCompare(right))

  const records = []
  const errors = []
  for (const filename of files) {
    try {
      let song = await readPackedSongMetadata(filename)
      song = sanitizeUnverifiedImportedArtists(song)
      let lyricsCsv = ''
      if (IMPORT_SERVICES.has(song.source?.service)) {
        lyricsCsv = await readPackedSongText(filename, 'lyrics.csv')
        assertOriginalLyricLayer(song, displayedLyricRows(lyricsCsv))
      }
      if (
        !Number.isFinite(Number(song.assist_cpm)) ||
        !Number.isFinite(Number(song.assist_max_cpm))
      ) {
        lyricsCsv ||= await readPackedSongText(filename, 'lyrics.csv')
        const assistPace = estimateAssistReferencePace(
          lyricsCsv,
          song.language,
          { durationMs: Number(song.duration) * 1000 },
        )
        song.assist_cpm = assistPace.averageCpm
        song.assist_max_cpm = assistPace.peakCpm
      }
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
      records.push(candidate)
    } catch (error) {
      errors.push({ filename, error: error.message })
    }
  }

  return { records, errors, scannedFiles: files.length }
}

export async function scanSongLibrary (root) {
  const scanned = await scanSongPackages(root)
  const records = []
  for (const candidate of scanned.records) {
    const duplicateIndex = records.findIndex(record => (
      record._identity === candidate._identity ||
      songsAreEquivalent(record, candidate)
    ))
    if (duplicateIndex < 0) {
      records.push(candidate)
    } else if (
      songQualityScore(candidate) > songQualityScore(records[duplicateIndex])
    ) {
      records[duplicateIndex] = candidate
    }
  }
  records.sort((left, right) => {
    return String(left.artist || '').localeCompare(String(right.artist || '')) ||
      String(left.title || '').localeCompare(String(right.title || ''))
  })
  return { ...scanned, records }
}

export function makeSongsIndex (records) {
  const clean = record => {
    const song = { ...record }
    delete song._local_filename
    delete song._identity
    return song
  }

  const providers = [
    {
      service: 'qqmusic',
      name: 'QQ Music',
      description: 'Songs imported from QQ Music cache and downloads.',
      translations: {
        zh: { name: 'QQ音乐', description: '从 QQ 音乐缓存和下载中导入的歌曲。' },
        en: { name: 'QQ Music', description: 'Songs imported from QQ Music cache and downloads.' },
        ja: { name: 'QQ Music', description: 'QQ Musicのキャッシュとダウンロードから取り込んだ曲です。' },
      },
      preview_image_url: 'assets/provider-art/qqmusic.svg',
    },
    {
      service: 'netease',
      name: 'NetEase Cloud Music',
      description: 'Songs imported from complete NetEase downloads and cache.',
      translations: {
        zh: { name: '网易云音乐', description: '从网易云音乐完整下载和缓存中导入的歌曲。' },
        en: { name: 'NetEase Cloud Music', description: 'Songs imported from complete NetEase downloads and cache.' },
        ja: { name: 'NetEase Cloud Music', description: 'NetEaseの完全なダウンロードとキャッシュから取り込んだ曲です。' },
      },
      preview_image_url: 'assets/provider-art/netease.svg',
    },
    {
      service: 'apple-music',
      name: 'Apple Music',
      description: 'Songs imported through an authorized Apple Music session.',
      translations: {
        zh: { name: 'Apple Music', description: '通过已授权 Apple Music 会话导入的歌曲。' },
        en: { name: 'Apple Music', description: 'Songs imported through an authorized Apple Music session.' },
        ja: { name: 'Apple Music', description: '認証済みApple Musicセッションから取り込んだ曲です。' },
      },
      preview_image_url: 'assets/provider-art/apple-music.svg',
    },
    {
      service: 'local-files',
      name: 'Local Folder',
      description: 'Songs copied from a folder and verified locally.',
      translations: {
        zh: { name: '本地文件夹', description: '从所选文件夹复制、匹配并校验的歌曲。' },
        en: { name: 'Local Folder', description: 'Songs copied from a folder and verified locally.' },
        ja: { name: 'ローカルフォルダー', description: '選択したフォルダーからコピーし、照合・検証した曲です。' },
      },
      preview_image_url: 'assets/provider-art/local-files.svg',
    },
  ]
  const providerServices = new Set(providers.map(provider => provider.service))
  const regular = records
    .filter(record => !providerServices.has(record.source?.service))
    .map(clean)
  for (const provider of providers) {
    const imported = records
      .filter(record => record.source?.service === provider.service)
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
    if (!imported.length) continue
    regular.push({
      type: 'collection',
      name: provider.name,
      description: provider.description,
      translations: provider.translations,
      preview_image_url: provider.preview_image_url,
      preview_image_is_poster: false,
      contents: imported,
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
