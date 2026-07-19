import fs from 'fs/promises'

import PackedFile from '../../src/lib/packedfile.js'
import { ORIGINAL_ARTIST_VERSION } from './original-artist.js'

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

export function artistResolutionSourceInfo (resolution) {
  return {
    version: ORIGINAL_ARTIST_VERSION,
    resolved: Boolean(resolution?.resolved),
    checked_at: resolution?.checkedAt || new Date().toISOString(),
    artists: (resolution?.artists || []).map(artist => ({
      singer_mid: artist.singerMid || '',
      singer_id: Number(artist.singerId) || 0,
      raw_name: artist.rawName || '',
      original_name: artist.originalName || '',
      resolved: Boolean(artist.resolved),
      source: artist.source || '',
      confidence: Number(artist.confidence) || 0,
    })),
  }
}

export async function refreshPackedSongArtist (existingSong, resolution) {
  const filename = existingSong._local_filename
  const input = await fs.readFile(filename)
  const packed = new PackedFile()
  const output = new PackedFile()
  const encoder = new TextEncoder()
  const temporary = `${filename}.${process.pid}.tmp`
  const backup = `${filename}.${process.pid}.artist-backup`
  try {
    packed.unpackFromBuffer(exactArrayBuffer(input))
    const song = JSON.parse(packed.getAsText('song.json'))
    const previousArtist = String(song.artist || '')
    song.artist = String(resolution.artist || '')
    if (!song.latin_artist || song.latin_artist === previousArtist) {
      song.latin_artist = song.artist
    }
    song.source = song.source || {}
    song.source.artist_resolution = artistResolutionSourceInfo(resolution)
    song.source.checks = {
      ...(song.source.checks || {}),
      artist_original: Boolean(resolution.resolved),
    }

    for (let index = 0; index < packed.file_count; index++) {
      const name = packed.file_name[index]
      if (name === 'song.json') continue
      output.addFile(name, new Uint8Array(packed.file_buffer[index]))
    }
    output.addFile('song.json', encoder.encode(JSON.stringify(song)))
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
