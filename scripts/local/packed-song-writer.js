import fs from 'node:fs/promises'

import PackedFile from '../../src/lib/packedfile.js'

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
}

export async function rewritePackedSongMetadata (
  existingSong,
  mutate,
  { operation = 'metadata' } = {},
) {
  const filename = existingSong?._local_filename
  if (!filename) throw new Error('Packed song filename is unavailable')
  const input = await fs.readFile(filename)
  const packed = new PackedFile()
  const output = new PackedFile()
  const encoder = new TextEncoder()
  const temporary = `${filename}.${process.pid}.tmp`
  const backup = `${filename}.${process.pid}.${operation}-backup`
  try {
    packed.unpackFromBuffer(exactArrayBuffer(input))
    const song = JSON.parse(packed.getAsText('song.json'))
    const changed = await mutate(song)
    if (changed === false) return existingSong

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
