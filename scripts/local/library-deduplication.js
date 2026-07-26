import path from 'node:path'

import { catalogTextSimilarity } from './catalog-identity.js'
import {
  scanSongPackages,
  songQualityScore,
} from './library.js'
import { isBaselineSongPath } from './library-baseline.js'

const DEDUPE_SERVICES = new Set([
  'qqmusic',
  'netease',
  'apple-music',
  'local-files',
])

function normalized (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function providerTrackId (song) {
  const source = song.source || {}
  return String(
    source.song_mid ||
    source.track_id ||
    source.netease_track_id ||
    source.apple_music_track_id ||
    '',
  )
}

function similarWithinProvider (left, right) {
  if (left.source?.service !== right.source?.service) return false
  const leftId = providerTrackId(left)
  const rightId = providerTrackId(right)
  if (leftId && rightId && leftId === rightId) return true

  const titleSimilarity = catalogTextSimilarity(left.title, right.title)
  const artistSimilarity = catalogTextSimilarity(left.artist, right.artist)
  if (titleSimilarity < 0.92 || artistSimilarity < 0.86) return false

  const leftDuration = Number(left.duration) || 0
  const rightDuration = Number(right.duration) || 0
  if (!leftDuration || !rightDuration) return titleSimilarity >= 0.97
  const tolerance = Math.max(4, Math.min(leftDuration, rightDuration) * 0.025)
  return Math.abs(leftDuration - rightDuration) <= tolerance
}

function connectedGroups (songs) {
  const parents = songs.map((_, index) => index)
  const find = index => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]]
      index = parents[index]
    }
    return index
  }
  const join = (left, right) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
  }
  for (let left = 0; left < songs.length; left++) {
    for (let right = left + 1; right < songs.length; right++) {
      if (similarWithinProvider(songs[left], songs[right])) join(left, right)
    }
  }
  const groups = new Map()
  for (let index = 0; index < songs.length; index++) {
    const root = find(index)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(songs[index])
  }
  return [...groups.values()].filter(group => group.length > 1)
}

function duplicateRecord (song, group, reference) {
  return {
    id: song.url,
    title: String(song.title || ''),
    artist: String(song.artist || ''),
    language: String(song.language || ''),
    source: String(song.source?.service || ''),
    group,
    duplicateOf: String(reference.title || ''),
    duration: Number(song.duration) || 0,
  }
}

export async function inspectLibraryDuplicates (root) {
  const resolvedRoot = path.resolve(root)
  const scanned = await scanSongPackages(resolvedRoot)
  const songs = scanned.records.filter(song => (
    song._local_filename &&
    DEDUPE_SERVICES.has(song.source?.service) &&
    !isBaselineSongPath(resolvedRoot, song._local_filename)
  ))
  const serviceGroups = new Map()
  for (const song of songs) {
    const service = song.source.service
    if (!serviceGroups.has(service)) serviceGroups.set(service, [])
    serviceGroups.get(service).push(song)
  }

  const groups = []
  let ordinal = 0
  for (const [service, serviceSongs] of serviceGroups) {
    for (const candidates of connectedGroups(serviceSongs)) {
      const ranked = [...candidates].sort((left, right) => (
        songQualityScore(right) - songQualityScore(left) ||
        String(left.url).localeCompare(String(right.url))
      ))
      const reference = ranked[0]
      const group = `${service}-${++ordinal}`
      groups.push({
        id: group,
        service,
        title: reference.title,
        reference: duplicateRecord(reference, group, reference),
        removable: ranked.slice(1).map(song => (
          duplicateRecord(song, group, reference)
        )),
      })
    }
  }
  const removable = groups.flatMap(group => group.removable)
  removable.sort((left, right) => (
    normalized(left.source).localeCompare(normalized(right.source)) ||
    normalized(left.duplicateOf).localeCompare(normalized(right.duplicateOf)) ||
    normalized(left.title).localeCompare(normalized(right.title))
  ))
  return {
    groups,
    songs: removable,
    groupCount: groups.length,
    removableCount: removable.length,
  }
}
