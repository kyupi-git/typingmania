import fs from 'fs/promises'
import path from 'path'

const MAX_FILE_TABLE_BYTES = 64 * 1024
const MAX_METADATA_BYTES = 1024 * 1024
const MAX_ARTWORK_BYTES = 20 * 1024 * 1024
const MAX_TEXT_ENTRY_BYTES = 8 * 1024 * 1024
const MAX_MEDIA_ENTRY_BYTES = 1024 * 1024 * 1024

const ARTWORK_MIME_TYPES = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

async function readFileTable (handle) {
  const stat = await handle.stat()
  const header = Buffer.alloc(Math.min(stat.size, MAX_FILE_TABLE_BYTES))
  const { bytesRead } = await handle.read(header, 0, header.length, 0)
  const data = header.subarray(0, bytesRead)

  if (data.length < 16 || data.toString('ascii', 0, 4) !== 'TPMN') {
    throw new Error('invalid TPMN signature')
  }
  if (
    data.readUInt32LE(4) !== stat.size - 8 ||
    data.toString('ascii', 8, 12) !== 'LIST'
  ) {
    throw new Error('invalid TPMN header')
  }

  const count = data.readUInt32LE(12)
  const entries = new Map()
  let offset = 16
  for (let index = 0; index < count; index++) {
    if (offset + 1 > data.length) {
      throw new Error('TPMN file table is too large')
    }
    const nameLength = data.readUInt8(offset)
    offset += 1
    if (offset + nameLength + 8 > data.length) {
      throw new Error('truncated TPMN file table')
    }
    const name = data.toString('utf8', offset, offset + nameLength)
    offset += nameLength
    const fileOffset = data.readUInt32LE(offset)
    const fileLength = data.readUInt32LE(offset + 4)
    offset += 8
    if (
      fileOffset < 0 ||
      fileLength < 0 ||
      fileOffset + fileLength > stat.size
    ) {
      throw new Error(`invalid TPMN entry: ${name}`)
    }
    entries.set(name, { offset: fileOffset, length: fileLength })
  }
  return entries
}

async function readEntry (handle, entries, name, maxBytes) {
  const entry = entries.get(name)
  if (!entry || entry.length > maxBytes) {
    throw new Error(`packed song entry is missing or invalid: ${name}`)
  }
  const value = Buffer.alloc(entry.length)
  const result = await handle.read(value, 0, value.length, entry.offset)
  if (result.bytesRead !== value.length) {
    throw new Error(`truncated packed song entry: ${name}`)
  }
  return value
}

export async function readPackedSongMetadata (filename) {
  const handle = await fs.open(filename, 'r')
  try {
    const entries = await readFileTable(handle)
    const json = await readEntry(
      handle,
      entries,
      'song.json',
      MAX_METADATA_BYTES,
    )
    return JSON.parse(json.toString('utf8'))
  } finally {
    await handle.close()
  }
}

export async function readPackedSongManifest (filename) {
  const handle = await fs.open(filename, 'r')
  try {
    const entries = await readFileTable(handle)
    const json = await readEntry(
      handle,
      entries,
      'song.json',
      MAX_METADATA_BYTES,
    )
    return {
      metadata: JSON.parse(json.toString('utf8')),
      entries: Object.fromEntries(
        [...entries].map(([name, entry]) => [name, entry.length]),
      ),
    }
  } finally {
    await handle.close()
  }
}

export async function readPackedSongText (
  filename,
  entryName,
  maxBytes = MAX_TEXT_ENTRY_BYTES,
) {
  const handle = await fs.open(filename, 'r')
  try {
    const entries = await readFileTable(handle)
    return (await readEntry(
      handle,
      entries,
      String(entryName || ''),
      Math.max(1, Number(maxBytes) || MAX_TEXT_ENTRY_BYTES),
    )).toString('utf8')
  } finally {
    await handle.close()
  }
}

export async function readPackedSongBinary (
  filename,
  entryName,
  maxBytes = MAX_MEDIA_ENTRY_BYTES,
) {
  const handle = await fs.open(filename, 'r')
  try {
    const entries = await readFileTable(handle)
    return await readEntry(
      handle,
      entries,
      String(entryName || ''),
      Math.max(1, Number(maxBytes) || MAX_MEDIA_ENTRY_BYTES),
    )
  } finally {
    await handle.close()
  }
}

export async function readPackedSongArtwork (filename, kind = 'poster') {
  const handle = await fs.open(filename, 'r')
  try {
    const entries = await readFileTable(handle)
    const json = await readEntry(
      handle,
      entries,
      'song.json',
      MAX_METADATA_BYTES,
    )
    const metadata = JSON.parse(json.toString('utf8'))
    const field = kind === 'image' ? 'image' : 'poster'
    const entryName = String(metadata[field] || '')
    const mimeType = ARTWORK_MIME_TYPES[
      path.extname(entryName).toLocaleLowerCase()
    ]
    if (!entryName || !mimeType) {
      throw new Error(`${field} artwork is unavailable`)
    }
    return {
      buffer: await readEntry(
        handle,
        entries,
        entryName,
        MAX_ARTWORK_BYTES,
      ),
      entryName,
      mimeType,
    }
  } finally {
    await handle.close()
  }
}
