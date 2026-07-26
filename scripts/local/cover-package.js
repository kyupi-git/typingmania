import fs from 'fs/promises'

import PackedFile from '../../src/lib/packedfile.js'
import { POSTER_SELECTION_VERSION } from './media-poster.js'

export const COVER_SELECTION_VERSION = 3

function posterSourceInfo (
  posterResolution,
  previous = {},
) {
  const poster = posterResolution?.poster || null
  const posterChecked = Boolean(posterResolution?.checked)
  if (!posterChecked) {
    return {
      poster_version: Number(previous.poster_version || 0),
      poster_checked: false,
      poster_available: Boolean(previous.poster_available),
      poster_source: previous.poster_source || '',
      poster_catalog: previous.poster_catalog || '',
      poster_catalog_id: previous.poster_catalog_id || '',
      poster_work_title: previous.poster_work_title || '',
      poster_identity_verified:
        Boolean(previous.poster_identity_verified),
      poster_checked_at: previous.poster_checked_at || '',
    }
  }
  return {
    poster_version: POSTER_SELECTION_VERSION,
    poster_checked: true,
    poster_available: Boolean(poster),
    poster_source: poster?.source || '',
    poster_catalog: poster?.catalog || '',
    poster_catalog_id: poster?.catalogId || '',
    poster_work_title: poster?.workTitle || '',
    poster_identity_verified: Boolean(poster?.identityVerified),
    poster_checked_at: poster?.checkedAt || new Date().toISOString(),
  }
}

export function coverSourceInfo (
  cover,
  posterResolution = { checked: true, poster: null },
  previous = {},
) {
  return {
    version: COVER_SELECTION_VERSION,
    strategy: cover.strategy,
    album_mid: cover.albumMid,
    album: cover.album,
    anime_related: cover.animeRelated,
    verified_online: cover.verifiedOnline,
    ...posterSourceInfo(posterResolution, previous),
  }
}

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

export async function refreshPackedSongCover (
  existingSong,
  cover,
  posterResolution = { checked: true, poster: null },
) {
  const input = await fs.readFile(existingSong._local_filename)
  const packed = new PackedFile()
  const output = new PackedFile()
  const encoder = new TextEncoder()
  const temporary = `${existingSong._local_filename}.${process.pid}.tmp`
  const backup = `${existingSong._local_filename}.${process.pid}.cover-backup`
  try {
    packed.unpackFromBuffer(exactArrayBuffer(input))
    const song = JSON.parse(packed.getAsText('song.json'))
    const oldImage = song.image
    const oldPoster = song.poster || ''
    const imageName = `cover${cover.extension}`
    const poster = posterResolution?.poster || null
    const posterName = poster ? `poster${poster.extension}` : ''
    song.image = imageName
    if (poster) {
      song.poster = posterName
    } else if (posterResolution?.checked) {
      delete song.poster
    }
    song.source = song.source || {}
    song.source.checks = {
      ...(song.source.checks || {}),
      cover_online: cover.verifiedOnline,
    }
    song.source.cover = coverSourceInfo(
      cover,
      posterResolution,
      song.source.cover || {},
    )

    for (let index = 0; index < packed.file_count; index++) {
      const name = packed.file_name[index]
      if (
        name === 'song.json' ||
        name === oldImage ||
        name === imageName ||
        (oldPoster && name === oldPoster) ||
        (posterName && name === posterName)
      ) continue
      output.addFile(name, new Uint8Array(packed.file_buffer[index]))
    }
    output.addFile('song.json', encoder.encode(JSON.stringify(song)))
    output.addFile(imageName, cover.buffer)
    if (poster) {
      output.addFile(posterName, poster.buffer)
    } else if (!posterResolution?.checked && oldPoster && packed.hasFile(oldPoster)) {
      output.addFile(oldPoster, new Uint8Array(packed.getFileAsBuffer(oldPoster)))
    }
    await fs.writeFile(temporary, Buffer.from(output.pack()))
    await fs.rename(existingSong._local_filename, backup)
    try {
      await fs.rename(temporary, existingSong._local_filename)
      await fs.rm(backup, { force: true }).catch(() => {})
    } catch (error) {
      await fs.rename(backup, existingSong._local_filename).catch(() => {})
      throw error
    }
    return { ...existingSong, ...song }
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    try {
      await fs.access(existingSong._local_filename)
    } catch {
      await fs.rename(backup, existingSong._local_filename).catch(() => {})
    }
    throw error
  } finally {
    packed.destroy()
    output.destroy()
  }
}

export async function refreshPackedSongPoster (
  existingSong,
  posterResolution,
) {
  if (!posterResolution?.checked) return existingSong
  const filename = existingSong._local_filename
  const input = await fs.readFile(filename)
  const packed = new PackedFile()
  const output = new PackedFile()
  const encoder = new TextEncoder()
  const temporary = `${filename}.${process.pid}.tmp`
  const backup = `${filename}.${process.pid}.poster-backup`
  try {
    packed.unpackFromBuffer(exactArrayBuffer(input))
    const song = JSON.parse(packed.getAsText('song.json'))
    const oldPoster = song.poster || ''
    const poster = posterResolution.poster || null
    const posterName = poster ? `poster${poster.extension}` : ''
    if (poster) {
      song.poster = posterName
    } else {
      delete song.poster
    }
    song.source = song.source || {}
    song.source.checks = {
      ...(song.source.checks || {}),
      poster_online: poster ? Boolean(poster.verifiedOnline) : false,
    }
    song.source.cover = {
      ...(song.source.cover || {}),
      version: COVER_SELECTION_VERSION,
      ...posterSourceInfo(
        posterResolution,
        song.source.cover || {},
      ),
    }

    for (let index = 0; index < packed.file_count; index++) {
      const name = packed.file_name[index]
      if (
        name === 'song.json' ||
        (oldPoster && name === oldPoster) ||
        (posterName && name === posterName)
      ) continue
      output.addFile(name, new Uint8Array(packed.file_buffer[index]))
    }
    output.addFile('song.json', encoder.encode(JSON.stringify(song)))
    if (poster) output.addFile(posterName, poster.buffer)

    await fs.writeFile(temporary, Buffer.from(output.pack()))
    await fs.rename(filename, backup)
    try {
      await fs.rename(temporary, filename)
      await fs.rm(backup, { force: true }).catch(() => {})
    } catch (error) {
      await fs.rename(backup, filename).catch(() => {})
      throw error
    }
    return { ...existingSong, ...song }
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    try {
      await fs.access(filename)
    } catch {
      await fs.rename(backup, filename).catch(() => {})
    }
    throw error
  } finally {
    packed.destroy()
    output.destroy()
  }
}
