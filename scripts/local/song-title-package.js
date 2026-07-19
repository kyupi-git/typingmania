import fs from 'fs/promises'

import PackedFile from '../../src/lib/packedfile.js'
import { SONG_TITLE_CLEANUP_VERSION } from '../../src/song/song-title.js'

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

export async function refreshPackedSongTitle (existingSong, analysis) {
  const input = await fs.readFile(existingSong._local_filename)
  const packed = new PackedFile()
  const output = new PackedFile()
  const encoder = new TextEncoder()
  const temporary = `${existingSong._local_filename}.${process.pid}.tmp`
  const backup = `${existingSong._local_filename}.${process.pid}.title-backup`
  try {
    packed.unpackFromBuffer(exactArrayBuffer(input))
    const song = JSON.parse(packed.getAsText('song.json'))
    const previousTitle = String(song.title || '')
    song.title = analysis.title
    if (!song.latin_title || song.latin_title === previousTitle) {
      song.latin_title = analysis.title
    }
    song.source = song.source || {}
    song.source.title_cleanup = {
      version: SONG_TITLE_CLEANUP_VERSION,
    }
    song.source.checks = {
      ...(song.source.checks || {}),
      title_original: true,
    }

    for (let index = 0; index < packed.file_count; index++) {
      const name = packed.file_name[index]
      if (name === 'song.json') continue
      output.addFile(name, new Uint8Array(packed.file_buffer[index]))
    }
    output.addFile('song.json', encoder.encode(JSON.stringify(song)))
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
